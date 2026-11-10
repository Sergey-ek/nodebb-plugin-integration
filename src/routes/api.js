"use strict";

const crypto = require("crypto");

const Config = require("../config");
const Search = require("../ai/search");
const Categories = require("../nodebb/categories");
const Meta = require("../nodebb/meta");
const Posts = require("../nodebb/posts");
const Topics = require("../nodebb/topics");
const Users = require("../nodebb/users");
const Privileges = require("../nodebb/privileges");

function validId(value) {
    const id = Number(value);
    return Number.isSafeInteger(id) && id > 0 ? id : 0;
}

function internalTokenMatches(req, expected) {
    const authorization = req.headers.authorization || "";
    const match = authorization.match(/^Bearer\s+([^\s]+)$/i);

    if (!match || typeof expected !== "string" || !expected) {
        return false;
    }

    const actualBuffer = Buffer.from(match[1]);
    const expectedBuffer = Buffer.from(expected);

    return actualBuffer.length === expectedBuffer.length &&
        crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

exports.internalAuth = async function (req, res, next) {
    try {
        const settings = await Config.get();

        if (!settings.mcpEnabled) {
            return res.status(403).json({ error: "MCP is disabled" });
        }

        if (!internalTokenMatches(req, settings.internalApiToken)) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        req.integrationSettings = settings;
        return next();
    } catch (error) {
        console.error("[Integration] Internal authentication failed:", error.message);
        return res.status(500).json({ error: "Internal API error" });
    }
};

exports.apiSearch = async function (req, res) {
    try {
        const query = typeof req.body?.query === "string"
            ? req.body.query.trim()
            : "";

        if (!query || query.length > 2000) {
            return res.status(400).json({ error: "Invalid search query" });
        }

        const results = await Search.searchText(query, req.uid);

        return res.json({ results });
    } catch (error) {
        if (error.code === "AI_DISABLED") {
            return res.status(503).json({ error: error.message });
        }

        console.error("[NodeBB Integration] Search failed:", error);
        return res.status(500).json({ error: "Search failed" });
    }
};

exports.internalInfo = async function (req, res) {
    try {
        return res.json(await Meta.getInfo());
    } catch (error) {
        console.error("[Integration] Forum info failed:", error.message);
        return res.status(500).json({ error: "Unable to get forum information" });
    }
};

exports.internalPost = async function (req, res) {
    try {
        const pid = validId(req.body?.pid);
        const uid = req.integrationSettings.mcpServiceUid;

        if (!pid) {
            return res.status(400).json({ error: "Invalid post ID" });
        }

        const post = await Posts.getPostMeta(pid);

        if (!post || post.deleted) {
            return res.status(404).json({ error: "Post not found" });
        }

        const tid = validId(post.tid);

        if (!tid) {
            return res.status(404).json({ error: "Post not found" });
        }

        const [postAllowed, topicAllowed] = await Promise.all([
            Privileges.canReadPost(pid, uid),
            Privileges.canReadTopic(tid, uid)
        ]);

        if (!postAllowed || !topicAllowed) {
            return res.status(404).json({ error: "Post not found" });
        }

        const content = await Posts.getPostContent(pid);

        if (!content) {
            return res.status(404).json({ error: "Post not found" });
        }

        return res.json({
            pid: Number(post.pid),
            tid,
            uid: Number(post.uid),
            cid: Number(post.cid),
            content: content.content,
            timestamp: post.timestamp
        });
    } catch (error) {
        console.error("[Integration] MCP post retrieval failed:", error.message);
        return res.status(500).json({ error: "Unable to get post" });
    }
};

exports.internalTopic = async function (req, res) {
    try {
        const tid = validId(req.body?.tid);
        const uid = req.integrationSettings.mcpServiceUid;

        if (!tid) {
            return res.status(400).json({ error: "Invalid topic ID" });
        }

        if (!(await Privileges.canReadTopic(tid, uid))) {
            return res.status(404).json({ error: "Topic not found" });
        }

        const topic = await Topics.getTopic(tid);

        if (!topic || topic.deleted) {
            return res.status(404).json({ error: "Topic not found" });
        }

        return res.json({
            tid: Number(topic.tid),
            uid: Number(topic.uid),
            title: topic.title,
            cid: Number(topic.cid),
            timestamp: topic.timestamp,
            mainPid: Number(topic.mainPid)
        });
    } catch (error) {
        console.error("[Integration] MCP topic retrieval failed:", error.message);
        return res.status(500).json({ error: "Unable to get topic" });
    }
};

exports.internalUser = async function (req, res) {
    try {
        const uid = validId(req.body?.uid);

        if (!uid) {
            return res.status(400).json({ error: "Invalid user ID" });
        }

        const user = await Users.getUser(uid);

        if (!user || !Number(user.uid)) {
            return res.status(404).json({ error: "User not found" });
        }

        return res.json({
            uid: Number(user.uid),
            username: user.username,
            userslug: user.userslug,
            picture: user.picture
        });
    } catch (error) {
        console.error("[Integration] MCP user retrieval failed:", error.message);
        return res.status(500).json({ error: "Unable to get user" });
    }
};

exports.internalSearch = async function (req, res) {
    try {
        const query = typeof req.body?.query === "string"
            ? req.body.query.trim()
            : "";

        const requestedLimit = Number(req.body?.limit ?? 5);

        if (!query || query.length > 2000) {
            return res.status(400).json({ error: "Invalid search query" });
        }

        if (!Number.isSafeInteger(requestedLimit) || requestedLimit < 1) {
            return res.status(400).json({ error: "Invalid search limit" });
        }

        const limit = Math.min(requestedLimit, 20);
        const uid = req.integrationSettings.mcpServiceUid;

        const results = await Search.searchText(query, uid, limit);

        return res.json({ results });
    } catch (error) {
        if (error.code === "AI_DISABLED") {
            return res.status(503).json({ error: error.message });
        }

        console.error("[Integration] MCP search failed:", error.message);
        return res.status(500).json({ error: "Search failed" });
    }
};

exports.renderAdmin = async function (req, res) {
    try {
        const [settings, allCategories] = await Promise.all([
            Config.info(),
            Categories.getAll()
        ]);

        const excluded = new Set(settings.excludedCategories.map(Number));

        const categories = allCategories
            .filter(category => category.cid > 0)
            .map(category => ({
                ...category,
                selected: excluded.has(Number(category.cid))
            }));

        return res.render("admin/plugins/integration", {
            title: "NodeBB Integration",
            settings,
            categories
        });
    } catch (error) {
        console.error("[NodeBB Integration] ACP render failed:", error);

        return res.status(500).render("500", {
            title: "NodeBB Integration error"
        });
    }
};
