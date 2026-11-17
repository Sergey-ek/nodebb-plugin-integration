"use strict";

const Meta = require("../nodebb/meta");
const Discovery = require("../oauth/discovery");
const ClientMetadataFetcher = require("../oauth/client-metadata-fetcher");
const ClientMetadata = require("../oauth/client-metadata");
const OAuthStorage = require("../oauth/storage/runtime");
const Tokens = require("../oauth/tokens");
const PKCE = require("../oauth/pkce");

const SCOPES = Object.freeze(["mcp"]);
const MAX_STATE_LENGTH = 1024;
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

    return Number.isInteger(uid) &&
        uid > 0 &&
        uid === requestUid &&
        uid === sessionUid &&
        req.loggedIn === true;
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

    const refreshFamily = {
        uid: record.uid,
        clientId,
        scopes: [...SCOPES],
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
            createdAt: Date.now()
        });
    } catch (error) {
        await storage.revokeRefreshFamily(familyId).catch(() => {});
        throw error;
    }

    return { accessToken, refreshToken };
}

async function exchangeRefreshToken(body, storage, clientId) {
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
        let authorizationCode = null;

        for (let attempt = 0; attempt < 3; attempt += 1) {
            const candidate = Tokens.generateToken();
            const hash = Tokens.hashToken(candidate);

            const created = await storage.createAuthorizationCode(
                hash,
                {
                    uid: Number(req.user.uid),
                    clientId,
                    redirectUri,
                    codeChallenge,
                    codeChallengeMethod: "S256",
                    scopes: [...SCOPES],
                    createdAt: Date.now()
                },
                Tokens.TTL.authorizationCode
            );

            if (created === true) {
                authorizationCode = candidate;
                break;
            }
        }

        if (!authorizationCode) {
            throw new Error("Could not create a unique authorization code");
        }

        const destination = new URL(redirectUri);
        destination.searchParams.set("code", authorizationCode);

        if (state !== null) {
            destination.searchParams.set("state", state);
        }

        setNoStore(res);
        return res.redirect(302, destination.toString());
    } catch (error) {
        console.error("[Integration] OAuth authorization failed:", error);
        return redirectOAuthError(res, redirectUri, state, "server_error");
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

        if (grantType === "authorization_code") {
            client = await fetchClient(clientId);

            if (!client) {
                return oauthError(res, 400, "invalid_client");
            }
        }
    } catch {
        return oauthError(res, 400, "invalid_client");
    }

    try {
        const storage = OAuthStorage.get();
        const result = grantType === "authorization_code" ?
            await exchangeAuthorizationCode(body, storage, clientId, client) :
            await exchangeRefreshToken(body, storage, clientId);

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


    try {
        ClientMetadata.validateClientId(clientId);

        const client = await fetchClient(clientId);

        if (!client) {
            return oauthError(res, 400, "invalid_client");
        }
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
