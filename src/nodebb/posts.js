"use strict";

const NodeBB = require("./index");

const META_FIELDS = [
    "pid", "tid", "uid", "timestamp", "deleted", "cid"
];

const CONTENT_FIELDS = ["pid", "content"];

function validatePid(pid) {
    pid = Number(pid);

    if (!Number.isSafeInteger(pid) || pid <= 0) {
        throw new TypeError("Invalid post ID");
    }

    return pid;
}

function validateUid(uid) {
    uid = Number(uid);

    if (!Number.isSafeInteger(uid) || uid <= 0) {
        throw new TypeError("Invalid user ID");
    }

    return uid;
}

async function getPostMeta(pid) {
    pid = validatePid(pid);
    const posts = NodeBB.get("posts");

    if (typeof posts.getPostFields !== "function") {
        throw new Error("NodeBB posts.getPostFields is unavailable");
    }

    return posts.getPostFields(pid, META_FIELDS);
}

async function getPostContent(pid) {
    pid = validatePid(pid);
    const posts = NodeBB.get("posts");

    if (typeof posts.getPostFields !== "function") {
        throw new Error("NodeBB posts.getPostFields is unavailable");
    }

    return posts.getPostFields(pid, CONTENT_FIELDS);
}

async function getPosts(pids = [], uid) {
    if (!Array.isArray(pids)) {
        throw new TypeError("Post IDs must be an array");
    }

    uid = Number(uid);

    if (!Number.isSafeInteger(uid) || uid < 0) {
        throw new TypeError("Invalid user ID");
    }

    const unique = [...new Set(
        pids.map(Number).filter(
            pid => Number.isSafeInteger(pid) && pid > 0
        )
    )];

    if (!unique.length) return [];

    const posts = NodeBB.get("posts");

    if (typeof posts.getPostsByPids !== "function") {
        throw new Error("NodeBB posts.getPostsByPids is unavailable");
    }

    const result = await posts.getPostsByPids(unique, uid);

    return result.posts || result;
}

async function editPost(pid, uid, content) {
    pid = validatePid(pid);
    uid = validateUid(uid);

    const posts = NodeBB.get("posts");

    if (typeof posts.edit !== "function") {
        throw new Error("NodeBB posts.edit is unavailable");
    }

    return posts.edit({ pid, uid, content });
}

async function deletePost(pid, uid) {
    pid = validatePid(pid);
    uid = validateUid(uid);

    const posts = NodeBB.get("posts");

    if (!posts.tools || typeof posts.tools.delete !== "function") {
        throw new Error("NodeBB posts.tools.delete is unavailable");
    }

    return posts.tools.delete(uid, pid);
}

async function restorePost(pid, uid) {
    pid = validatePid(pid);
    uid = validateUid(uid);

    const posts = NodeBB.get("posts");

    if (!posts.tools || typeof posts.tools.restore !== "function") {
        throw new Error("NodeBB posts.tools.restore is unavailable");
    }

    return posts.tools.restore(uid, pid);
}

async function getUserPostIds(uid, start, stop) {
    uid = validateUid(uid);

    const users = NodeBB.get("users");

    if (typeof users.getPostIds !== "function") {
        throw new Error("NodeBB users.getPostIds is unavailable");
    }

    return users.getPostIds(uid, start, stop);
}

module.exports = {
    getPostMeta,
    getPostContent,
    getPosts,
    editPost,
    deletePost,
    restorePost,
    getUserPostIds,
    META_FIELDS,
    CONTENT_FIELDS
};
