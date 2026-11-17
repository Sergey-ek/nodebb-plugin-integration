"use strict";

const assert = require("assert");

let storedSettings = null;

const fakeMeta = {
    settings: {
        async get(key) {
            assert.strictEqual(key, "nodebb-plugin-integration");
            return storedSettings;
        },

        async set(key, value) {
            assert.strictEqual(key, "nodebb-plugin-integration");
            storedSettings = JSON.parse(JSON.stringify(value));
        }
    }
};

global.nodebb = {
    require(modulePath) {
        assert.strictEqual(modulePath, "./src/meta");
        return fakeMeta;
    }
};

const Config = require("../src/config");

describe("Configuration module", function () {
    beforeEach(function () {
        storedSettings = null;
    });

    describe("installation and auth mode migration", function () {
        it("uses OAuth and generates secrets on a new installation", async function () {
            const settings = await Config.get();

            assert.strictEqual(settings.authMode, "oauth");
            assert.match(settings.mcpBearerToken, /^[A-Za-z0-9_-]{43}$/);
            assert.match(settings.internalApiToken, /^[a-f0-9]{96}$/);

            assert.strictEqual(storedSettings.authMode, "oauth");
            assert.strictEqual(
                storedSettings.mcpBearerToken,
                settings.mcpBearerToken
            );
            assert.strictEqual(
                storedSettings.internalApiToken,
                settings.internalApiToken
            );
        });

        it("preserves a valid old Bearer token and migrates to Legacy", async function () {
            const oldToken = "a".repeat(32);

            storedSettings = {
                mcpBearerToken: oldToken
            };

            const settings = await Config.get();

            assert.strictEqual(settings.authMode, "legacy");
            assert.strictEqual(settings.mcpBearerToken, oldToken);
            assert.strictEqual(storedSettings.authMode, "legacy");
            assert.strictEqual(storedSettings.mcpBearerToken, oldToken);
        });

        it("uses OAuth when an old Bearer token is invalid", async function () {
            storedSettings = {
                mcpBearerToken: "too-short"
            };

            const settings = await Config.get();

            assert.strictEqual(settings.authMode, "oauth");
            assert.notStrictEqual(settings.mcpBearerToken, "too-short");
            assert.match(settings.mcpBearerToken, /^[A-Za-z0-9_-]{43}$/);
            assert.strictEqual(storedSettings.authMode, "oauth");
        });

        it("keeps migration idempotent and preserves the internal API token", async function () {
            const oldToken = "f".repeat(32);
            const internalToken = "a".repeat(96);

            storedSettings = {
                mcpBearerToken: oldToken,
                internalApiToken: internalToken
            };

            const first = await Config.get();
            const second = await Config.get();

            assert.strictEqual(first.authMode, "legacy");
            assert.strictEqual(second.authMode, "legacy");
            assert.strictEqual(second.mcpBearerToken, oldToken);
            assert.strictEqual(second.internalApiToken, internalToken);
            assert.strictEqual(storedSettings.authMode, "legacy");
            assert.strictEqual(storedSettings.internalApiToken, internalToken);
        });

        it("preserves an explicitly configured OAuth mode", async function () {
            const oldToken = "b".repeat(32);

            storedSettings = {
                authMode: "oauth",
                mcpBearerToken: oldToken
            };

            const settings = await Config.get();

            assert.strictEqual(settings.authMode, "oauth");
            assert.strictEqual(settings.mcpBearerToken, oldToken);
            assert.strictEqual(storedSettings.authMode, "oauth");
        });

        it("preserves an explicitly configured Legacy mode", async function () {
            const oldToken = "c".repeat(32);

            storedSettings = {
                authMode: "legacy",
                mcpBearerToken: oldToken
            };

            const settings = await Config.get();

            assert.strictEqual(settings.authMode, "legacy");
            assert.strictEqual(settings.mcpBearerToken, oldToken);
        });
    });

    describe("admin information", function () {
        it("does not expose the Bearer token through info()", async function () {
            storedSettings = {
                authMode: "legacy",
                mcpBearerToken: "d".repeat(32)
            };

            const info = await Config.info();

            assert.strictEqual(
                Object.prototype.hasOwnProperty.call(info, "mcpBearerToken"),
                false
            );
            assert.strictEqual(info.mcpBearerTokenConfigured, true);
            assert.strictEqual(info.authMode, "legacy");
        });

        it("exposes the Bearer token through adminInfo()", async function () {
            const token = "e".repeat(32);

            storedSettings = {
                authMode: "legacy",
                mcpBearerToken: token
            };

            const info = await Config.adminInfo();

            assert.strictEqual(info.mcpBearerToken, token);
        });
    });

    describe("MCP enablement by authentication mode", function () {
        it("ignores the ACP service UID field in OAuth mode and preserves its saved value", async function () {
            await Config.set({
                authMode: "legacy",
                mcpServiceUid: 1
            });

            const settings = await Config.set({
                authMode: "oauth",
                mcpEnabled: true,
                mcpServiceUid: 0
            });

            assert.strictEqual(settings.authMode, "oauth");
            assert.strictEqual(settings.mcpEnabled, true);
            assert.strictEqual(settings.mcpServiceUid, 1);
        });

        it("allows enabling MCP in OAuth mode without a service UID", async function () {
            const settings = await Config.set({
                authMode: "oauth",
                mcpEnabled: true
            });

            assert.strictEqual(settings.authMode, "oauth");
            assert.strictEqual(settings.mcpEnabled, true);
            assert.strictEqual(settings.mcpServiceUid, 0);
        });

        it("requires a service UID when enabling MCP in Legacy mode", async function () {
            await Config.set({ authMode: "legacy" });

            await assert.rejects(
                Config.set({ mcpEnabled: true }),
                /Set MCP service UID before enabling legacy authentication/
            );

            const settings = await Config.set({
                mcpEnabled: true,
                mcpServiceUid: 1
            });

            assert.strictEqual(settings.authMode, "legacy");
            assert.strictEqual(settings.mcpEnabled, true);
            assert.strictEqual(settings.mcpServiceUid, 1);
        });
    });

    describe("auth mode updates", function () {
        it("allows switching between OAuth and Legacy", async function () {
            await Config.get();

            const legacy = await Config.set({ authMode: "legacy" });
            assert.strictEqual(legacy.authMode, "legacy");

            const oauth = await Config.set({ authMode: "oauth" });
            assert.strictEqual(oauth.authMode, "oauth");
        });

        it("rejects an unsupported auth mode", async function () {
            await Config.get();

            await assert.rejects(
                Config.set({ authMode: "bearer" }),
                /MCP auth mode must be oauth or legacy/
            );
        });
    });
});
