"use strict";

const assert = require("node:assert/strict");
const { describe, it } = require("mocha");
const proxyquire = require("proxyquire").noCallThru();

function loadEvents(provider = "openai") {
    const calls = {
        removed: [],
        indexed: [],
        topicReads: []
    };

    const Events = proxyquire("../src/events", {
        "../config": {
            get: async () => ({ aiProvider: provider })
        },
        "../ai/indexer": {
            removePost: async pid => calls.removed.push(pid),
            indexPosts: async pids => calls.indexed.push(pids)
        },
        "../nodebb/topics": {
            getTopicPids: async tid => {
                calls.topicReads.push(tid);
                return [10, 11, 12];
            }
        }
    });

    return { Events, calls };
}

describe("NodeBB topic events", () => {
    it("removes all topic post vectors on deletion", async () => {
        const { Events, calls } = loadEvents();

        await Events.topicDelete({ topic: { tid: 20 }, uid: 1 });

        assert.deepEqual(calls.topicReads, [20]);
        assert.deepEqual(calls.removed, [10, 11, 12]);
        assert.deepEqual(calls.indexed, []);
    });

    it("reindexes all topic posts on restoration", async () => {
        const { Events, calls } = loadEvents();

        await Events.topicRestore({ topic: { tid: 20 }, uid: 1 });

        assert.deepEqual(calls.topicReads, [20]);
        assert.deepEqual(calls.indexed, [[10, 11, 12]]);
        assert.deepEqual(calls.removed, []);
    });

    it("does not access NodeBB or Qdrant in fake mode", async () => {
        const { Events, calls } = loadEvents("fake");

        await Events.topicDelete({ topic: { tid: 20 } });
        await Events.topicRestore({ topic: { tid: 20 } });

        assert.deepEqual(calls.topicReads, []);
        assert.deepEqual(calls.removed, []);
        assert.deepEqual(calls.indexed, []);
    });
});
