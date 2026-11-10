"use strict";

const assert = require("node:assert/strict");
const { describe, it } = require("mocha");
const proxyquire = require("proxyquire").noCallThru();

function loadSearch(overrides = {}) {
    const calls = {
        postReads: [],
        postAcl: [],
        topicAcl: []
    };

    const settings = {
        aiProvider: "openai",
        embeddingSize: 3,
        excludedCategories: []
    };

    const stubs = {
        "../config": {
            get: async () => settings
        },
        "./embeddings": {
            create: async () => [0.1, 0.2, 0.3]
        },
        "./qdrant": {
            search: async () => [{
                score: 0.95,
                payload: {
                    type: "post",
                    pid: 10,
                    tid: 20,
                    cid: 3
                }
            }]
        },
        "../nodebb/posts": {
            getPosts: async (pids, uid) => {
                calls.postReads.push({ pids, uid });
                return [{
                    pid: 10,
                    tid: 20,
                    uid: 2,
                    cid: 3,
                    deleted: 0,
                    content: "Visible post"
                }];
            }
        },
        "../nodebb/privileges": {
            canReadPost: async (pid, uid) => {
                calls.postAcl.push({ pid, uid });
                return true;
            },
            canReadTopic: async (tid, uid) => {
                calls.topicAcl.push({ tid, uid });
                return true;
            }
        },
        ...overrides
    };

    return {
        Search: proxyquire("../src/ai/search", stubs),
        calls,
        settings
    };
}

describe("AI semantic search", () => {
    it("returns a post only after both ACL checks pass", async () => {
        const { Search, calls } = loadSearch();

        const result = await Search.search("test query", 5, 5);

        assert.equal(result.length, 1);
        assert.equal(result[0].pid, 10);
        assert.equal(result[0].tid, 20);
        assert.equal(result[0].cid, 3);
        assert.equal(result[0].content, "Visible post");
        assert.deepEqual(calls.postAcl, [{ pid: 10, uid: 5 }]);
        assert.deepEqual(calls.topicAcl, [{ tid: 20, uid: 5 }]);
        assert.deepEqual(calls.postReads, [{
            pids: [10],
            uid: 5
        }]);
    });

    it("does not retrieve post content when post ACL denies access", async () => {
        const { Search, calls } = loadSearch({
            "../nodebb/privileges": {
                canReadPost: async () => false,
                canReadTopic: async () => true
            }
        });

        const result = await Search.search("test query", 5);

        assert.deepEqual(result, []);
        assert.equal(calls.postReads.length, 0);
    });

    it("does not retrieve post content when topic ACL denies access", async () => {
        const { Search, calls } = loadSearch({
            "../nodebb/privileges": {
                canReadPost: async () => true,
                canReadTopic: async () => false
            }
        });

        const result = await Search.search("test query", 5);

        assert.deepEqual(result, []);
        assert.equal(calls.postReads.length, 0);
    });

    it("rejects a post whose current topic differs from Qdrant metadata", async () => {
        const { Search } = loadSearch({
            "../nodebb/posts": {
                getPosts: async () => [{
                    pid: 10,
                    tid: 99,
                    uid: 2,
                    cid: 3,
                    deleted: 0,
                    content: "Content from another topic"
                }]
            }
        });

        assert.deepEqual(await Search.search("test query", 5), []);
    });

    it("rejects a post whose current category differs from Qdrant metadata", async () => {
        const { Search } = loadSearch({
            "../nodebb/posts": {
                getPosts: async () => [{
                    pid: 10,
                    tid: 20,
                    uid: 2,
                    cid: 99,
                    deleted: 0,
                    content: "Content from another category"
                }]
            }
        });

        assert.deepEqual(await Search.search("test query", 5), []);
    });

    it("rejects deleted posts returned by NodeBB", async () => {
        const { Search } = loadSearch({
            "../nodebb/posts": {
                getPosts: async () => [{
                    pid: 10,
                    tid: 20,
                    uid: 2,
                    cid: 3,
                    deleted: 1,
                    content: "Deleted content"
                }]
            }
        });

        assert.deepEqual(await Search.search("test query", 5), []);
    });

    it("does not search when AI is disabled", async () => {
        const { Search } = loadSearch({
            "../config": {
                get: async () => ({
                    aiProvider: "fake",
                    embeddingSize: 3,
                    excludedCategories: []
                })
            }
        });

        await assert.rejects(
            Search.search("test query", 5),
            error => error.code === "AI_DISABLED"
        );
    });
});
