"use strict";

const assert = require("node:assert/strict");
const { describe, it } = require("mocha");
const proxyquire = require("proxyquire").noCallThru();

function createResponse() {
    return {
        headers: {},
        statusCode: 200,
        body: null,
        redirectCode: null,
        redirectUrl: null,

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
        },

        redirect(code, url) {
            this.redirectCode = code;
            this.redirectUrl = url;
            return this;
        }
    };
}

function createBrowserRequest(overrides = {}) {
    return {
        url: "/oauth/authorize?" + new URLSearchParams({
            client_id: "https://client.example.com/metadata.json",
            redirect_uri: "http://127.0.0.1:3344/callback",
            response_type: "code",
            code_challenge: "A".repeat(43),
            code_challenge_method: "S256",
            state: "test-state"
        }).toString(),
        headers: {},
        user: { uid: 42 },
        uid: 42,
        loggedIn: true,
        session: {
            passport: { user: 42 }
        },
        ...overrides
    };
}

function createHarness(options = {}) {
    const captured = {
        codeHash: null,
        codeRecord: null,
        ttl: null,
        fetchClientId: null
    };

    const storage = {
        async createAuthorizationCode(hash, record, ttl) {
            captured.codeHash = hash;
            captured.codeRecord = record;
            captured.ttl = ttl;
            return options.storageResult === undefined ?
                true : options.storageResult;
        }
    };

    const route = proxyquire("../src/routes/oauth", {
        "../nodebb/meta": {
            getPublicUrl: () => "https://forum.example.com"
        },
        "../oauth/client-metadata-fetcher": {
            fetchClientMetadata: async clientId => {
                captured.fetchClientId = clientId;
                if (options.fetchError) {
                    throw new Error("Metadata fetch failed");
                }
                return { clientId };
            }
        },
        "../oauth/client-metadata": {
            isRedirectUriAllowed: () => options.redirectAllowed !== false
        },
        "../oauth/storage/runtime": {
            get: () => storage
        },
        "../oauth/tokens": {
            TTL: { authorizationCode: 300 },
            generateToken: () => "generated-authorization-code",
            hashToken: token => `hash:${token}`
        }
    });

    return { route, captured };
}


function createRevokeHarness(options = {}) {
    const captured = {
        revokedAccessTokens: [],
        revokedFamilies: [],
        fetchedClientId: null
    };

    const storage = {
        async getAccessToken(hash) {
            if (options.storageError) {
                throw new Error("Storage unavailable");
            }
            return options.accessRecord || null;
        },

        async revokeAccessToken(hash) {
            captured.revokedAccessTokens.push(hash);
            return true;
        },

        async getRefreshFamily(familyId) {
            if (options.storageError) {
                throw new Error("Storage unavailable");
            }
            return options.family || null;
        },

        async revokeRefreshFamily(familyId) {
            captured.revokedFamilies.push(familyId);
            return true;
        }
    };

    const route = proxyquire("../src/routes/oauth", {
        "../nodebb/meta": {
            getPublicUrl: () => "https://forum.example.com"
        },
        "../oauth/discovery": {},
        "../oauth/client-metadata-fetcher": {
            fetchClientMetadata: async clientId => {
                captured.fetchedClientId = clientId;
                if (options.fetchError) {
                    throw new Error("Metadata fetch failed");
                }
                return { clientId };
            }
        },
        "../oauth/client-metadata": {
            validateClientId: clientId => {
                if (options.invalidClientId) {
                    throw new Error("Invalid client ID");
                }
            }
        },
        "../oauth/storage/runtime": {
            get: () => {
                if (options.storageInitError) {
                    throw new Error("Storage unavailable");
                }
                return storage;
            }
        },
        "../oauth/tokens": {
            hashToken: token => `hash:${token}`
        }
    });

    return { route, captured };
}

function createRevokeRequest(token, overrides = {}) {
    return {
        headers: {
            "content-type": "application/x-www-form-urlencoded"
        },
        body: {
            token,
            client_id: "https://client.example.com/metadata.json",
            ...overrides
        }
    };
}

describe("OAuth routes", function () {
    it("returns authorization server metadata", async function () {
        const route = proxyquire("../src/routes/oauth", {
            "../nodebb/meta": {
                getPublicUrl: () => "https://forum.example.com"
            }
        });

        const res = createResponse();

        await route.authorizationServerMetadata({}, res);

        assert.equal(res.statusCode, 200);
        assert.equal(res.headers["Cache-Control"], "no-store");
        assert.equal(res.body.issuer, "https://forum.example.com");
        assert.equal(
            res.body.authorization_endpoint,
            "https://forum.example.com/oauth/authorize"
        );
    });

    it("returns 500 when public URL resolution fails", async function () {
        const route = proxyquire("../src/routes/oauth", {
            "../nodebb/meta": {
                getPublicUrl: () => {
                    throw new Error("URL unavailable");
                }
            }
        });

        const res = createResponse();
        const originalError = console.error;
        console.error = () => {};

        try {
            await route.authorizationServerMetadata({}, res);
        } finally {
            console.error = originalError;
        }

        assert.equal(res.statusCode, 500);
        assert.deepStrictEqual(res.body, {
            error: "OAuth discovery unavailable"
        });
    });

    it("issues an authorization code for a verified browser session", async function () {
        const { route, captured } = createHarness();
        const res = createResponse();

        await route.authorize(createBrowserRequest(), res);

        assert.equal(res.redirectCode, 302);

        const destination = new URL(res.redirectUrl);
        assert.equal(destination.origin, "http://127.0.0.1:3344");
        assert.equal(
            destination.searchParams.get("code"),
            "generated-authorization-code"
        );
        assert.equal(destination.searchParams.get("state"), "test-state");

        assert.equal(
            captured.fetchClientId,
            "https://client.example.com/metadata.json"
        );
        assert.equal(captured.codeHash, "hash:generated-authorization-code");
        assert.equal(captured.codeRecord.uid, 42);
        assert.equal(
            captured.codeRecord.clientId,
            "https://client.example.com/metadata.json"
        );
        assert.equal(
            captured.codeRecord.redirectUri,
            "http://127.0.0.1:3344/callback"
        );
        assert.deepStrictEqual(captured.codeRecord.scopes, ["mcp"]);
        assert.equal(captured.codeRecord.codeChallenge, "A".repeat(43));
        assert.equal(captured.codeRecord.codeChallengeMethod, "S256");
        assert.equal(captured.ttl, 300);
        assert.equal(res.headers["Cache-Control"], "no-store");
    });

    it("supports an authorization request without state", async function () {
        const { route } = createHarness();
        const req = createBrowserRequest();
        const url = new URL(req.url, "http://nodebb.invalid");
        url.searchParams.delete("state");
        req.url = `${url.pathname}${url.search}`;

        const res = createResponse();
        await route.authorize(req, res);

        assert.equal(res.redirectCode, 302);
        const destination = new URL(res.redirectUrl);
        assert.equal(
            destination.searchParams.get("code"),
            "generated-authorization-code"
        );
        assert.equal(destination.searchParams.has("state"), false);
    });

    it("rejects API Bearer authentication for the browser authorization flow", async function () {
        const { route, captured } = createHarness();
        const req = createBrowserRequest({
            headers: { authorization: "Bearer api-token" }
        });
        const res = createResponse();

        await route.authorize(req, res);

        assert.equal(res.statusCode, 401);
        assert.deepStrictEqual(res.body, { error: "login_required" });
        assert.equal(captured.codeRecord, null);
        assert.equal(res.redirectUrl, null);
    });

    it("does not authorize when the Passport session UID differs", async function () {
        const { route, captured } = createHarness();
        const req = createBrowserRequest({
            uid: 99,
            user: { uid: 99 },
            session: { passport: { user: 42 } }
        });
        const res = createResponse();

        const previousNodebb = global.nodebb;
        global.nodebb = {
            require(name) {
                assert.equal(name, "nconf");
                return { get: key => key === "relative_path" ? "" : undefined };
            }
        };

        try {
            req.session.save = callback => callback(null);
            await route.authorize(req, res);
        } finally {
            if (previousNodebb === undefined) {
                delete global.nodebb;
            } else {
                global.nodebb = previousNodebb;
            }
        }

        assert.equal(res.redirectCode, 302);
        assert.equal(res.redirectUrl, "/login");
        assert.match(req.session.returnTo, /^\/oauth\/authorize\?/);
        assert.equal(captured.codeRecord, null);
    });

    it("rejects a redirect URI not registered in client metadata", async function () {
        const { route, captured } = createHarness({
            redirectAllowed: false
        });
        const res = createResponse();

        await route.authorize(createBrowserRequest(), res);

        assert.equal(res.statusCode, 400);
        assert.deepStrictEqual(res.body, { error: "invalid_request" });
        assert.equal(captured.codeRecord, null);
        assert.equal(res.redirectUrl, null);
    });

    it("rejects a client whose metadata cannot be fetched", async function () {
        const { route, captured } = createHarness({ fetchError: true });
        const res = createResponse();

        await route.authorize(createBrowserRequest(), res);

        assert.equal(res.statusCode, 400);
        assert.deepStrictEqual(res.body, { error: "invalid_client" });
        assert.equal(captured.codeRecord, null);
    });

    it("does not return a code when storage creation fails", async function () {
        const { route } = createHarness({ storageResult: false });
        const res = createResponse();
        const originalError = console.error;
        console.error = () => {};

        try {
            await route.authorize(createBrowserRequest(), res);
        } finally {
            console.error = originalError;
        }

        assert.equal(res.redirectCode, 302);
        const destination = new URL(res.redirectUrl);
        assert.equal(destination.searchParams.get("error"), "server_error");
        assert.equal(destination.searchParams.get("state"), "test-state");
        assert.equal(destination.searchParams.has("code"), false);
    });

    it("rejects an invalid PKCE challenge", async function () {
        const { route, captured } = createHarness();
        const req = createBrowserRequest();
        const url = new URL(req.url, "http://nodebb.invalid");
        url.searchParams.set("code_challenge", "invalid");
        req.url = `${url.pathname}${url.search}`;

        const res = createResponse();
        await route.authorize(req, res);

        assert.equal(res.redirectCode, 302);
        const destination = new URL(res.redirectUrl);
        assert.equal(destination.searchParams.get("error"), "invalid_request");
        assert.equal(captured.codeRecord, null);
    });

    describe("token revocation", function () {
        it("rejects a request without client_id", async function () {
            const { route, captured } = createRevokeHarness();
            const req = createRevokeRequest("A".repeat(43));
            delete req.body.client_id;
            const res = createResponse();

            await route.revoke(req, res);

            assert.equal(res.statusCode, 400);
            assert.equal(res.body.error, "invalid_request");
            assert.equal(captured.revokedAccessTokens.length, 0);
            assert.equal(captured.revokedFamilies.length, 0);
        });

        it("rejects Authorization header authentication", async function () {
            const { route, captured } = createRevokeHarness();
            const req = createRevokeRequest("A".repeat(43));
            req.headers.authorization = "Bearer test-token";
            const res = createResponse();

            await route.revoke(req, res);

            assert.equal(res.statusCode, 401);
            assert.equal(res.body.error, "invalid_client");
            assert.equal(captured.revokedAccessTokens.length, 0);
            assert.equal(captured.revokedFamilies.length, 0);
        });

        const accessToken = "A".repeat(43);
        const familyId = "a".repeat(32);
        const refreshToken = `${familyId}.${"B".repeat(43)}`;
        const clientId = "https://client.example.com/metadata.json";

        it("revokes an access token and its complete refresh family", async function () {
            const { route, captured } = createRevokeHarness({
                accessRecord: {
                    clientId,
                    familyId
                }
            });

            const res = createResponse();
            await route.revoke(createRevokeRequest(accessToken), res);

            assert.equal(res.statusCode, 200);
            assert.deepStrictEqual(res.body, {});
            assert.deepStrictEqual(
                captured.revokedAccessTokens,
                [`hash:${accessToken}`]
            );
            assert.deepStrictEqual(captured.revokedFamilies, [familyId]);
            assert.equal(res.headers["Cache-Control"], "no-store");
            assert.equal(res.headers.Pragma, "no-cache");
        });

        it("revokes a refresh family using its current refresh token", async function () {
            const { route, captured } = createRevokeHarness({
                family: {
                    clientId,
                    currentTokenHash: `hash:${refreshToken}`,
                    usedTokenHashes: []
                }
            });

            const res = createResponse();
            await route.revoke(createRevokeRequest(refreshToken), res);

            assert.equal(res.statusCode, 200);
            assert.deepStrictEqual(captured.revokedFamilies, [familyId]);
            assert.deepStrictEqual(captured.revokedAccessTokens, []);
        });

        it("revokes a refresh family using a previously used refresh token", async function () {
            const usedToken = `${familyId}.${"C".repeat(43)}`;

            const { route, captured } = createRevokeHarness({
                family: {
                    clientId,
                    currentTokenHash: `hash:${refreshToken}`,
                    usedTokenHashes: [`hash:${usedToken}`]
                }
            });

            const res = createResponse();
            await route.revoke(createRevokeRequest(usedToken), res);

            assert.equal(res.statusCode, 200);
            assert.deepStrictEqual(captured.revokedFamilies, [familyId]);
        });

        it("does not revoke a token belonging to another client", async function () {
            const { route, captured } = createRevokeHarness({
                accessRecord: {
                    clientId: "https://another-client.example/metadata.json",
                    familyId
                }
            });

            const res = createResponse();
            await route.revoke(createRevokeRequest(accessToken), res);

            assert.equal(res.statusCode, 200);
            assert.deepStrictEqual(captured.revokedAccessTokens, []);
            assert.deepStrictEqual(captured.revokedFamilies, []);
        });

        it("returns 200 for an unknown token", async function () {
            const { route, captured } = createRevokeHarness();
            const res = createResponse();

            await route.revoke(
                createRevokeRequest("unknown-token"),
                res
            );

            assert.equal(res.statusCode, 200);
            assert.deepStrictEqual(res.body, {});
            assert.deepStrictEqual(captured.revokedAccessTokens, []);
            assert.deepStrictEqual(captured.revokedFamilies, []);
        });

        it("ignores an unsupported token_type_hint", async function () {
            const { route, captured } = createRevokeHarness({
                accessRecord: {
                    clientId,
                    familyId
                }
            });

            const res = createResponse();
            await route.revoke(
                createRevokeRequest(accessToken, {
                    token_type_hint: "unsupported_token_type"
                }),
                res
            );

            assert.equal(res.statusCode, 200);
            assert.deepStrictEqual(
                captured.revokedAccessTokens,
                [`hash:${accessToken}`]
            );
            assert.deepStrictEqual(captured.revokedFamilies, [familyId]);
        });

        it("returns 400 when the client metadata cannot be verified", async function () {
            const { route } = createRevokeHarness({ fetchError: true });
            const res = createResponse();

            await route.revoke(createRevokeRequest(accessToken), res);

            assert.equal(res.statusCode, 400);
            assert.deepStrictEqual(res.body, { error: "invalid_client" });
        });

        it("returns 500 when storage is unavailable", async function () {
            const { route } = createRevokeHarness({ storageError: true });
            const res = createResponse();
            const originalError = console.error;
            console.error = () => {};

            try {
                await route.revoke(createRevokeRequest(accessToken), res);
            } finally {
                console.error = originalError;
            }

            assert.equal(res.statusCode, 500);
            assert.deepStrictEqual(res.body, { error: "server_error" });
        });
    });

});
