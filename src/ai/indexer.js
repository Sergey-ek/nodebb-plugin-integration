"use strict";

const crypto = require("crypto");

const Config = require("../config");
const Posts = require("../nodebb/posts");
const Topics = require("../nodebb/topics");
const Embeddings = require("./embeddings");
const Qdrant = require("./qdrant");

function createId(pid) {
    const hash = crypto
        .createHash("sha256")
        .update(`nodebb-post:${pid}`)
        .digest();

    hash[6] = (hash[6] & 0x0f) | 0x50;
    hash[8] = (hash[8] & 0x3f) | 0x80;

    const hex = hash.toString("hex");

    return [
        hex.slice(0, 8),
        hex.slice(8, 12),
        hex.slice(12, 16),
        hex.slice(16, 20),
        hex.slice(20, 32)
    ].join("-");
}

async function isAiEnabled() {
    const settings = await Config.get();
    return settings.aiProvider === "openai";
}

async function removePost(pid) {
    if (!(await isAiEnabled())) {
        return false;
    }

    pid = Number(pid);

    if (!Number.isSafeInteger(pid) || pid <= 0) {
        return false;
    }

    await Qdrant.deletePoints([createId(pid)]);

    return true;
}

async function indexPost(postOrPid) {
    if (!(await isAiEnabled())) {
        return false;
    }

    const pid = Number(
        typeof postOrPid === "object"
            ? postOrPid?.pid
            : postOrPid
    );

    if (!Number.isSafeInteger(pid) || pid <= 0) {
        throw new TypeError("Invalid post ID");
    }

    const meta = await Posts.getPostMeta(pid);

    if (!meta) {
        await removePost(pid);
        return false;
    }

    const settings = await Config.get();
    const cid = Number(meta.cid);

    if (
        meta.deleted === true ||
        Number(meta.deleted) === 1 ||
        !Number.isSafeInteger(cid) ||
        cid <= 0 ||
        (
            Array.isArray(settings.excludedCategories) &&
            settings.excludedCategories.includes(cid)
        )
    ) {
        await removePost(pid);
        return false;
    }

    const tid = Number(meta.tid);
    const uid = Number(meta.uid);

    if (
        !Number.isSafeInteger(tid) || tid <= 0 ||
        !Number.isSafeInteger(uid) || uid <= 0
    ) {
        throw new Error("Invalid post metadata for post " + pid);
    }

    const topic = await Topics.getTopic(tid);

    if (!topic || topic.deleted === true || Number(topic.deleted) === 1) {
        await removePost(pid);
        return false;
    }

    const content = await Posts.getPostContent(pid);
    const post = { ...meta, ...content };
    const text = Embeddings.preparePost(post);

    if (!text) {
        await removePost(pid);
        return false;
    }

    const vector = await Embeddings.create(text);

    if (
        !Array.isArray(vector) ||
        vector.length !== settings.embeddingSize ||
        !vector.every(Number.isFinite)
    ) {
        throw new Error("Invalid embedding returned for post " + pid);
    }

    await Qdrant.ensureCollection();

    await Qdrant.upsert([
        {
            id: createId(pid),
            vector,
            payload: {
                type: "post",
                pid,
                tid,
                uid,
                cid
            }
        }
    ]);

    return true;
}

async function indexPosts(pids = []) {
    if (!Array.isArray(pids)) {
        throw new TypeError("Post IDs must be an array");
    }

    if (!(await isAiEnabled())) {
        return pids.map(postId => ({
            pid: Number(postId),
            indexed: false
        }));
    }

    const unique = [
        ...new Set(
            pids
                .map(Number)
                .filter(pid => Number.isSafeInteger(pid) && pid > 0)
        )
    ];

    const results = [];

    for (const pid of unique) {
        try {
            results.push({
                pid,
                indexed: await indexPost(pid)
            });
        } catch (error) {
            console.error(
                `[Integration] indexing post ${pid} failed:`,
                error.message
            );

            results.push({
                pid,
                indexed: false,
                error: error.message
            });
        }
    }

    return results;
}

module.exports = {
    createId,
    indexPost,
    indexPosts,
    removePost
};
