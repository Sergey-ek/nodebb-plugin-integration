"use strict";

const NodeBB = require("./index");

const FIELDS = [
    "tid", "uid", "title", "cid", "timestamp", "mainPid", "deleted", "postcount"
];

function validId(value, name) {
    const id = Number(value);
    if (!Number.isSafeInteger(id) || id <= 0) {
        throw new TypeError(`Invalid ${name}`);
    }
    return id;
}

async function getTopic(tid) {
    tid = validId(tid, "topic ID");
    const topics = NodeBB.get("topics");

    if (typeof topics.getTopicFields !== "function") {
        throw new Error("NodeBB topics.getTopicFields is unavailable");
    }

    return topics.getTopicFields(tid, FIELDS);
}

async function getTopicData(tid) {
    tid = validId(tid, "topic ID");
    const topics = NodeBB.get("topics");

    if (typeof topics.getTopicData !== "function") {
        throw new Error("NodeBB topics.getTopicData is unavailable");
    }

    return topics.getTopicData(tid);
}

async function getTopicPids(tid) {
    tid = validId(tid, "topic ID");
    const topics = NodeBB.get("topics");

    if (typeof topics.getPids !== "function") {
        throw new Error("NodeBB topics.getPids is unavailable");
    }

    const pids = await topics.getPids(tid);

    return [...new Set(
        (Array.isArray(pids) ? pids : [])
            .map(Number)
            .filter(pid => Number.isSafeInteger(pid) && pid > 0)
    )];
}

async function getTopics(tids = []) {
    if (!Array.isArray(tids)) {
        throw new TypeError("Topic IDs must be an array");
    }

    const unique = [...new Set(
        tids.map(Number).filter(
            tid => Number.isSafeInteger(tid) && tid > 0
        )
    )];

    if (!unique.length) return [];

    const topics = NodeBB.get("topics");

    if (typeof topics.getTopicsFields === "function") {
        return topics.getTopicsFields(unique, FIELDS);
    }

    const result = [];

    for (const tid of unique) {
        const topic = await getTopic(tid);
        if (topic) result.push(topic);
    }

    return result;
}

async function createTopic(data) {
    const topics = NodeBB.get("topics");

    if (typeof topics.post !== "function") {
        throw new Error("NodeBB topics.post is unavailable");
    }

    return topics.post(data);
}

async function createReply(data) {
    const topics = NodeBB.get("topics");

    if (typeof topics.reply !== "function") {
        throw new Error("NodeBB topics.reply is unavailable");
    }

    return topics.reply(data);
}

async function deleteTopic(tid, uid) {
    tid = validId(tid, "topic ID");
    uid = validId(uid, "user ID");

    const topics = NodeBB.get("topics");

    if (!topics.tools || typeof topics.tools.delete !== "function") {
        throw new Error("NodeBB topics.tools.delete is unavailable");
    }

    return topics.tools.delete(tid, uid);
}

async function restoreTopic(tid, uid) {
    tid = validId(tid, "topic ID");
    uid = validId(uid, "user ID");

    const topics = NodeBB.get("topics");

    if (!topics.tools || typeof topics.tools.restore !== "function") {
        throw new Error("NodeBB topics.tools.restore is unavailable");
    }

    return topics.tools.restore(tid, uid);
}

async function listTopics(options) {
    const topics = NodeBB.get("topics");

    if (typeof topics.getSortedTopics !== "function") {
        throw new Error("NodeBB topics.getSortedTopics is unavailable");
    }

    const params = {
        uid: validId(options.uid, "user ID"),
        start: options.start,
        stop: options.stop,
        sort: options.sort || "recent"
    };

    if (options.cid !== undefined) {
        params.cids = validId(options.cid, "category ID");
    }

    return topics.getSortedTopics(params);
}

async function getTopicPosts(tid, uid, start, limit, reverse = false) {
    tid = validId(tid, "topic ID");
    uid = validId(uid, "user ID");

    const topics = NodeBB.get("topics");
    const topicData = await getTopicData(tid);

    if (!topicData) return [];

    if (typeof topics.getTopicPosts !== "function") {
        throw new Error("NodeBB topics.getTopicPosts is unavailable");
    }

    const stop = start + limit - 1;

    return topics.getTopicPosts(
        topicData,
        `tid:${tid}:posts`,
        start,
        stop,
        uid,
        Boolean(reverse)
    );
}

module.exports = {
    getTopic,
    getTopicData,
    getTopics,
    getTopicPids,
    createTopic,
    createReply,
    deleteTopic,
    restoreTopic,
    listTopics,
    getTopicPosts,
    FIELDS
};
