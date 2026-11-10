"use strict";

const NodeBB = require("./index");

const FIELDS = [
    "tid",
    "uid",
    "title",
    "cid",
    "timestamp",
    "mainPid",
    "deleted"
];

async function getTopic(tid) {
    tid = Number(tid);

    if (!Number.isSafeInteger(tid) || tid <= 0) {
        throw new TypeError("Invalid topic ID");
    }

    const topics = NodeBB.get("topics");

    if (typeof topics.getTopicFields !== "function") {
        throw new Error("NodeBB topics.getTopicFields is unavailable");
    }

    return topics.getTopicFields(tid, FIELDS);
}

async function getTopicPids(tid) {
    tid = Number(tid);

    if (!Number.isSafeInteger(tid) || tid <= 0) {
        throw new TypeError("Invalid topic ID");
    }

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

    if (!unique.length) {
        return [];
    }

    const topics = NodeBB.get("topics");

    if (typeof topics.getTopicsFields === "function") {
        return topics.getTopicsFields(unique, FIELDS);
    }

    const result = [];

    for (const tid of unique) {
        const topic = await getTopic(tid);

        if (topic) {
            result.push(topic);
        }
    }

    return result;
}

module.exports = {
    getTopic,
    getTopics,
    getTopicPids,
    FIELDS
};