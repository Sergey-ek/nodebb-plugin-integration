"use strict";

const assert = require("assert");
const Validation = require("../src/config/validation");

const DEFAULTS = {
    aiProvider: "openai",
    openaiApiKey: "",
    openaiModel: "text-embedding-3-small",
    embeddingSize: 1536,
    qdrantUrl: "http://qdrant:6333",
    collection: "nodebb_knowledge",
    excludedCategories: [],
    mcpEnabled: false,
    mcpHost: "127.0.0.1",
    mcpPort: 3100,
    mcpNodebbUrl: "http://127.0.0.1:4567",
    mcpBearerToken: "",
    mcpServiceUid: 0,
    internalApiToken: ""
};

describe("Configuration validation", function () {
    describe("HTTP URLs", function () {
        it("accepts HTTP and HTTPS URLs", function () {
            assert.strictEqual(
                Validation.validateQdrantUrl("http://qdrant:6333"),
                "http://qdrant:6333"
            );

            assert.strictEqual(
                Validation.validateNodebbUrl("https://forum.example.com/"),
                "https://forum.example.com"
            );
        });

        it("rejects invalid protocols", function () {
            assert.throws(() => Validation.validateQdrantUrl("ftp://qdrant"));
            assert.throws(() => Validation.validateQdrantUrl("file:///tmp/test"));
        });

        it("rejects credentials, query strings and fragments", function () {
            assert.throws(() => Validation.validateQdrantUrl("http://user:pass@host"));
            assert.throws(() => Validation.validateQdrantUrl("http://host/path?key=value"));
            assert.throws(() => Validation.validateQdrantUrl("http://host/#section"));
        });

        it("rejects empty and malformed URLs", function () {
            assert.throws(() => Validation.validateQdrantUrl(""));
            assert.throws(() => Validation.validateQdrantUrl("not a URL"));
        });
    });

    describe("MCP bind address", function () {
        it("accepts IPv4 and IPv6 addresses", function () {
            for (const host of ["127.0.0.1", "0.0.0.0", "::1", "2001:db8::1"]) {
                assert.strictEqual(Validation.validateMcpHost(host), host);
            }
        });

        it("accepts valid DNS hostnames", function () {
            for (const host of [
                "localhost",
                "mcp",
                "mcp.example.com",
                "service-01.internal",
                "redis"
            ]) {
                assert.strictEqual(Validation.validateMcpHost(host), host);
            }
        });

        it("accepts hostnames containing the letter s", function () {
            assert.strictEqual(
                Validation.validateMcpHost("services.example.com"),
                "services.example.com"
            );
        });

        it("rejects invalid hostnames", function () {
            for (const host of [
                "",
                "-mcp.example.com",
                "mcp-.example.com",
                "mcp..example.com",
                "mcp.example.com.",
                "bad host",
                "mcp.example.com/",
                "mcp.example.com:3100",
                "mcp_example.com"
            ]) {
                assert.throws(
                    () => Validation.validateMcpHost(host),
                    `Expected rejection for ${JSON.stringify(host)}`
                );
            }
        });

        it("rejects labels longer than 63 characters", function () {
            assert.throws(() => Validation.validateMcpHost(`${"a".repeat(64)}.example`));
        });

        it("rejects hostnames longer than 253 characters", function () {
            const host = Array(5).fill("a".repeat(60)).join(".");
            assert.throws(() => Validation.validateMcpHost(host));
        });
    });

    describe("MCP port", function () {
        it("accepts valid port numbers", function () {
            assert.strictEqual(Validation.validatePort(1), 1);
            assert.strictEqual(Validation.validatePort("3100"), 3100);
            assert.strictEqual(Validation.validatePort(65535), 65535);
        });

        it("rejects invalid port numbers", function () {
            for (const port of [0, -1, 65536, 1.5, "abc", NaN, Infinity]) {
                assert.throws(
                    () => Validation.validatePort(port),
                    `Expected rejection for ${String(port)}`
                );
            }
        });
    });

    describe("MCP service UID", function () {
        it("accepts positive integer UIDs", function () {
            assert.strictEqual(Validation.validateServiceUid(1), 1);
            assert.strictEqual(Validation.validateServiceUid("42"), 42);
        });

        it("rejects zero, negative and invalid UIDs", function () {
            for (const uid of [0, -1, 1.5, "abc", NaN, Infinity]) {
                assert.throws(() => Validation.validateServiceUid(uid));
            }
        });
    });

    describe("MCP Bearer Token", function () {
        it("accepts empty tokens and tokens of at least 32 characters", function () {
            assert.strictEqual(Validation.validateBearerToken(""), "");
            assert.strictEqual(Validation.validateBearerToken("a".repeat(32)), "a".repeat(32));
        });

        it("trims surrounding whitespace", function () {
            assert.strictEqual(
                Validation.validateBearerToken(`  ${"a".repeat(32)}  `),
                "a".repeat(32)
            );
        });

        it("rejects short, oversized and multiline tokens", function () {
            assert.throws(() => Validation.validateBearerToken("short"));
            assert.throws(() => Validation.validateBearerToken("a".repeat(513)));
            assert.throws(() => Validation.validateBearerToken(`${"a".repeat(32)}\n`));
            assert.throws(() => Validation.validateBearerToken(null));
        });
    });

    describe("AI provider", function () {
        it("accepts OpenAI and fake providers", function () {
            assert.strictEqual(Validation.validateAiProvider("openai"), "openai");
            assert.strictEqual(Validation.validateAiProvider("fake"), "fake");
        });

        it("rejects unknown providers", function () {
            for (const provider of ["", "local", "none", "FAKE", null, 1]) {
                assert.throws(() => Validation.validateAiProvider(provider));
            }
        });

        it("preserves fake provider during normalization", function () {
            const result = Validation.normalize({ aiProvider: "fake" }, DEFAULTS);
            assert.strictEqual(result.aiProvider, "fake");
        });

        it("uses default provider for invalid values", function () {
            const result = Validation.normalize({ aiProvider: "unknown" }, DEFAULTS);
            assert.strictEqual(result.aiProvider, DEFAULTS.aiProvider);
        });
    });

    describe("Normalization", function () {
        it("uses defaults for invalid values", function () {
            const result = Validation.normalize({
                embeddingSize: -1,
                qdrantUrl: "invalid",
                collection: "bad collection",
                mcpHost: "bad host",
                mcpPort: 70000,
                mcpNodebbUrl: "invalid",
                mcpServiceUid: 0,
                mcpBearerToken: "short"
            }, DEFAULTS);

            assert.strictEqual(result.embeddingSize, DEFAULTS.embeddingSize);
            assert.strictEqual(result.qdrantUrl, DEFAULTS.qdrantUrl);
            assert.strictEqual(result.collection, DEFAULTS.collection);
            assert.strictEqual(result.mcpHost, DEFAULTS.mcpHost);
            assert.strictEqual(result.mcpPort, DEFAULTS.mcpPort);
            assert.strictEqual(result.mcpNodebbUrl, DEFAULTS.mcpNodebbUrl);
            assert.strictEqual(result.mcpServiceUid, 0);
            assert.strictEqual(result.mcpBearerToken, "");
        });

        it("normalizes categories and removes duplicates", function () {
            const result = Validation.normalize({
                excludedCategories: [1, "2", 2, 0, -1, "invalid", 3.5]
            }, DEFAULTS);

            assert.deepStrictEqual(result.excludedCategories, [1, 2]);
        });

        it("normalizes boolean settings", function () {
            assert.strictEqual(
                Validation.normalize({ mcpEnabled: "true" }, DEFAULTS).mcpEnabled,
                true
            );

            assert.strictEqual(
                Validation.normalize({ mcpEnabled: "false" }, DEFAULTS).mcpEnabled,
                false
            );
        });

        it("preserves valid settings", function () {
            const result = Validation.normalize({
                mcpEnabled: true,
                mcpHost: "services.example.com",
                mcpPort: 3100,
                mcpNodebbUrl: "https://forum.example.com",
                mcpServiceUid: 42,
                mcpBearerToken: "a".repeat(32)
            }, DEFAULTS);

            assert.strictEqual(result.mcpEnabled, true);
            assert.strictEqual(result.mcpHost, "services.example.com");
            assert.strictEqual(result.mcpPort, 3100);
            assert.strictEqual(result.mcpNodebbUrl, "https://forum.example.com");
            assert.strictEqual(result.mcpServiceUid, 42);
            assert.strictEqual(result.mcpBearerToken, "a".repeat(32));
        });
    });
});
