"use strict";

const NodeBB = require("./index");

function validId(value) {
    const id = Number(value);
    return Number.isSafeInteger(id) && id > 0;
}

function validUid(value) {
    const uid = Number(value);
    return Number.isSafeInteger(uid) && uid >= 0;
}

async function canReadPost(pid, uid) {
    pid = Number(pid);
    uid = Number(uid);

    if (!validId(pid) || !validUid(uid)) {
        return false;
    }

    try {
        const privileges = NodeBB.get("privileges");

        if (
            !privileges.posts ||
            typeof privileges.posts.canRead !== "function"
        ) {
            return false;
        }

        return Boolean(await privileges.posts.canRead(pid, uid));
    } catch (error) {
        console.error("[Integration] post access check failed:", error.message);
        return false;
    }
}

async function canReadTopic(tid, uid) {
    tid = Number(tid);
    uid = Number(uid);

    if (!validId(tid) || !validUid(uid)) {
        return false;
    }

    try {
        const privileges = NodeBB.get("privileges");

        if (
            !privileges.topics ||
            typeof privileges.topics.canRead !== "function"
        ) {
            return false;
        }

        return Boolean(await privileges.topics.canRead(tid, uid));
    } catch (error) {
        console.error("[Integration] topic access check failed:", error.message);
        return false;
    }
}

module.exports = {
    canReadPost,
    canReadTopic
};