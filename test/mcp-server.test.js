"use strict";

const assert = require("node:assert/strict");
const { describe, it } = require("mocha");
const { fork } = require("node:child_process");
const net = require("node:net");
const path = require("node:path");

const MCPServer = require("../src/mcp/server");

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
