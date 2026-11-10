"use strict";

const Config = require("../config");
const Embeddings = require("./embeddings");
const Qdrant = require("./qdrant");
const Posts = require("../nodebb/posts");
const Privileges = require("../nodebb/privileges");

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 20;
const OVERFETCH_FACTOR = 5;

function createAiDisabledError() {
    const error = new Error("AI provider is disabled. Select OpenAI to enable semantic search.");
    error.code = "AI_DISABLED";
    error.statusCode = 503;
    return error;
}

function validateUid(uid) {
    uid = Number(uid);

    if (!Number.isSafeInteger(uid) || uid < 0) {
        throw new TypeError("Invalid user ID");
    }

    return uid;
}

function normalizeLimit(limit) {
    limit = Number(limit);

    if (!Number.isSafeInteger(limit)) {
        return DEFAULT_LIMIT;
    }

    return Math.max(1, Math.min(limit, MAX_LIMIT));
}

async function search(query, uid, limit = DEFAULT_LIMIT) {
    const settings = await Config.get();

    if (settings.aiProvider !== "openai") {
        throw createAiDisabledError();
    }

    if (typeof query !== "string" || !query.trim()) {
        return [];
    }

    uid = validateUid(uid);
    limit = normalizeLimit(limit);

    const excludedCategories = Array.isArray(settings.excludedCategories)
        ? settings.excludedCategories
        : [];

    const vector = await Embeddings.create(query.trim());

    if (
        !Array.isArray(vector) ||
        vector.length !== settings.embeddingSize ||
        !vector.every(Number.isFinite)
    ) {
        throw new Error("Invalid query embedding");
    }

    const candidates = await Qdrant.search(
        vector,
        Math.min(limit * OVERFETCH_FACTOR, 100)
    );

    if (!Array.isArray(candidates) || !candidates.length) {
        return [];
    }

    const allowed = [];

    for (const candidate of candidates) {
        const payload = candidate.payload || {};
        const pid = Number(payload.pid);
        const tid = Number(payload.tid);
        const cid = Number(payload.cid);

        if (
            payload.type !== "post" ||
            !Number.isSafeInteger(pid) || pid <= 0 ||
            !Number.isSafeInteger(tid) || tid <= 0 ||
            !Number.isSafeInteger(cid) || cid <= 0
        ) {
            continue;
        }

        if (excludedCategories.includes(cid)) {
            continue;
        }

        const [postAllowed, topicAllowed] = await Promise.all([
            Privileges.canReadPost(pid, uid),
            Privileges.canReadTopic(tid, uid)
        ]);

        if (postAllowed && topicAllowed) {
            allowed.push({
                pid,
                tid,
                cid,
                score: Number.isFinite(Number(candidate.score))
                    ? Number(candidate.score)
                    : 0
            });
        }

        if (allowed.length >= limit) {
            break;
        }
    }

    if (!allowed.length) {
        return [];
    }

    const posts = await Posts.getPosts(
        allowed.map(item => item.pid),
        uid
    );

    const postsById = new Map(
        posts.map(post => [Number(post.pid), post])
    );

    return allowed
        .map(item => {
            const post = postsById.get(item.pid);

            if (
                !post ||
                post.deleted === true ||
                Number(post.deleted) === 1 ||
                Number(post.pid) !== item.pid ||
                Number(post.tid) !== item.tid ||
                Number(post.cid) !== item.cid ||
                !Number.isSafeInteger(Number(post.uid)) ||
                Number(post.uid) <= 0 ||
                excludedCategories.includes(Number(post.cid))
            ) {
                return null;
            }

            return {
                pid: item.pid,
                tid: item.tid,
                uid: Number(post.uid),
                cid: item.cid,
                score: item.score,
                content: post.content
            };
        })
        .filter(Boolean)
        .slice(0, limit);
}

async function searchText(query, uid, limit = DEFAULT_LIMIT) {
    return search(query, uid, limit);
}

module.exports = {
    search,
    searchText
};
