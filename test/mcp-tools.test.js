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


describe("MCP extended tool validation", () => {
    it("validates all new tool arguments", () => {
        const cases = [
            ["create_topic", {
                cid: 2, title: " Test ", content: "Body", tags: ["tag"]
            }, {
                cid: 2, title: "Test", content: "Body", tags: ["tag"]
            }],
            ["delete_topic", { tid: 3 }, { tid: 3 }],
            ["restore_topic", { tid: 3 }, { tid: 3 }],
            ["list_topics", {
                start: 10, limit: 30, sort: "posts", cid: 2
            }, {
                start: 10, limit: 30, sort: "posts", cid: 2
            }],
            ["create_post", { tid: 3, content: "Reply" },
                { tid: 3, content: "Reply" }],
            ["edit_post", { pid: 4, content: "Edited" },
                { pid: 4, content: "Edited" }],
            ["delete_post", { pid: 4 }, { pid: 4 }],
            ["restore_post", { pid: 4 }, { pid: 4 }],
            ["delete_user_posts", {
                uid: 5, start: 10, limit: 50
            }, {
                uid: 5, start: 10, limit: 50
            }],
            ["list_posts", {
                tid: 3, start: 10, limit: 30, reverse: true
            }, {
                tid: 3, start: 10, limit: 30, reverse: true
            }]
        ];

        for (const [name, args, expected] of cases) {
            assert.deepEqual(Tools.validateArguments(name, args), expected, name);
        }
    });

    it("applies pagination and optional argument defaults", () => {
        assert.deepEqual(Tools.validateArguments("create_topic", {
            cid: 1, title: "Title", content: "Body"
        }), {
            cid: 1, title: "Title", content: "Body", tags: []
        });

        assert.deepEqual(Tools.validateArguments("list_topics", {}), {
            start: 0, limit: 20, sort: "recent"
        });

        assert.deepEqual(Tools.validateArguments("delete_user_posts", {
            uid: 5
        }), {
            uid: 5, start: 0, limit: 100
        });

        assert.deepEqual(Tools.validateArguments("list_posts", {
            tid: 3
        }), {
            tid: 3, start: 0, limit: 20, reverse: false
        });
    });

    it("rejects invalid arguments for all new tools", () => {
        const invalidCases = [
            ["create_topic", { cid: 0, title: "T", content: "B" }],
            ["create_topic", { cid: 1, title: " ", content: "B" }],
            ["create_topic", { cid: 1, title: "T", content: "" }],
            ["create_topic", {
                cid: 1, title: "T", content: "B", tags: ["", "ok"]
            }],
            ["create_topic", {
                cid: 1, title: "T", content: "B", tags: Array(11).fill("x")
            }],
            ["delete_topic", { tid: 0 }],
            ["restore_topic", { tid: -1 }],
            ["list_topics", { start: -1 }],
            ["list_topics", { limit: 101 }],
            ["list_topics", { sort: "invalid" }],
            ["list_topics", { cid: 0 }],
            ["create_post", { tid: 0, content: "Reply" }],
            ["create_post", { tid: 1, content: " " }],
            ["edit_post", { pid: 0, content: "Text" }],
            ["edit_post", { pid: 1, content: "" }],
            ["delete_post", { pid: 0 }],
            ["restore_post", { pid: 0 }],
            ["delete_user_posts", { uid: 0 }],
            ["delete_user_posts", { uid: 1, limit: 101 }],
            ["delete_user_posts", { uid: 1, start: -1 }],
            ["list_posts", { tid: 0 }],
            ["list_posts", { tid: 1, limit: 101 }],
            ["list_posts", { tid: 1, reverse: "true" }]
        ];

        for (const [name, args] of invalidCases) {
            assert.throws(
                () => Tools.validateArguments(name, args),
                undefined,
                `${name}: ${JSON.stringify(args)}`
            );
        }
    });

    it("rejects extra arguments in all new tools", () => {
        const cases = [
            ["create_topic", { cid: 1, title: "T", content: "B", uid: 7 }],
            ["delete_topic", { tid: 1, uid: 7 }],
            ["restore_topic", { tid: 1, uid: 7 }],
            ["list_topics", { uid: 7 }],
            ["create_post", { tid: 1, content: "B", uid: 7 }],
            ["edit_post", { pid: 1, content: "B", uid: 7 }],
            ["delete_post", { pid: 1, uid: 7 }],
            ["restore_post", { pid: 1, uid: 7 }],
            ["delete_user_posts", { uid: 1, pid: 7 }],
            ["list_posts", { tid: 1, uid: 7 }]
        ];

        for (const [name, args] of cases) {
            assert.throws(() => Tools.validateArguments(name, args), undefined, name);
        }
    });
});

describe("MCP tool routing", () => {
    it("routes all 15 tools to their internal API endpoints", async () => {
        const expected = {
            get_forum_info: ["GET", "/api/v3/integration/internal/info", {}],
            get_post: ["POST", "/api/v3/integration/internal/post", { pid: 1 }],
            get_topic: ["POST", "/api/v3/integration/internal/topic", { tid: 1 }],
            get_user: ["POST", "/api/v3/integration/internal/user", { uid: 1 }],
            search_knowledge: ["POST", "/api/v3/integration/internal/search", {
                query: "test", limit: 5
            }],
            create_topic: ["POST", "/api/v3/integration/internal/topic/create", {
                cid: 1, title: "Title", content: "Body", tags: []
            }],
            delete_topic: ["POST", "/api/v3/integration/internal/topic/delete", { tid: 1 }],
            restore_topic: ["POST", "/api/v3/integration/internal/topic/restore", { tid: 1 }],
            list_topics: ["POST", "/api/v3/integration/internal/topics", {
                start: 0, limit: 20, sort: "recent"
            }],
            create_post: ["POST", "/api/v3/integration/internal/post/create", {
                tid: 1, content: "Reply"
            }],
            edit_post: ["POST", "/api/v3/integration/internal/post/edit", {
                pid: 1, content: "Edited"
            }],
            delete_post: ["POST", "/api/v3/integration/internal/post/delete", { pid: 1 }],
            restore_post: ["POST", "/api/v3/integration/internal/post/restore", { pid: 1 }],
            delete_user_posts: ["POST", "/api/v3/integration/internal/user/delete-posts", {
                uid: 1, start: 0, limit: 100
            }],
            list_posts: ["POST", "/api/v3/integration/internal/posts", {
                tid: 1, start: 0, limit: 20, reverse: false
            }]
        };

        const calls = [];
        const api = {
            async request(...args) {
                calls.push(args);
                return { ok: true };
            }
        };

        for (const [name, args] of Object.entries({
            get_forum_info: {},
            get_post: { pid: 1 },
            get_topic: { tid: 1 },
            get_user: { uid: 1 },
            search_knowledge: { query: "test" },
            create_topic: { cid: 1, title: "Title", content: "Body" },
            delete_topic: { tid: 1 },
            restore_topic: { tid: 1 },
            list_topics: {},
            create_post: { tid: 1, content: "Reply" },
            edit_post: { pid: 1, content: "Edited" },
            delete_post: { pid: 1 },
            restore_post: { pid: 1 },
            delete_user_posts: { uid: 1 },
            list_posts: { tid: 1 }
        })) {
            await Tools.execute(name, args, api);
        }

        assert.deepEqual(calls, Object.values(expected));
        assert.equal(Tools.definitions.length, 15);
    });
});
