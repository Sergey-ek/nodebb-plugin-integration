"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { describe, it } = require("mocha");
const proxyquire = require("proxyquire").noCallThru();

const Tokens = require("../src/oauth/tokens");

const CLIENT_ID = "https://client.example.com/metadata.json";
const REDIRECT_URI = "http://127.0.0.1:3344/callback";
const CODE = "test-authorization-code";
const VERIFIER = "A".repeat(43);
const CHALLENGE = crypto
    .createHash("sha256")
    .update(VERIFIER)
    .digest("base64url");

const FAMILY_ID = "0123456789abcdef0123456789abcdef";
const REFRESH_SECRET = "R".repeat(43);
const REFRESH_TOKEN = `${FAMILY_ID}.${REFRESH_SECRET}`;

function createResponse() {
    return {
        headers: {},
        statusCode: 200,
        body: null,

        set(name, value) {
            this.headers[name] = value;
            return this;
        },

        status(code) {
            this.statusCode = code;
            return this;
        },

        json(value) {
            this.body = value;
            return this;
        }
    };
}

function createRequest(body, overrides = {}) {
    return {
        headers: {
            "content-type": "application/x-www-form-urlencoded"
        },
        body,
        ...overrides
    };
}

function createHarness(options = {}) {
    const captured = {
        consumedCodes: [],
        createdFamilies: [],
        createdAccessTokens: [],
        revokedFamilies: [],
        rotations: [],
        clientFetches: []
    };

    let codeConsumed = false;

    const codeRecord = options.codeRecord || {
        uid: 42,
        clientId: CLIENT_ID,
        redirectUri: REDIRECT_URI,
        codeChallenge: CHALLENGE,
        codeChallengeMethod: "S256",
        scopes: ["mcp"],
        createdAt: Date.now()
    };

    const family = options.family || null;

    const storage = {
        async consumeAuthorizationCode(hash) {
            captured.consumedCodes.push(hash);

            if (
                codeConsumed ||
                hash !== Tokens.hashToken(CODE)
            ) {
                return null;
            }

            codeConsumed = true;
            return codeRecord;
        },

        async createRefreshFamily(familyId, record, ttl) {
            captured.createdFamilies.push({
                familyId,
                record: { ...record },
                ttl
            });

            if (options.familyCreationFails) {
                return false;
            }

            return true;
        },

        async createAccessToken(hash, record, ttl) {
            captured.createdAccessTokens.push({
                hash,
                record: { ...record },
                ttl
            });

            return options.accessCreationFails !== true;
        },

        async revokeRefreshFamily(familyId) {
            captured.revokedFamilies.push(familyId);

            if (family && familyId === FAMILY_ID) {
                family.revoked = true;
            }

            return true;
        },

        async getRefreshFamily(familyId) {
            return familyId === FAMILY_ID ? family : null;
        },

        async rotateRefreshToken(
            familyId,
            presentedHash,
            nextHash,
            ttl
        ) {
            captured.rotations.push({
                familyId,
                presentedHash,
                nextHash,
                ttl
            });

            if (!family || familyId !== FAMILY_ID || family.revoked) {
                return { status: "invalid" };
            }

            if (family.currentTokenHash === presentedHash) {
                family.usedTokenHashes.push(presentedHash);
                family.currentTokenHash = nextHash;

                return {
                    status: "rotated",
                    family: { ...family }
                };
            }

            if (family.usedTokenHashes.includes(presentedHash)) {
                family.revoked = true;
                return {
                    status: "reused",
                    family: { ...family }
                };
            }

            return { status: "invalid" };
        }
    };

    const route = proxyquire("../src/routes/oauth", {
        "../nodebb/meta": {
            getPublicUrl: () => "https://forum.example.com"
        },
        "../oauth/discovery": {},
        "../oauth/client-metadata-fetcher": {
            fetchClientMetadata: async clientId => {
                captured.clientFetches.push(clientId);

                if (options.fetchError) {
                    throw new Error("Metadata unavailable");
                }

                return { clientId };
            }
        },
        "../oauth/client-metadata": {
            validateClientId(clientId) {
                if (clientId !== CLIENT_ID) {
                    throw new Error("Invalid client ID");
                }
            },
            isRedirectUriAllowed(client, redirectUri) {
                return options.redirectAllowed !== false &&
                    redirectUri === REDIRECT_URI;
            }
        },
        "../oauth/storage/runtime": {
            get: () => storage
        }
    });

    return { route, storage, captured, family };
}

function createFamily() {
    return {
        uid: 42,
        clientId: CLIENT_ID,
        scopes: ["mcp"],
        currentTokenHash: Tokens.hashToken(REFRESH_TOKEN),
        usedTokenHashes: [],
        revoked: false,
        createdAt: Date.now()
    };
}

function authorizationCodeRequest(overrides = {}) {
    return createRequest({
        grant_type: "authorization_code",
        client_id: CLIENT_ID,
        code: CODE,
        redirect_uri: REDIRECT_URI,
        code_verifier: VERIFIER,
        ...overrides
    });
}

function refreshRequest(overrides = {}) {
    return createRequest({
        grant_type: "refresh_token",
        client_id: CLIENT_ID,
        refresh_token: REFRESH_TOKEN,
        ...overrides
    });
}

describe("OAuth token endpoint", function () {
    it("exchanges a valid authorization code and PKCE verifier", async function () {
        const { route, captured } = createHarness();
        const res = createResponse();

        await route.token(authorizationCodeRequest(), res);

        assert.equal(res.statusCode, 200);
        assert.equal(res.body.token_type, "Bearer");
        assert.equal(res.body.expires_in, Tokens.TTL.accessToken);
        assert.equal(res.body.scope, "mcp");
        assert.match(res.body.access_token, /^[A-Za-z0-9_-]{43}$/);
        assert.match(
            res.body.refresh_token,
            /^[a-f0-9]{32}\.[A-Za-z0-9_-]{43}$/
        );

        assert.equal(captured.consumedCodes.length, 1);
        assert.equal(captured.createdFamilies.length, 1);
        assert.equal(captured.createdAccessTokens.length, 1);

        const accessRecord = captured.createdAccessTokens[0].record;
        const familyRecord = captured.createdFamilies[0].record;

        assert.equal(accessRecord.uid, 42);
        assert.equal(accessRecord.clientId, CLIENT_ID);
        assert.equal(accessRecord.familyId, captured.createdFamilies[0].familyId);
        assert.deepStrictEqual(accessRecord.scopes, ["mcp"]);

        assert.equal(familyRecord.uid, 42);
        assert.equal(familyRecord.clientId, CLIENT_ID);
        assert.equal(
            familyRecord.currentTokenHash,
            Tokens.hashToken(res.body.refresh_token)
        );

        assert.equal(
            captured.createdAccessTokens[0].hash,
            Tokens.hashToken(res.body.access_token)
        );

        assert.equal(res.headers["Cache-Control"], "no-store");
        assert.equal(res.headers.Pragma, "no-cache");
    });

    it("rejects reuse of an authorization code", async function () {
        const { route, captured } = createHarness();

        const firstResponse = createResponse();
        await route.token(authorizationCodeRequest(), firstResponse);
        assert.equal(firstResponse.statusCode, 200);

        const secondResponse = createResponse();
        await route.token(authorizationCodeRequest(), secondResponse);

        assert.equal(secondResponse.statusCode, 400);
        assert.equal(secondResponse.body.error, "invalid_grant");
        assert.equal(captured.consumedCodes.length, 2);
        assert.equal(captured.createdFamilies.length, 1);
    });

    it("rejects an incorrect PKCE verifier", async function () {
        const { route, captured } = createHarness();
        const res = createResponse();

        await route.token(
            authorizationCodeRequest({
                code_verifier: "B".repeat(43)
            }),
            res
        );

        assert.equal(res.statusCode, 400);
        assert.equal(res.body.error, "invalid_grant");
        assert.equal(captured.consumedCodes.length, 1);
        assert.equal(captured.createdFamilies.length, 0);
    });

    it("rejects a redirect URI different from the authorization request", async function () {
        const { route, captured } = createHarness();
        const res = createResponse();

        await route.token(
            authorizationCodeRequest({
                redirect_uri: "http://127.0.0.1:9999/callback"
            }),
            res
        );

        assert.equal(res.statusCode, 400);
        assert.equal(res.body.error, "invalid_grant");
        assert.equal(captured.consumedCodes.length, 0);
        assert.equal(captured.createdFamilies.length, 0);
    });

    it("rejects an authorization code issued to another client", async function () {
        const { route, captured } = createHarness({
            codeRecord: {
                uid: 42,
                clientId: "https://other.example.com/metadata.json",
                redirectUri: REDIRECT_URI,
                codeChallenge: CHALLENGE,
                codeChallengeMethod: "S256",
                scopes: ["mcp"]
            }
        });
        const res = createResponse();

        await route.token(authorizationCodeRequest(), res);

        assert.equal(res.statusCode, 400);
        assert.equal(res.body.error, "invalid_grant");
        assert.equal(captured.createdFamilies.length, 0);
    });

    it("rotates a valid refresh token and issues a new access token", async function () {
        const family = createFamily();
        const { route, captured } = createHarness({ family });
        const res = createResponse();

        await route.token(refreshRequest(), res);

        assert.equal(res.statusCode, 200);
        assert.equal(res.body.token_type, "Bearer");
        assert.equal(res.body.expires_in, Tokens.TTL.accessToken);
        assert.equal(res.body.scope, "mcp");

        assert.match(res.body.access_token, /^[A-Za-z0-9_-]{43}$/);
        assert.match(
            res.body.refresh_token,
            new RegExp(`^${FAMILY_ID}\\.[A-Za-z0-9_-]{43}$`)
        );

        assert.equal(captured.rotations.length, 1);
        assert.equal(captured.createdAccessTokens.length, 1);
        assert.equal(captured.revokedFamilies.length, 0);

        assert.equal(
            family.currentTokenHash,
            Tokens.hashToken(res.body.refresh_token)
        );
        assert.equal(
            family.usedTokenHashes[0],
            Tokens.hashToken(REFRESH_TOKEN)
        );

        assert.equal(
            captured.createdAccessTokens[0].record.uid,
            42
        );
        assert.equal(
            captured.createdAccessTokens[0].record.familyId,
            FAMILY_ID
        );
    });

    it("rejects reuse of an old refresh token and revokes its family", async function () {
        const family = createFamily();
        const { route, captured } = createHarness({ family });

        const firstResponse = createResponse();
        await route.token(refreshRequest(), firstResponse);
        assert.equal(firstResponse.statusCode, 200);

        const secondResponse = createResponse();
        await route.token(refreshRequest(), secondResponse);

        assert.equal(secondResponse.statusCode, 400);
        assert.equal(secondResponse.body.error, "invalid_grant");
        assert.equal(family.revoked, true);
        assert.equal(captured.rotations.length, 2);
    });

    it("rejects a refresh token belonging to another client", async function () {
        const family = createFamily();
        family.clientId = "https://other.example.com/metadata.json";

        const { route, captured } = createHarness({ family });
        const res = createResponse();

        await route.token(refreshRequest(), res);

        assert.equal(res.statusCode, 400);
        assert.equal(res.body.error, "invalid_grant");
        assert.equal(captured.rotations.length, 0);
        assert.equal(captured.createdAccessTokens.length, 0);
        assert.equal(family.revoked, false);
    });

    it("revokes the refresh family if access-token creation fails after rotation", async function () {
        const family = createFamily();
        const { route, captured } = createHarness({
            family,
            accessCreationFails: true
        });
        const res = createResponse();

        const originalError = console.error;
        console.error = () => {};

        try {
            await route.token(refreshRequest(), res);
        } finally {
            console.error = originalError;
        }

        assert.equal(res.statusCode, 500);
        assert.equal(res.body.error, "server_error");
        assert.equal(captured.rotations.length, 1);
        assert.equal(captured.createdAccessTokens.length, 3);
        assert.deepStrictEqual(captured.revokedFamilies, [FAMILY_ID]);
        assert.equal(family.revoked, true);
    });

    it("rejects requests without form URL-encoded content type", async function () {
        const { route, captured } = createHarness();
        const req = authorizationCodeRequest();
        req.headers["content-type"] = "application/json";
        const res = createResponse();

        await route.token(req, res);

        assert.equal(res.statusCode, 400);
        assert.equal(res.body.error, "invalid_request");
        assert.equal(captured.consumedCodes.length, 0);
    });

    it("rejects Authorization header authentication", async function () {
        const { route, captured } = createHarness();
        const req = authorizationCodeRequest();
        req.headers.authorization = "Bearer unexpected";
        const res = createResponse();

        await route.token(req, res);

        assert.equal(res.statusCode, 401);
        assert.equal(res.body.error, "invalid_client");
        assert.equal(captured.consumedCodes.length, 0);
    });
});
