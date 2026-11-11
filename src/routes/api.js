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

function validPage(value, fallback, maximum) {
    const number = value === undefined ? fallback : Number(value);
    return Number.isSafeInteger(number) && number >= 0 && number <= maximum
        ? number : -1;
}

function internalTokenMatches(req, expected) {
    const authorization = req.headers.authorization || "";
    const match = authorization.match(/^Bearer\s+([^\s]+)$/i);

    if (!match || typeof expected !== "string" || !expected) return false;

    const actualBuffer = Buffer.from(match[1]);
    const expectedBuffer = Buffer.from(expected);

    return actualBuffer.length === expectedBuffer.length &&
        crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function serviceUid(req) {
    return validId(req.integrationSettings?.mcpServiceUid);
}

function operationError(res, error, label) {
    console.error(`[Integration] ${label}:`, error.stack || error);
    return res.status(400).json({
        error: error.message || `${label} failed`
    });
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
        console.error("[Integration] Internal authentication failed:", error);
        return res.status(500).json({ error: "Internal API error" });
    }
};

exports.apiSearch = async function (req, res) {
    try {
        const query = typeof req.body?.query === "string"
            ? req.body.query.trim() : "";

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
        console.error("[Integration] Forum info failed:", error);
        return res.status(500).json({ error: "Unable to get forum information" });
    }
};

exports.internalPost = async function (req, res) {
    try {
        const pid = validId(req.body?.pid);
        const uid = serviceUid(req);

        if (!pid || !uid) {
            return res.status(400).json({ error: "Invalid post ID or service user" });
        }

        const post = await Posts.getPostMeta(pid);

        if (!post || post.deleted) {
            return res.status(404).json({ error: "Post not found" });
        }

        const tid = validId(post.tid);

        if (!tid) return res.status(404).json({ error: "Post not found" });

        const [postAllowed, topicAllowed] = await Promise.all([
            Privileges.canReadPost(pid, uid),
            Privileges.canReadTopic(tid, uid)
        ]);

        if (!postAllowed || !topicAllowed) {
            return res.status(404).json({ error: "Post not found" });
        }

        const content = await Posts.getPostContent(pid);

        if (!content) return res.status(404).json({ error: "Post not found" });

        return res.json({
            pid: Number(post.pid),
            tid,
            uid: Number(post.uid),
            cid: Number(post.cid),
            content: content.content,
            timestamp: post.timestamp
        });
    } catch (error) {
        console.error("[Integration] MCP post retrieval failed:", error);
        return res.status(500).json({ error: "Unable to get post" });
    }
};

exports.internalTopic = async function (req, res) {
    try {
        const tid = validId(req.body?.tid);
        const uid = serviceUid(req);

        if (!tid || !uid) {
            return res.status(400).json({ error: "Invalid topic ID or service user" });
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
        console.error("[Integration] MCP topic retrieval failed:", error);
        return res.status(500).json({ error: "Unable to get topic" });
    }
};

exports.internalUser = async function (req, res) {
    try {
        const uid = validId(req.body?.uid);

        if (!uid) return res.status(400).json({ error: "Invalid user ID" });

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
        console.error("[Integration] MCP user retrieval failed:", error);
        return res.status(500).json({ error: "Unable to get user" });
    }
};

exports.internalSearch = async function (req, res) {
    try {
        const query = typeof req.body?.query === "string"
            ? req.body.query.trim() : "";
        const requestedLimit = Number(req.body?.limit ?? 5);

        if (!query || query.length > 2000) {
            return res.status(400).json({ error: "Invalid search query" });
        }

        if (!Number.isSafeInteger(requestedLimit) || requestedLimit < 1) {
            return res.status(400).json({ error: "Invalid search limit" });
        }

        const results = await Search.searchText(
            query,
            serviceUid(req),
            Math.min(requestedLimit, 20)
        );

        return res.json({ results });
    } catch (error) {
        if (error.code === "AI_DISABLED") {
            return res.status(503).json({ error: error.message });
        }

        console.error("[Integration] MCP search failed:", error);
        return res.status(500).json({ error: "Search failed" });
    }
};

exports.internalCreateTopic = async function (req, res) {
    try {
        const uid = serviceUid(req);
        const cid = validId(req.body?.cid);
        const title = req.body?.title;
        const content = req.body?.content;
        const tags = req.body?.tags ?? [];

        if (!uid || !cid || typeof title !== "string" ||
            !title.trim() || title.length > 255 ||
            typeof content !== "string" || !content.trim() ||
            content.length > 20000 || !Array.isArray(tags) ||
            tags.length > 10 ||
            tags.some(tag => typeof tag !== "string" || !tag.trim() || tag.length > 32)) {
            return res.status(400).json({ error: "Invalid topic data" });
        }

        const result = await Topics.createTopic({
            uid,
            cid,
            title: title.trim(),
            content,
            tags
        });

        return res.json(result);
    } catch (error) {
        return operationError(res, error, "Topic creation");
    }
};

exports.internalDeleteTopic = async function (req, res) {
    try {
        const tid = validId(req.body?.tid);
        const uid = serviceUid(req);

        if (!tid || !uid) return res.status(400).json({ error: "Invalid topic ID" });

        return res.json(await Topics.deleteTopic(tid, uid));
    } catch (error) {
        return operationError(res, error, "Topic deletion");
    }
};

exports.internalRestoreTopic = async function (req, res) {
    try {
        const tid = validId(req.body?.tid);
        const uid = serviceUid(req);

        if (!tid || !uid) return res.status(400).json({ error: "Invalid topic ID" });

        return res.json(await Topics.restoreTopic(tid, uid));
    } catch (error) {
        return operationError(res, error, "Topic restoration");
    }
};

exports.internalListTopics = async function (req, res) {
    try {
        const uid = serviceUid(req);
        const start = validPage(req.body?.start, 0, 10000000);
        const limit = validPage(req.body?.limit, 20, 100);

        const sorts = ["recent", "old", "create", "posts", "votes", "views"];
        const sort = req.body?.sort ?? "recent";
        const cid = req.body?.cid === undefined ? undefined : validId(req.body.cid);

        if (!uid || start < 0 || limit < 1 || !sorts.includes(sort) ||
            (req.body?.cid !== undefined && !cid)) {
            return res.status(400).json({ error: "Invalid topic listing parameters" });
        }

        const result = await Topics.listTopics({
            uid,
            start,
            stop: start + limit - 1,
            sort,
            cid
        });

        const nextStart = Math.min(start + limit, result.topicCount);

        return res.json({
            ...result,
            nextStart,
            hasMore: nextStart < result.topicCount
        });
    } catch (error) {
        return operationError(res, error, "Topic listing");
    }
};

exports.internalCreatePost = async function (req, res) {
    try {
        const uid = serviceUid(req);
        const tid = validId(req.body?.tid);
        const content = req.body?.content;

        if (!uid || !tid || typeof content !== "string" ||
            !content.trim() || content.length > 20000) {
            return res.status(400).json({ error: "Invalid post data" });
        }

        return res.json(await Topics.createReply({ uid, tid, content }));
    } catch (error) {
        return operationError(res, error, "Post creation");
    }
};

exports.internalEditPost = async function (req, res) {
    try {
        const uid = serviceUid(req);
        const pid = validId(req.body?.pid);
        const content = req.body?.content;

        if (!uid || !pid || typeof content !== "string" ||
            !content.trim() || content.length > 20000) {
            return res.status(400).json({ error: "Invalid post data" });
        }

        return res.json(await Posts.editPost(pid, uid, content));
    } catch (error) {
        return operationError(res, error, "Post editing");
    }
};

exports.internalDeletePost = async function (req, res) {
    try {
        const uid = serviceUid(req);
        const pid = validId(req.body?.pid);

        if (!uid || !pid) return res.status(400).json({ error: "Invalid post ID" });

        return res.json(await Posts.deletePost(pid, uid));
    } catch (error) {
        return operationError(res, error, "Post deletion");
    }
};

exports.internalRestorePost = async function (req, res) {
    try {
        const uid = serviceUid(req);
        const pid = validId(req.body?.pid);

        if (!uid || !pid) return res.status(400).json({ error: "Invalid post ID" });

        return res.json(await Posts.restorePost(pid, uid));
    } catch (error) {
        return operationError(res, error, "Post restoration");
    }
};

exports.internalDeleteUserPosts = async function (req, res) {
    try {
        const actorUid = serviceUid(req);
        const targetUid = validId(req.body?.uid);
        const start = validPage(req.body?.start, 0, 10000000);
        const limit = validPage(req.body?.limit, 100, 100);

        if (!actorUid || !targetUid || start < 0 || limit < 1) {
            return res.status(400).json({ error: "Invalid bulk deletion parameters" });
        }

        const pids = await Posts.getUserPostIds(targetUid, start, start + limit - 1);
        const results = {
            uid: targetUid,
            scanned: pids.length,
            deleted: 0,
            skipped: 0,
            failed: [],
            hasMore: pids.length === limit
        };

        for (const rawPid of pids) {
            const pid = validId(rawPid);

            if (!pid) {
                results.skipped++;
                continue;
            }

            try {
                const post = await Posts.getPostMeta(pid);

                if (!post || post.deleted || Number(post.uid) !== targetUid) {
                    results.skipped++;
                    continue;
                }

                const topic = await Topics.getTopic(post.tid);

                if (!topic || Number(topic.mainPid) === pid) {
                    results.skipped++;
                    continue;
                }

                await Posts.deletePost(pid, actorUid);
                results.deleted++;
            } catch (error) {
                results.failed.push({
                    pid,
                    error: error.message || "Deletion failed"
                });
            }
        }

        results.nextStart = start + pids.length - results.deleted;

        return res.json(results);
    } catch (error) {
        return operationError(res, error, "Bulk post deletion");
    }
};

exports.internalListPosts = async function (req, res) {
    try {
        const uid = serviceUid(req);
        const tid = validId(req.body?.tid);
        const start = validPage(req.body?.start, 0, 10000000);
        const limit = validPage(req.body?.limit, 20, 100);
        const reverse = req.body?.reverse ?? false;

        if (!uid || !tid || start < 0 || limit < 1 ||
            typeof reverse !== "boolean") {
            return res.status(400).json({ error: "Invalid post listing parameters" });
        }

        if (!(await Privileges.canReadTopic(tid, uid))) {
            return res.status(404).json({ error: "Topic not found" });
        }

        const topic = await Topics.getTopic(tid);

        if (!topic || topic.deleted) {
            return res.status(404).json({ error: "Topic not found" });
        }

        const posts = await Topics.getTopicPosts(tid, uid, start, limit, reverse);

        const total = Math.max(0, Number(topic.postcount) || 0);
        const nextStart = Math.min(start + limit, total);

        return res.json({
            tid,
            start,
            limit,
            reverse,
            posts,
            total,
            nextStart,
            hasMore: nextStart < total
        });
    } catch (error) {
        return operationError(res, error, "Post listing");
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
