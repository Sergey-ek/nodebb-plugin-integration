"use strict";

const assert = require("node:assert/strict");
const { describe, it } = require("mocha");
const { fork } = require("node:child_process");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");

const MCPServer = require("../src/mcp/server");

async function withOAuthHttpServer(authorization, fetchImpl, requestOptions = {}) {
    const probe = net.createServer();

    await new Promise((resolve, reject) => {
        probe.once("error", reject);
        probe.listen(0, "127.0.0.1", resolve);
    });

    const port = probe.address().port;
    await new Promise(resolve => probe.close(resolve));

    const originalFetch = global.fetch;
    global.fetch = fetchImpl;

    try {
        await MCPServer.start({
            nodebbUrl: "http://127.0.0.1:4567",
            internalApiToken: "internal-secret",
            authMode: "oauth",
            resourceMetadataUrl: "http://127.0.0.1/.well-known/oauth-protected-resource/mcp",
            host: "127.0.0.1",
            port
        });

        return await new Promise((resolve, reject) => {
            const req = http.request({
                hostname: "127.0.0.1",
                port,
                path: requestOptions.path || "/mcp",
                method: requestOptions.method || "GET",
                headers: {
                    ...(authorization ? { Authorization: authorization } : {}),
                    ...(requestOptions.headers || {})
                }
            }, (res) => {
                let body = "";
                res.setEncoding("utf8");
                res.on("data", chunk => { body += chunk; });
                res.on("end", () => resolve({
                    statusCode: res.statusCode,
                    headers: res.headers,
                    body
                }));
            });

            req.once("error", reject);

            if (requestOptions.body !== undefined) {
                req.write(requestOptions.body);
            }

            req.end();
        });
    } finally {
        await MCPServer.stop();
        global.fetch = originalFetch;
    }
}

async function withLegacyHttpServer(authorization, fetchImpl) {
    const probe = net.createServer();

    await new Promise((resolve, reject) => {
        probe.once("error", reject);
        probe.listen(0, "127.0.0.1", resolve);
    });

    const port = probe.address().port;
    await new Promise(resolve => probe.close(resolve));

    const originalFetch = global.fetch;
    global.fetch = fetchImpl;

    try {
        await MCPServer.start({
            nodebbUrl: "http://127.0.0.1:4567",
            internalApiToken: "internal-secret",
            authMode: "legacy",
            bearerToken: "legacy-secret",
            host: "127.0.0.1",
            port
        });

        return await new Promise((resolve, reject) => {
            const req = http.get({
                hostname: "127.0.0.1",
                port,
                path: "/mcp",
                headers: authorization
                    ? { Authorization: authorization }
                    : {}
            }, res => {
                let body = "";
                res.setEncoding("utf8");
                res.on("data", chunk => { body += chunk; });
                res.on("end", () => resolve({
                    statusCode: res.statusCode,
                    headers: res.headers,
                    body
                }));
            });

            req.once("error", reject);
        });
    } finally {
        await MCPServer.stop();
        global.fetch = originalFetch;
    }
}

async function withConcurrentOAuthHttpRequests(authorizations, fetchImpl) {
    const probe = net.createServer();

    await new Promise((resolve, reject) => {
        probe.once("error", reject);
        probe.listen(0, "127.0.0.1", resolve);
    });

    const port = probe.address().port;
    await new Promise(resolve => probe.close(resolve));

    const originalFetch = global.fetch;
    global.fetch = fetchImpl;

    try {
        await MCPServer.start({
            nodebbUrl: "http://127.0.0.1:4567",
            internalApiToken: "internal-secret",
            authMode: "oauth",
            resourceMetadataUrl: "http://127.0.0.1/.well-known/oauth-protected-resource/mcp",
            host: "127.0.0.1",
            port
        });

        const sendRequest = authorization => new Promise((resolve, reject) => {
            const req = http.get({
                hostname: "127.0.0.1",
                port,
                path: "/mcp",
                headers: { Authorization: authorization }
            }, res => {
                let body = "";
                res.setEncoding("utf8");
                res.on("data", chunk => { body += chunk; });
                res.on("end", () => resolve({
                    statusCode: res.statusCode,
                    body
                }));
            });

            req.once("error", reject);
        });

        return await Promise.all(authorizations.map(sendRequest));
    } finally {
        await MCPServer.stop();
        global.fetch = originalFetch;
    }
}

describe("MCP server authentication", () => {
    const token = "test-bearer-token-123456789";

    it("accepts a valid Bearer token", () => {
        assert.equal(MCPServer.isAuthorized(`Bearer ${token}`, token), true);
    });

    it("accepts case-insensitive Bearer scheme", () => {
        assert.equal(MCPServer.isAuthorized(`bearer ${token}`, token), true);
    });

    it("rejects an invalid token", () => {
        assert.equal(MCPServer.isAuthorized("Bearer invalid-token", token), false);
    });

    it("rejects a missing authorization header", () => {
        assert.equal(MCPServer.isAuthorized("", token), false);
        assert.equal(MCPServer.isAuthorized(undefined, token), false);
    });

    it("rejects malformed authorization headers", () => {
        assert.equal(MCPServer.isAuthorized(token, token), false);
        assert.equal(MCPServer.isAuthorized(`Basic ${token}`, token), false);
        assert.equal(MCPServer.isAuthorized(`Bearer ${token} extra`, token), false);
        assert.equal(MCPServer.isAuthorized("Bearer", token), false);
    });

    it("rejects empty or invalid expected tokens", () => {
        assert.equal(MCPServer.isAuthorized("Bearer token", ""), false);
        assert.equal(MCPServer.isAuthorized("Bearer token", null), false);
    });

    it("compares tokens safely and rejects unequal lengths", () => {
        assert.equal(MCPServer.tokensMatch(token, token), true);
        assert.equal(MCPServer.tokensMatch(token, "short"), false);
        assert.equal(MCPServer.tokensMatch(null, token), false);
    });
});

describe("MCP server lifecycle", () => {
    it("gracefully exits when the IPC connection is disconnected", async function () {
        this.timeout(10000);

        const probe = net.createServer();

        await new Promise((resolve, reject) => {
            probe.once("error", reject);
            probe.listen(0, "127.0.0.1", resolve);
        });

        const port = probe.address().port;
        await new Promise((resolve) => probe.close(resolve));

        const child = fork(
            path.join(__dirname, "../src/mcp/server.js"),
            [],
            { stdio: ["ignore", "ignore", "inherit", "ipc"] }
        );

        try {
            await new Promise((resolve, reject) => {
                const timer = setTimeout(
                    () => reject(new Error("MCP configuration timed out")),
                    5000
                );

                child.once("error", reject);

                child.on("message", (message) => {
                    if (message.type === "configured") {
                        clearTimeout(timer);
                        resolve();
                    } else if (message.type === "configuration-error") {
                        clearTimeout(timer);
                        reject(new Error(message.message));
                    }
                });

                child.send({
                    type: "configure",
                    config: {
                        nodebbUrl: "http://127.0.0.1:4567",
                        internalApiToken: "i".repeat(32),
                        bearerToken: "b".repeat(32),
                        host: "127.0.0.1",
                        port
                    }
                });
            });

            const exit = new Promise((resolve, reject) => {
                const timer = setTimeout(
                    () => reject(new Error("MCP process did not exit")),
                    5000
                );

                child.once("exit", (code, signal) => {
                    clearTimeout(timer);
                    resolve({ code, signal });
                });
            });

            child.disconnect();

            const result = await exit;

            assert.equal(result.code, 0);
            assert.equal(result.signal, null);
        } finally {
            if (child.connected) {
                child.disconnect();
            }

            if (child.exitCode === null && child.signalCode === null) {
                child.kill("SIGKILL");
            }
        }
    });
});


describe("MCP server OAuth HTTP authentication", () => {
    it("rejects a malformed OAuth Bearer token before contacting NodeBB", async () => {
        let fetchCalled = false;

        const result = await withOAuthHttpServer("Bearer short", async () => {
            fetchCalled = true;
            throw new Error("NodeBB must not be contacted");
        });

        assert.equal(result.statusCode, 401);
        assert.equal(fetchCalled, false);
        assert.equal(result.headers["www-authenticate"], 'Bearer resource_metadata="http://127.0.0.1/.well-known/oauth-protected-resource/mcp"');
        assert.equal(result.headers["cache-control"], "no-store");
    });

    it("forwards the OAuth token separately from the internal API token", async () => {
        const userToken = "A".repeat(43);
        let receivedUrl;
        let receivedOptions;

        const result = await withOAuthHttpServer(`Bearer ${userToken}`, async (url, options) => {
            receivedUrl = url;
            receivedOptions = options;

            return {
                ok: false,
                status: 401,
                async text() {
                    return JSON.stringify({ error: "Unauthorized" });
                }
            };
        });

        assert.equal(
            receivedUrl,
            "http://127.0.0.1:4567/api/v3/integration/internal/auth/validate"
        );
        assert.equal(receivedOptions.method, "GET");
        assert.equal(receivedOptions.headers.Authorization, "Bearer internal-secret");
        assert.equal(receivedOptions.headers["X-MCP-User-Token"], userToken);
        assert.equal(result.statusCode, 401);
        assert.equal(result.headers["www-authenticate"], 'Bearer resource_metadata="http://127.0.0.1/.well-known/oauth-protected-resource/mcp"');
        assert.equal(result.headers["cache-control"], "no-store");
    });

    it("keeps OAuth user tokens isolated across concurrent HTTP requests", async () => {
        const tokenA = "A".repeat(43);
        const tokenB = "B".repeat(43);
        const receivedTokens = [];

        const results = await withConcurrentOAuthHttpRequests(
            [`Bearer ${tokenA}`, `Bearer ${tokenB}`],
            async (url, options) => {
                receivedTokens.push(options.headers["X-MCP-User-Token"]);

                // Keep both requests in flight simultaneously.
                await new Promise(resolve => setTimeout(resolve, 20));

                return {
                    ok: true,
                    status: 200,
                    async text() {
                        return JSON.stringify({ authenticated: true });
                    }
                };
            }
        );

        assert.equal(receivedTokens.length, 2);
        assert.deepEqual(
            receivedTokens.sort(),
            [tokenA, tokenB].sort()
        );
        assert.deepEqual(
            results.map(result => result.statusCode),
            [406, 406]
        );
    });

    it("reaches the MCP transport after successful OAuth validation", async () => {
        const userToken = "D".repeat(43);
        let fetchCalls = 0;
        let receivedToken;

        const result = await withOAuthHttpServer(
            `Bearer ${userToken}`,
            async (url, options) => {
                fetchCalls += 1;
                receivedToken = options.headers["X-MCP-User-Token"];

                return {
                    ok: true,
                    status: 200,
                    async text() {
                        return JSON.stringify({ authenticated: true });
                    }
                };
            }
        );

        assert.equal(fetchCalls, 1);
        assert.equal(receivedToken, userToken);

        // The MCP transport rejects this GET because it lacks the
        // required Accept headers. A 406 proves OAuth validation succeeded
        // and the request passed beyond the authentication middleware.
        assert.equal(result.statusCode, 406);
    });

    it("rejects an access token immediately after its refresh family is revoked", async () => {
        const userToken = "R".repeat(43);
        let revoked = false;
        let validationCalls = 0;

        const validateToken = async (url, options) => {
            validationCalls += 1;

            assert.equal(
                options.headers["X-MCP-User-Token"],
                userToken
            );

            return revoked
                ? {
                    ok: false,
                    status: 401,
                    async text() {
                        return JSON.stringify({ error: "Unauthorized" });
                    }
                }
                : {
                    ok: true,
                    status: 200,
                    async text() {
                        return JSON.stringify({ authenticated: true });
                    }
                };
        };

        const firstResult = await withOAuthHttpServer(
            `Bearer ${userToken}`,
            validateToken
        );

        assert.equal(firstResult.statusCode, 406);
        assert.equal(validationCalls, 1);

        // Simulate successful OAuth revocation in NodeBB storage.
        revoked = true;

        const secondResult = await withOAuthHttpServer(
            `Bearer ${userToken}`,
            validateToken
        );

        assert.equal(secondResult.statusCode, 401);
        assert.equal(secondResult.headers["www-authenticate"], 'Bearer resource_metadata="http://127.0.0.1/.well-known/oauth-protected-resource/mcp"');
        assert.equal(secondResult.headers["cache-control"], "no-store");
        assert.equal(validationCalls, 2);
    });

    it("maps NodeBB authentication service failures to 503", async () => {
        const result = await withOAuthHttpServer(
            `Bearer ${"B".repeat(43)}`,
            async () => {
                throw new Error("Connection refused");
            }
        );

        assert.equal(result.statusCode, 503);
        assert.equal(result.headers["cache-control"], "no-store");
        assert.deepEqual(JSON.parse(result.body), {
            error: "OAuth authentication unavailable"
        });
    });

    it("maps a disabled MCP response from NodeBB to 403", async () => {
        const result = await withOAuthHttpServer(
            `Bearer ${"C".repeat(43)}`,
            async () => ({
                ok: false,
                status: 403,
                async text() {
                    return JSON.stringify({ error: "MCP is disabled" });
                }
            })
        );

        assert.equal(result.statusCode, 403);
        assert.deepEqual(JSON.parse(result.body), {
            error: "MCP is disabled"
        });
    });
});

describe("MCP server Legacy HTTP authentication", () => {
    it("allows a valid Legacy Bearer token to reach the MCP transport", async () => {
        let fetchCalled = false;

        const result = await withLegacyHttpServer(
            "Bearer legacy-secret",
            async () => {
                fetchCalled = true;
                throw new Error("Legacy authentication must not call OAuth validation");
            }
        );

        assert.equal(result.statusCode, 406);
        assert.equal(fetchCalled, false);
    });

    it("rejects an invalid Legacy Bearer token before contacting NodeBB", async () => {
        let fetchCalled = false;

        const result = await withLegacyHttpServer(
            "Bearer wrong-token",
            async () => {
                fetchCalled = true;
                throw new Error("NodeBB must not be contacted");
            }
        );

        assert.equal(result.statusCode, 401);
        assert.equal(fetchCalled, false);
        assert.equal(result.headers["www-authenticate"], "Bearer");
        assert.deepEqual(JSON.parse(result.body), {
            error: "Unauthorized"
        });
    });
});

describe("MCP server authentication mode", () => {
    const baseConfig = {
        nodebbUrl: "http://127.0.0.1:4567",
        internalApiToken: "i".repeat(32),
        resourceMetadataUrl: "http://127.0.0.1/.well-known/oauth-protected-resource/mcp",
        host: "127.0.0.1",
        port: 3100
    };

    it("keeps backward compatibility for configurations without authMode", () => {
        const result = MCPServer.validateConfig({
            ...baseConfig,
            bearerToken: "b".repeat(32)
        });

        assert.equal(result.authMode, "legacy");
        assert.equal(result.bearerToken, "b".repeat(32));
    });

    it("accepts OAuth configuration without a static Bearer token", () => {
        const result = MCPServer.validateConfig({
            ...baseConfig,
            authMode: "oauth",
            bearerToken: ""
        });

        assert.equal(result.authMode, "oauth");
        assert.equal(result.bearerToken, "");
    });

    it("requires a Bearer token in legacy mode", () => {
        assert.throws(() => MCPServer.validateConfig({
            ...baseConfig,
            authMode: "legacy",
            bearerToken: ""
        }), /bearer token is missing/i);
    });

    it("rejects unknown authentication modes", () => {
        assert.throws(() => MCPServer.validateConfig({
            ...baseConfig,
            authMode: "unknown",
            bearerToken: "b".repeat(32)
        }), /authentication mode is invalid/i);
    });
});
