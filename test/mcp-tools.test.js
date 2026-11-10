"use strict";

const assert = require("node:assert/strict");
const { describe, it } = require("mocha");

const Tools = require("../src/mcp/tools");

describe("MCP tool argument validation", () => {
    it("accepts forum info without arguments", () => {
        assert.deepEqual(Tools.validateArguments("get_forum_info", {}), {});
    });

    it("validates post, topic and user IDs", () => {
        assert.deepEqual(
            Tools.validateArguments("get_post", { pid: 12 }),
            { pid: 12 }
        );
        assert.deepEqual(
            Tools.validateArguments("get_topic", { tid: 34 }),
            { tid: 34 }
        );
        assert.deepEqual(
            Tools.validateArguments("get_user", { uid: 56 }),
            { uid: 56 }
        );
    });

    it("rejects invalid IDs", () => {
        for (const name of ["get_post", "get_topic", "get_user"]) {
            const key = name === "get_post" ? "pid" :
                name === "get_topic" ? "tid" : "uid";

            for (const value of [0, -1, 1.5, "12", Number.MAX_SAFE_INTEGER + 1]) {
                assert.throws(() => Tools.validateArguments(name, {
                    [key]: value
                }));
            }
        }
    });

    it("rejects unknown and extra arguments", () => {
        assert.throws(() => Tools.validateArguments("unknown", {}));
        assert.throws(() => Tools.validateArguments("get_forum_info", {
            uid: 1
        }));
        assert.throws(() => Tools.validateArguments("get_post", {
            pid: 1,
            uid: 2
        }));
    });

    it("rejects non-object arguments", () => {
        for (const args of [null, [], "value", 12]) {
            assert.throws(() => Tools.validateArguments("get_forum_info", args));
        }
    });

    it("normalizes search query and default limit", () => {
        assert.deepEqual(
            Tools.validateArguments("search_knowledge", {
                query: "  NodeBB integration  "
            }),
            {
                query: "NodeBB integration",
                limit: 5
            }
        );
    });

    it("accepts valid search limits", () => {
        assert.deepEqual(
            Tools.validateArguments("search_knowledge", {
                query: "test",
                limit: 20
            }),
            { query: "test", limit: 20 }
        );
    });

    it("rejects invalid search queries and limits", () => {
        for (const query of ["", "   ", "x".repeat(2001), 123, null]) {
            assert.throws(() => Tools.validateArguments("search_knowledge", {
                query
            }));
        }

        for (const limit of [0, -1, 21, 1.5, "5", null]) {
            assert.throws(() => Tools.validateArguments("search_knowledge", {
                query: "test",
                limit
            }));
        }
    });

    it("sends only validated arguments to NodeBB", async () => {
        const calls = [];
        const api = {
            async request(...args) {
                calls.push(args);
                return { ok: true };
            }
        };

        await Tools.execute("get_post", { pid: 12 }, api);
        await Tools.execute("search_knowledge", {
            query: " test ",
            limit: 3
        }, api);

        assert.deepEqual(calls, [
            ["POST", "/api/v3/integration/internal/post", { pid: 12 }],
            ["POST", "/api/v3/integration/internal/search", {
                query: "test",
                limit: 3
            }]
        ]);
    });
});

describe("MCP tool registration", () => {
    it("registers tool listing and execution handlers", async () => {
        const handlers = [];
        const server = {
            setRequestHandler(schema, handler) {
                handlers.push({ schema, handler });
            }
        };

        Tools.register(server, {
            async request() {
                return { ok: true };
            }
        });

        assert.equal(handlers.length, 2);

        const result = await handlers[0].handler();

        assert.deepEqual(
            result.tools.map((tool) => tool.name),
            Tools.definitions.map((tool) => tool.name)
        );
    });

    it("returns AI_DISABLED errors through MCP", async () => {
        const handlers = [];
        const server = {
            setRequestHandler(schema, handler) {
                handlers.push({ schema, handler });
            }
        };

        Tools.register(server, {
            async request() {
                const error = new Error(
                    "AI provider is disabled. Select OpenAI to enable semantic search."
                );
                error.code = "AI_DISABLED";
                throw error;
            }
        });

        const result = await handlers[1].handler({
            params: {
                name: "search_knowledge",
                arguments: { query: "test" }
            }
        });

        assert.equal(result.isError, true);
        assert.equal(
            result.content[0].text,
            "AI provider is disabled. Select OpenAI to enable semantic search."
        );
    });
});

