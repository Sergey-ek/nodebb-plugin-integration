"use strict";

const crypto = require("node:crypto");
const Meta = require("../nodebb/meta");
const Discovery = require("../oauth/discovery");
const ClientMetadataFetcher = require("../oauth/client-metadata-fetcher");
const ClientMetadata = require("../oauth/client-metadata");
const OAuthStorage = require("../oauth/storage/runtime");
const Tokens = require("../oauth/tokens");
const PKCE = require("../oauth/pkce");
const Permissions = require("../oauth/permissions");
const ClientFingerprint = require("../oauth/client-fingerprint");

const SCOPES = Object.freeze(["mcp"]);
const MAX_STATE_LENGTH = 1024;
const CONSENT_TRANSACTION_TTL = 300;
const CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const REFRESH_TOKEN_PATTERN = /^([a-f0-9]{32})\.([A-Za-z0-9_-]{43})$/;

function setNoStore(res) {
    res.set("Cache-Control", "no-store");
    res.set("Pragma", "no-cache");
}

function oauthError(res, status, error) {
    setNoStore(res);
    return res.status(status).json({ error });
}

function getSingleParam(params, name, required = true) {
    const values = params.getAll(name);

    if (values.length === 0) {
        return required ? null : { valid: true, value: undefined };
    }

    if (values.length !== 1) {
        return required ? null : { valid: false };
    }

    return required ? values[0] : { valid: true, value: values[0] };
}

function getRequestUrl(req) {
    const target = req.url || req.originalUrl;

    if (
        typeof target !== "string" ||
        !target.startsWith("/") ||
        target.startsWith("//") ||
        target.includes("\\")
    ) {
        return null;
    }

    try {
        const url = new URL(target, "http://nodebb.invalid");

        if (
            url.origin !== "http://nodebb.invalid" ||
            url.pathname !== "/oauth/authorize"
        ) {
            return null;
        }

        return url;
    } catch {
        return null;
    }
}

function hasBrowserSession(req) {
    if (req.headers && req.headers.authorization) {
        return false;
    }

    const uid = Number(req.user && req.user.uid);
    const requestUid = Number(req.uid);
    const sessionUid = Number(
        req.session &&
        req.session.passport &&
        req.session.passport.user
    );

    return typeof req.sessionID === "string" &&
        req.sessionID.length > 0 &&
        req.sessionID.length <= 256 &&
        Number.isInteger(uid) &&
        uid > 0 &&
        uid === requestUid &&
        uid === sessionUid &&
        req.loggedIn === true;
}

function createSessionBindingHash(req) {
    if (
        !req ||
        typeof req.sessionID !== "string" ||
        req.sessionID.length === 0 ||
        req.sessionID.length > 256
    ) {
        throw new TypeError("A valid browser session ID is required");
    }

    return crypto.createHash("sha256")
        .update(req.sessionID, "utf8")
        .digest("hex");
}

function redirectToLogin(req, res, requestUrl) {
    if (!req.session || typeof req.session.save !== "function") {
        return oauthError(res, 500, "server_error");
    }

    let relativePath;

    try {
        const nconf = nodebb.require("nconf");
        relativePath = String(nconf.get("relative_path") || "");
    } catch (error) {
        console.error("[Integration] Cannot resolve NodeBB login path:", error);
        return oauthError(res, 500, "server_error");
    }

    relativePath = relativePath.replace(/\/+$/, "");
    req.session.returnTo = `${requestUrl.pathname}${requestUrl.search}`;

    return req.session.save(error => {
        if (error) {
            console.error("[Integration] Cannot save OAuth login return path:", error);
            return oauthError(res, 500, "server_error");
        }

        setNoStore(res);
        return res.redirect(302, `${relativePath}/login`);
    });
}

function redirectOAuthError(res, redirectUri, state, error) {
    const destination = new URL(redirectUri);
    destination.searchParams.set("error", error);

    if (state !== null) {
        destination.searchParams.set("state", state);
    }

    setNoStore(res);
    return res.redirect(302, destination.toString());
}

function getFormParam(body, name, maxLength = 4096) {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        return null;
    }

    const value = body[name];

    if (
        typeof value !== "string" ||
        value.length === 0 ||
        value.length > maxLength
    ) {
        return null;
    }

    return value;
}

function isFormUrlEncoded(req) {
    const contentType = req.headers && req.headers["content-type"];

    return typeof contentType === "string" &&
        /^application\/x-www-form-urlencoded(?:\s*;|$)/i.test(contentType);
}

async function fetchClient(clientId) {
    try {
        const client = await ClientMetadataFetcher.fetchClientMetadata(clientId);

        if (!client || client.clientId !== clientId) {
            return null;
        }

        return client;
    } catch {
        return null;
    }
}

async function createAccessToken(storage, record) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
        const token = Tokens.generateToken();
        const hash = Tokens.hashToken(token);

        const created = await storage.createAccessToken(
            hash,
            record,
            Tokens.TTL.accessToken
        );

        if (created === true) {
            return token;
        }
    }

    throw new Error("Could not create a unique access token");
}

function tokenResponse(res, accessToken, refreshToken) {
    setNoStore(res);

    return res.status(200).json({
        access_token: accessToken,
        token_type: "Bearer",
        expires_in: Tokens.TTL.accessToken,
        refresh_token: refreshToken,
        scope: SCOPES.join(" ")
    });
}

async function exchangeAuthorizationCode(body, storage, clientId, client) {
    const code = getFormParam(body, "code", 256);
    const redirectUri = getFormParam(body, "redirect_uri", 2048);
    const verifier = getFormParam(body, "code_verifier", 128);

    if (!code || !redirectUri || !verifier || !PKCE.validateVerifier(verifier)) {
        return { error: "invalid_grant" };
    }

    if (!ClientMetadata.isRedirectUriAllowed(client, redirectUri)) {
        return { error: "invalid_grant" };
    }

    // The code is single-use. Consume it atomically before checking its contents.
    const record = await storage.consumeAuthorizationCode(
        Tokens.hashToken(code)
    );

    if (
        !record ||
        !Number.isSafeInteger(record.uid) ||
        record.uid <= 0 ||
        record.clientId !== clientId ||
        record.redirectUri !== redirectUri ||
        record.codeChallengeMethod !== "S256" ||
        !PKCE.verifyChallenge(
            verifier,
            record.codeChallenge,
            record.codeChallengeMethod
        )
    ) {
        return { error: "invalid_grant" };
    }

    const permissionSnapshot = await Permissions.getActivePermissionSnapshot(
        storage,
        record.uid,
        client
    );

    if (!permissionSnapshot.active) {
        return { error: "invalid_grant" };
    }

    const permissionFields = {
        userAccessVersion: permissionSnapshot.userAccessVersion,
        grantVersion: permissionSnapshot.grantVersion,
        metadataFingerprint: permissionSnapshot.metadataFingerprint
    };

    const refreshFamily = {
        uid: record.uid,
        clientId,
        scopes: [...SCOPES],
        ...permissionFields,
        currentTokenHash: null,
        createdAt: Date.now()
    };

    let refreshToken = null;
    let familyId = null;

    for (let attempt = 0; attempt < 3; attempt += 1) {
        familyId = Tokens.generateFamilyId();
        refreshToken = `${familyId}.${Tokens.generateToken()}`;
        refreshFamily.currentTokenHash = Tokens.hashToken(refreshToken);

        const created = await storage.createRefreshFamily(
            familyId,
            refreshFamily,
            Tokens.TTL.refreshToken
        );

        if (created === true) {
            break;
        }

        refreshToken = null;
        familyId = null;
    }

    if (!refreshToken || !familyId) {
        throw new Error("Could not create a unique refresh-token family");
    }

    let accessToken;

    try {
        accessToken = await createAccessToken(storage, {
            uid: record.uid,
            clientId,
            scopes: [...SCOPES],
            familyId,
            ...permissionFields,
            createdAt: Date.now()
        });
    } catch (error) {
        await storage.revokeRefreshFamily(familyId).catch(() => {});
        throw error;
    }

    return { accessToken, refreshToken };
}

async function exchangeRefreshToken(body, storage, clientId, client) {
    const presentedToken = getFormParam(body, "refresh_token", 256);

    if (!presentedToken) {
        return { error: "invalid_grant" };
    }

    const match = REFRESH_TOKEN_PATTERN.exec(presentedToken);

    if (!match) {
        return { error: "invalid_grant" };
    }

    const familyId = match[1];
    const presentedHash = Tokens.hashToken(presentedToken);
    const family = await storage.getRefreshFamily(familyId);

    if (
        !family ||
        family.revoked === true ||
        !Number.isSafeInteger(family.uid) ||
        family.uid <= 0 ||
        family.clientId !== clientId ||
        !Array.isArray(family.scopes) ||
        !SCOPES.every(scope => family.scopes.includes(scope))
    ) {
        return { error: "invalid_grant" };
    }

    const permissionSnapshot = await Permissions.getActivePermissionSnapshot(
        storage,
        family.uid,
        client
    );

    if (
        !permissionSnapshot.active ||
        family.userAccessVersion !== permissionSnapshot.userAccessVersion ||
        family.grantVersion !== permissionSnapshot.grantVersion ||
        family.metadataFingerprint !== permissionSnapshot.metadataFingerprint
    ) {
        return { error: "invalid_grant" };
    }

    const permissionFields = {
        userAccessVersion: permissionSnapshot.userAccessVersion,
        grantVersion: permissionSnapshot.grantVersion,
        metadataFingerprint: permissionSnapshot.metadataFingerprint
    };

    const nextRefreshToken = `${familyId}.${Tokens.generateToken()}`;
    const nextHash = Tokens.hashToken(nextRefreshToken);

    // Redis atomically rotates the current token or revokes the family
    // if a previously-used token is presented again.
    const rotation = await storage.rotateRefreshToken(
        familyId,
        presentedHash,
        nextHash,
        Tokens.TTL.refreshToken
    );

    if (!rotation || rotation.status !== "rotated") {
        return { error: "invalid_grant" };
    }

    let accessToken;

    try {
        accessToken = await createAccessToken(storage, {
            uid: family.uid,
            clientId,
            scopes: [...SCOPES],
            familyId,
            ...permissionFields,
            createdAt: Date.now()
        });
    } catch (error) {
        // Fail closed: the old refresh token is already consumed.
        await storage.revokeRefreshFamily(familyId).catch(() => {});
        throw error;
    }

    return {
        accessToken,
        refreshToken: nextRefreshToken
    };
}

exports.authorizationServerMetadata = async function (req, res) {
    try {
        const issuer = Meta.getPublicUrl();
        const metadata = Discovery.buildAuthorizationServerMetadata(issuer);

        setNoStore(res);
        return res.json(metadata);
    } catch (error) {
        console.error("[Integration] OAuth discovery failed:", error);
        return res.status(500).json({
            error: "OAuth discovery unavailable"
        });
    }
};

async function issueAuthorizationCode(storage, record) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
        const candidate = Tokens.generateToken();
        const hash = Tokens.hashToken(candidate);

        const created = await storage.createAuthorizationCode(
            hash,
            record,
            Tokens.TTL.authorizationCode
        );

        if (created === true) {
            return candidate;
        }
    }

    throw new Error("Could not create a unique authorization code");
}

exports.authorize = async function (req, res) {
    const requestUrl = getRequestUrl(req);

    if (!requestUrl) {
        return oauthError(res, 400, "invalid_request");
    }

    if (req.headers && req.headers.authorization) {
        return oauthError(res, 401, "login_required");
    }

    if (!hasBrowserSession(req)) {
        return redirectToLogin(req, res, requestUrl);
    }

    const params = requestUrl.searchParams;
    const clientId = getSingleParam(params, "client_id");
    const redirectUri = getSingleParam(params, "redirect_uri");

    if (!clientId || !redirectUri) {
        return oauthError(res, 400, "invalid_request");
    }

    const client = await fetchClient(clientId);

    if (!client) {
        return oauthError(res, 400, "invalid_client");
    }

    if (!ClientMetadata.isRedirectUriAllowed(client, redirectUri)) {
        return oauthError(res, 400, "invalid_request");
    }

    const stateParam = getSingleParam(params, "state", false);

    if (!stateParam.valid) {
        return redirectOAuthError(res, redirectUri, null, "invalid_request");
    }

    const state = stateParam.value === undefined ? null : stateParam.value;

    if (
        state !== null &&
        (
            state.length > MAX_STATE_LENGTH ||
            /[\u0000-\u001f\u007f]/.test(state)
        )
    ) {
        return redirectOAuthError(res, redirectUri, null, "invalid_request");
    }

    const responseType = getSingleParam(params, "response_type");
    const codeChallenge = getSingleParam(params, "code_challenge");
    const challengeMethod = getSingleParam(params, "code_challenge_method");

    if (responseType !== "code") {
        return redirectOAuthError(
            res,
            redirectUri,
            state,
            "unsupported_response_type"
        );
    }

    if (
        challengeMethod !== "S256" ||
        typeof codeChallenge !== "string" ||
        !CHALLENGE_PATTERN.test(codeChallenge)
    ) {
        return redirectOAuthError(res, redirectUri, state, "invalid_request");
    }

    try {
        const storage = OAuthStorage.get();
        const uid = Number(req.user.uid);

        const permission = await Permissions.getActivePermissionSnapshot(
            storage,
            uid,
            client
        );

        if (permission.reason === "user_access_disabled") {
            return redirectOAuthError(
                res,
                redirectUri,
                state,
                "access_denied"
            );
        }

        if (permission.active) {
            const authorizationCode = await issueAuthorizationCode(storage, {
                uid,
                clientId,
                redirectUri,
                codeChallenge,
                codeChallengeMethod: "S256",
                scopes: [...SCOPES],
                createdAt: Date.now()
            });

            const destination = new URL(redirectUri);
            destination.searchParams.set("code", authorizationCode);

            if (state !== null) {
                destination.searchParams.set("state", state);
            }

            setNoStore(res);
            return res.redirect(302, destination.toString());
        }

        const metadataFingerprint =
            ClientFingerprint.createClientFingerprint(client);

        const transaction = {
            uid,
            clientId,
            clientName: client.clientName,
            metadataFingerprint,
            sessionBindingHash: createSessionBindingHash(req),
            redirectUri,
            state,
            codeChallenge,
            codeChallengeMethod: "S256",
            scopes: [...SCOPES],
            createdAt: Date.now()
        };

        let transactionId = null;

        for (let attempt = 0; attempt < 3; attempt += 1) {
            const candidate = crypto.randomBytes(32).toString("hex");

            const created = await storage.createConsentTransaction(
                candidate,
                transaction,
                CONSENT_TRANSACTION_TTL
            );

            if (created === true) {
                transactionId = candidate;
                break;
            }
        }

        if (!transactionId) {
            throw new Error("Could not create a unique OAuth consent transaction");
        }

        const nconf = nodebb.require("nconf");
        let relativePath = String(nconf.get("relative_path") || "");
        relativePath = relativePath.replace(/\/+$/, "");

        setNoStore(res);
        return res.redirect(
            302,
            `${relativePath}/oauth/consent?transaction=${encodeURIComponent(transactionId)}`
        );
    } catch (error) {
        console.error("[Integration] OAuth authorization failed:", error);
        return redirectOAuthError(res, redirectUri, state, "server_error");
    }
};


function getConsentRequestUrl(req) {
    const target = req.url || req.originalUrl;

    if (
        typeof target !== "string" ||
        !target.startsWith("/") ||
        target.startsWith("//") ||
        target.includes("\\")
    ) {
        return null;
    }

    try {
        const url = new URL(target, "http://nodebb.invalid");

        if (
            url.origin !== "http://nodebb.invalid" ||
            url.pathname !== "/oauth/consent"
        ) {
            return null;
        }

        return url;
    } catch {
        return null;
    }
}

function isValidConsentTransaction(transaction) {
    return Boolean(
        transaction &&
        typeof transaction === "object" &&
        Number.isSafeInteger(transaction.uid) &&
        transaction.uid > 0 &&
        typeof transaction.clientId === "string" &&
        transaction.clientId.length > 0 &&
        typeof transaction.clientName === "string" &&
        typeof transaction.metadataFingerprint === "string" &&
        /^[a-f0-9]{64}$/.test(transaction.metadataFingerprint) &&
        typeof transaction.sessionBindingHash === "string" &&
        /^[a-f0-9]{64}$/.test(transaction.sessionBindingHash) &&
        typeof transaction.redirectUri === "string" &&
        transaction.redirectUri.length > 0 &&
        typeof transaction.codeChallenge === "string" &&
        CHALLENGE_PATTERN.test(transaction.codeChallenge) &&
        transaction.codeChallengeMethod === "S256" &&
        Array.isArray(transaction.scopes) &&
        transaction.scopes.length > 0 &&
        transaction.scopes.every(scope => SCOPES.includes(scope)) &&
        (
            transaction.state === null ||
            (
                typeof transaction.state === "string" &&
                transaction.state.length <= MAX_STATE_LENGTH &&
                !/[\u0000-\u001f\u007f]/.test(transaction.state)
            )
        )
    );
}

function renderConsentError(res, status, message) {
    setNoStore(res);

    return res.status(status).render("oauth/consent", {
        title: "MCP access authorization",
        errorMessage: message,
        clientName: "",
        transactionId: "",
        scopeLabels: ""
    });
}

async function getCurrentConsentClient(transaction) {
    const client = await fetchClient(transaction.clientId);

    if (!client) {
        return { error: "unavailable" };
    }

    if (!ClientMetadata.isRedirectUriAllowed(client, transaction.redirectUri)) {
        return { error: "changed" };
    }

    let fingerprint;

    try {
        fingerprint = ClientFingerprint.createClientFingerprint(client);
    } catch {
        return { error: "changed" };
    }

    if (fingerprint !== transaction.metadataFingerprint) {
        return { error: "changed" };
    }

    return { client };
}

exports.consent = async function (req, res) {
    const requestUrl = getConsentRequestUrl(req);

    if (!requestUrl) {
        return oauthError(res, 400, "invalid_request");
    }

    if (req.headers && req.headers.authorization) {
        return oauthError(res, 401, "login_required");
    }

    if (!hasBrowserSession(req)) {
        return redirectToLogin(req, res, requestUrl);
    }

    const transactionParam = getSingleParam(
        requestUrl.searchParams,
        "transaction"
    );

    if (
        typeof transactionParam !== "string" ||
        !/^[a-f0-9]{64}$/.test(transactionParam)
    ) {
        return renderConsentError(res, 400, "The authorization request is invalid or has expired.");
    }

    try {
        const storage = OAuthStorage.get();
        const transaction = await storage.getConsentTransaction(transactionParam);

        if (!isValidConsentTransaction(transaction)) {
            return renderConsentError(res, 400, "The authorization request is invalid or has expired.");
        }

        const uid = Number(req.user.uid);

        if (
            transaction.uid !== uid ||
            transaction.sessionBindingHash !== createSessionBindingHash(req)
        ) {
            return renderConsentError(res, 403, "This authorization request belongs to a different browser session.");
        }

        const current = await getCurrentConsentClient(transaction);

        if (current.error === "unavailable") {
            return renderConsentError(res, 503, "The client information is temporarily unavailable. Please try again.");
        }

        if (current.error) {
            return renderConsentError(res, 409, "The client registration has changed. Restart authorization from your MCP client.");
        }

        setNoStore(res);

        return res.status(200).render("oauth/consent", {
            title: "MCP access authorization",
            clientName: current.client.clientName,
            transactionId: transactionParam,
            scopeLabels: transaction.scopes.join(", "),
            errorMessage: ""
        });
    } catch (error) {
        console.error("[Integration] OAuth consent page failed:", error);
        return renderConsentError(res, 500, "The authorization page could not be loaded. Please try again.");
    }
};

exports.consentDecision = async function (req, res) {
    if (!isFormUrlEncoded(req)) {
        return renderConsentError(res, 400, "Invalid form submission.");
    }

    if (req.headers && req.headers.authorization) {
        return oauthError(res, 401, "login_required");
    }

    if (!hasBrowserSession(req)) {
        return renderConsentError(res, 401, "Please sign in to your forum account and try again.");
    }

    const transactionId = getFormParam(req.body, "transaction", 64);
    const decision = getFormParam(req.body, "decision", 16);

    if (
        !transactionId ||
        !/^[a-f0-9]{64}$/.test(transactionId) ||
        (decision !== "approve" && decision !== "deny")
    ) {
        return renderConsentError(res, 400, "Invalid form submission.");
    }

    try {
        const storage = OAuthStorage.get();
        const transaction = await storage.getConsentTransaction(transactionId);

        if (!isValidConsentTransaction(transaction)) {
            return renderConsentError(res, 400, "The authorization request is invalid or has expired.");
        }

        const uid = Number(req.user.uid);
        const sessionBindingHash = createSessionBindingHash(req);

        if (
            transaction.uid !== uid ||
            transaction.sessionBindingHash !== sessionBindingHash
        ) {
            return renderConsentError(res, 403, "This authorization request belongs to a different browser session.");
        }

        const expected = {
            uid,
            clientId: transaction.clientId,
            sessionBindingHash
        };

        if (decision === "deny") {
            const consumed = await storage.consumeConsentTransaction(
                transactionId,
                expected
            );

            if (!consumed) {
                return renderConsentError(res, 400, "The authorization request has already been used or has expired.");
            }

            return redirectOAuthError(
                res,
                transaction.redirectUri,
                transaction.state,
                "access_denied"
            );
        }

        const current = await getCurrentConsentClient(transaction);

        if (current.error === "unavailable") {
            return renderConsentError(res, 503, "The client information is temporarily unavailable. Please try again.");
        }

        if (current.error) {
            return renderConsentError(res, 409, "The client registration has changed. Restart authorization from your MCP client.");
        }

        const approval = await storage.approveConsentTransaction(
            transactionId,
            {
                ...expected,
                metadataFingerprint: transaction.metadataFingerprint
            },
            {
                clientName: current.client.clientName,
                metadataFingerprint: transaction.metadataFingerprint
            }
        );

        if (!approval || approval.status !== "approved") {
            if (approval && approval.status === "disabled") {
                return renderConsentError(res, 403, "MCP access is currently disabled for your forum account.");
            }

            return renderConsentError(res, 400, "The authorization request has already been used or has expired.");
        }

        const code = await issueAuthorizationCode(storage, {
            uid: transaction.uid,
            clientId: transaction.clientId,
            redirectUri: transaction.redirectUri,
            codeChallenge: transaction.codeChallenge,
            codeChallengeMethod: transaction.codeChallengeMethod,
            scopes: transaction.scopes,
            createdAt: transaction.createdAt
        });

        const destination = new URL(transaction.redirectUri);
        destination.searchParams.set("code", code);

        if (transaction.state !== null) {
            destination.searchParams.set("state", transaction.state);
        }

        setNoStore(res);
        return res.redirect(302, destination.toString());
    } catch (error) {
        console.error("[Integration] OAuth consent decision failed:", error);
        return renderConsentError(res, 500, "The authorization decision could not be processed. Please try again.");
    }
};

exports.token = async function (req, res) {
    if (!isFormUrlEncoded(req)) {
        return oauthError(res, 400, "invalid_request");
    }

    if (req.headers && req.headers.authorization) {
        return oauthError(res, 401, "invalid_client");
    }

    const body = req.body;
    const grantType = getFormParam(body, "grant_type", 64);
    const clientId = getFormParam(body, "client_id", 2048);

    if (!grantType || !clientId) {
        return oauthError(res, 400, "invalid_request");
    }

    if (
        grantType !== "authorization_code" &&
        grantType !== "refresh_token"
    ) {
        return oauthError(res, 400, "unsupported_grant_type");
    }

    let client = null;

    try {
        ClientMetadata.validateClientId(clientId);

        client = await fetchClient(clientId);

        if (!client) {
            return oauthError(res, 400, "invalid_client");
        }
    } catch {
        return oauthError(res, 400, "invalid_client");
    }

    try {
        const storage = OAuthStorage.get();
        const result = grantType === "authorization_code" ?
            await exchangeAuthorizationCode(body, storage, clientId, client) :
            await exchangeRefreshToken(body, storage, clientId, client);

        if (result.error) {
            return oauthError(res, 400, result.error);
        }

        return tokenResponse(
            res,
            result.accessToken,
            result.refreshToken
        );
    } catch (error) {
        console.error("[Integration] OAuth token exchange failed:", error);
        return oauthError(res, 500, "server_error");
    }
};

exports.revoke = async function (req, res) {
    if (!isFormUrlEncoded(req)) {
        return oauthError(res, 400, "invalid_request");
    }

    if (req.headers && req.headers.authorization) {
        return oauthError(res, 401, "invalid_client");
    }

    const token = getFormParam(req.body, "token", 2048);
    const clientId = getFormParam(req.body, "client_id", 2048);

    if (!token || !clientId) {
        return oauthError(res, 400, "invalid_request");
    }


    // Revocation must not depend on the client's metadata server.
    // Validate the client ID syntax locally, then match it against
    // the client ID stored with the token or refresh-token family.
    try {
        ClientMetadata.validateClientId(clientId);
    } catch {
        return oauthError(res, 400, "invalid_client");
    }

    try {
        const storage = OAuthStorage.get();

        const refreshMatch = token.match(REFRESH_TOKEN_PATTERN);
        const isAccessToken = /^[A-Za-z0-9_-]{43}$/.test(token);

        if (refreshMatch) {
            const [, familyId] = refreshMatch;
            const presentedHash = Tokens.hashToken(token);
            const family = await storage.getRefreshFamily(familyId);

            if (
                family &&
                family.clientId === clientId &&
                (
                    family.currentTokenHash === presentedHash ||
                    (
                        Array.isArray(family.usedTokenHashes) &&
                        family.usedTokenHashes.includes(presentedHash)
                    )
                )
            ) {
                await storage.revokeRefreshFamily(familyId);
            }
        } else if (isAccessToken) {
            const hash = Tokens.hashToken(token);
            const record = await storage.getAccessToken(hash);

            if (
                record &&
                record.clientId === clientId &&
                typeof record.familyId === "string" &&
                /^[a-f0-9]{32}$/.test(record.familyId)
            ) {
                // Revoke the complete grant, not just this access token.
                await storage.revokeRefreshFamily(record.familyId);
                await storage.revokeAccessToken(hash);
            }
        }

        setNoStore(res);
        return res.status(200).json({});
    } catch (error) {
        console.error("[Integration] OAuth token revocation failed:", error);
        return oauthError(res, 500, "server_error");
    }
};
