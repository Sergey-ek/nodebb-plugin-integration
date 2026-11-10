"use strict";

const Config = require("../config");
const Indexer = require("../ai/indexer");
const Topics = require("../nodebb/topics");

let initialized = false;

function getPostId(data) {
    return Number(data?.post?.pid || data?.pid || 0);
}

function getPostIds(data) {
    const posts = Array.isArray(data?.posts) ? data.posts : [];

    return [
        ...new Set(
            posts
                .map(post => Number(post?.pid || post))
                .filter(pid => Number.isSafeInteger(pid) && pid > 0)
        )
    ];
}

async function isAiEnabled() {
    const settings = await Config.get();
    return settings.aiProvider === "openai";
}

async function indexEvent(data) {
    if (!(await isAiEnabled())) {
        return data;
    }

    const pid = getPostId(data);

    if (!pid) {
        return data;
    }

    try {
        await Indexer.indexPost(pid);
    } catch (error) {
        console.error(
            `[Integration] post indexing failed (${pid}):`,
            error.message
        );
    }

    return data;
}

async function removeEvent(data) {
    if (!(await isAiEnabled())) {
        return data;
    }

    const pid = getPostId(data);

    if (!pid) {
        return data;
    }

    try {
        await Indexer.removePost(pid);
    } catch (error) {
        console.error(
            `[Integration] post removal failed (${pid}):`,
            error.message
        );
    }

    return data;
}

async function purgePosts(data) {
    if (!(await isAiEnabled())) {
        return data;
    }

    const pids = getPostIds(data);

    for (const pid of pids) {
        try {
            await Indexer.removePost(pid);
        } catch (error) {
            console.error(
                `[Integration] post purge failed (${pid}):`,
                error.message
            );
        }
    }

    return data;
}

async function topicDelete(data) {
    if (!(await isAiEnabled())) {
        return data;
    }

    const tid = Number(data?.topic?.tid || data?.tid || 0);

    if (!Number.isSafeInteger(tid) || tid <= 0) {
        return data;
    }

    try {
        const pids = await Topics.getTopicPids(tid);

        for (const pid of pids) {
            try {
                await Indexer.removePost(pid);
            } catch (error) {
                console.error(
                    `[Integration] topic post removal failed (${pid}):`,
                    error.message
                );
            }
        }
    } catch (error) {
        console.error(
            `[Integration] topic removal failed (${tid}):`,
            error.message
        );
    }

    return data;
}

async function topicRestore(data) {
    if (!(await isAiEnabled())) {
        return data;
    }

    const tid = Number(data?.topic?.tid || data?.tid || 0);

    if (!Number.isSafeInteger(tid) || tid <= 0) {
        return data;
    }

    try {
        const pids = await Topics.getTopicPids(tid);
        await Indexer.indexPosts(pids);
    } catch (error) {
        console.error(
            `[Integration] topic restoration failed (${tid}):`,
            error.message
        );
    }

    return data;
}

async function init() {
    if (initialized) {
        return;
    }

    initialized = true;

    console.log("[Integration] NodeBB event handlers initialized");
}

module.exports = {
    init,
    postSave: indexEvent,
    postEdit: indexEvent,
    postDelete: removeEvent,
    postRestore: indexEvent,
    postsPurge: purgePosts,
    topicDelete,
    topicRestore
};
