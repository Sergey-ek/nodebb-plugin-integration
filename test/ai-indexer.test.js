"use strict";

const assert = require("node:assert/strict");
const { describe, it } = require("mocha");
const proxyquire = require("proxyquire").noCallThru();

function loadIndexer(overrides = {}) {
    const calls = {
        deleted: [],
        upserted: [],
        contentReads: 0,
        topicReads: 0
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
        "../nodebb/posts": {
            getPostMeta: async pid => ({
                pid,
                tid: 20,
                uid: 2,
                cid: 3,
                deleted: 0
            }),
            getPostContent: async () => {
                calls.contentReads++;
                return { content: "Test post content" };
            }
        },
        "../nodebb/topics": {
            getTopic: async tid => {
                calls.topicReads++;
                return { tid, deleted: 0 };
            }
        },
        "./embeddings": {
            preparePost: () => "Test post content",
            create: async () => [0.1, 0.2, 0.3]
        },
        "./qdrant": {
            deletePoints: async ids => calls.deleted.push(ids),
            ensureCollection: async () => {},
            upsert: async points => calls.upserted.push(points)
        },
        ...overrides
    };

    return {
        Indexer: proxyquire("../src/ai/indexer", stubs),
        calls,
        settings
    };
}

describe("AI indexer", () => {
    it("removes a post from Qdrant when its topic is deleted", async () => {
        const { Indexer, calls } = loadIndexer({
            "../nodebb/topics": {
                getTopic: async tid => ({ tid, deleted: 1 })
            }
        });

        assert.equal(await Indexer.indexPost(10), false);
        assert.equal(calls.topicReads, 0);
        assert.equal(calls.contentReads, 0);
        assert.equal(calls.upserted.length, 0);
        assert.equal(calls.deleted.length, 1);
    });

    it("removes a post when its topic no longer exists", async () => {
        const { Indexer, calls } = loadIndexer({
            "../nodebb/topics": {
                getTopic: async () => null
            }
        });

        assert.equal(await Indexer.indexPost(10), false);
        assert.equal(calls.contentReads, 0);
        assert.equal(calls.upserted.length, 0);
        assert.equal(calls.deleted.length, 1);
    });

    it("does not index a deleted post", async () => {
        const { Indexer, calls } = loadIndexer({
            "../nodebb/posts": {
                getPostMeta: async pid => ({
                    pid,
                    tid: 20,
                    uid: 2,
                    cid: 3,
                    deleted: 1
                }),
                getPostContent: async () => {
                    calls.contentReads++;
                    return { content: "Deleted content" };
                }
            }
        });

        assert.equal(await Indexer.indexPost(10), false);
        assert.equal(calls.topicReads, 0);
        assert.equal(calls.contentReads, 0);
        assert.equal(calls.upserted.length, 0);
        assert.equal(calls.deleted.length, 1);
    });

    it("indexes a post from an active topic", async () => {
        const { Indexer, calls } = loadIndexer();

        assert.equal(await Indexer.indexPost(10), true);
        assert.equal(calls.topicReads, 1);
        assert.equal(calls.contentReads, 1);
        assert.equal(calls.upserted.length, 1);

        const point = calls.upserted[0][0];
        assert.equal(point.payload.pid, 10);
        assert.equal(point.payload.tid, 20);
        assert.equal(point.payload.uid, 2);
        assert.equal(point.payload.cid, 3);
        assert.deepEqual(point.vector, [0.1, 0.2, 0.3]);
    });

    it("does not connect to Qdrant when AI is disabled", async () => {
        const { Indexer, calls } = loadIndexer({
            "../config": {
                get: async () => ({
                    aiProvider: "fake",
                    embeddingSize: 3,
                    excludedCategories: []
                })
            }
        });

        assert.equal(await Indexer.indexPost(10), false);
        assert.equal(calls.topicReads, 0);
        assert.equal(calls.contentReads, 0);
        assert.equal(calls.upserted.length, 0);
        assert.equal(calls.deleted.length, 0);
    });
});
