"use strict";

const definitions = [
    {
        name: "get_forum_info",
        description: "Get public NodeBB forum information",
        inputSchema: {
            type: "object",
            properties: {},
            additionalProperties: false
        }
    },
    {
        name: "get_post",
        description: "Get a forum post by ID. NodeBB access permissions are checked.",
        inputSchema: {
            type: "object",
            properties: { pid: { type: "integer", minimum: 1 } },
            required: ["pid"],
            additionalProperties: false
        }
    },
    {
        name: "get_topic",
        description: "Get a forum topic by ID. NodeBB access permissions are checked.",
        inputSchema: {
            type: "object",
            properties: { tid: { type: "integer", minimum: 1 } },
            required: ["tid"],
            additionalProperties: false
        }
    },
    {
        name: "get_user",
        description: "Get public profile information for a forum user",
        inputSchema: {
            type: "object",
            properties: { uid: { type: "integer", minimum: 1 } },
            required: ["uid"],
            additionalProperties: false
        }
    },
    {
        name: "search_knowledge",
        description: "Search the forum knowledge base using semantic search",
        inputSchema: {
            type: "object",
            properties: {
                query: { type: "string", minLength: 1, maxLength: 2000 },
                limit: { type: "integer", minimum: 1, maximum: 20 }
            },
            required: ["query"],
            additionalProperties: false
        }
    },
    {
        name: "create_topic",
        description: "Create a topic in a NodeBB category as the configured MCP service user",
        inputSchema: {
            type: "object",
            properties: {
                cid: { type: "integer", minimum: 1 },
                title: { type: "string", minLength: 1, maxLength: 255 },
                content: { type: "string", minLength: 1, maxLength: 20000 },
                tags: {
                    type: "array",
                    maxItems: 10,
                    items: { type: "string", minLength: 1, maxLength: 32 }
                }
            },
            required: ["cid", "title", "content"],
            additionalProperties: false
        }
    },
    {
        name: "delete_topic",
        description: "Soft-delete a topic using NodeBB permissions and hooks",
        inputSchema: {
            type: "object",
            properties: { tid: { type: "integer", minimum: 1 } },
            required: ["tid"],
            additionalProperties: false
        }
    },
    {
        name: "restore_topic",
        description: "Restore a soft-deleted topic using NodeBB permissions and hooks",
        inputSchema: {
            type: "object",
            properties: { tid: { type: "integer", minimum: 1 } },
            required: ["tid"],
            additionalProperties: false
        }
    },
    {
        name: "list_topics",
        description: "List topics visible to the configured MCP service user",
        inputSchema: {
            type: "object",
            properties: {
                start: { type: "integer", minimum: 0 },
                limit: { type: "integer", minimum: 1, maximum: 100 },
                sort: {
                    type: "string",
                    enum: ["recent", "old", "create", "posts", "votes", "views"]
                },
                cid: { type: "integer", minimum: 1 }
            },
            additionalProperties: false
        }
    },
    {
        name: "create_post",
        description: "Create a reply in a topic using NodeBB permissions and hooks",
        inputSchema: {
            type: "object",
            properties: {
                tid: { type: "integer", minimum: 1 },
                content: { type: "string", minLength: 1, maxLength: 20000 }
            },
            required: ["tid", "content"],
            additionalProperties: false
        }
    },
    {
        name: "edit_post",
        description: "Edit a post using NodeBB permissions and edit restrictions",
        inputSchema: {
            type: "object",
            properties: {
                pid: { type: "integer", minimum: 1 },
                content: { type: "string", minLength: 1, maxLength: 20000 }
            },
            required: ["pid", "content"],
            additionalProperties: false
        }
    },
    {
        name: "delete_post",
        description: "Soft-delete a post using NodeBB permissions and hooks",
        inputSchema: {
            type: "object",
            properties: { pid: { type: "integer", minimum: 1 } },
            required: ["pid"],
            additionalProperties: false
        }
    },
    {
        name: "restore_post",
        description: "Restore a soft-deleted post using NodeBB permissions and hooks",
        inputSchema: {
            type: "object",
            properties: { pid: { type: "integer", minimum: 1 } },
            required: ["pid"],
            additionalProperties: false
        }
    },
    {
        name: "delete_user_posts",
        description: "Soft-delete up to 100 replies by a user. The first post of every topic is skipped. Use start to process subsequent batches.",
        inputSchema: {
            type: "object",
            properties: {
                uid: { type: "integer", minimum: 1 },
                start: { type: "integer", minimum: 0 },
                limit: { type: "integer", minimum: 1, maximum: 100 }
            },
            required: ["uid"],
            additionalProperties: false
        }
    },
    {
        name: "list_posts",
        description: "List posts in a topic with NodeBB access filtering and pagination",
        inputSchema: {
            type: "object",
            properties: {
                tid: { type: "integer", minimum: 1 },
                start: { type: "integer", minimum: 0 },
                limit: { type: "integer", minimum: 1, maximum: 100 },
                reverse: { type: "boolean" }
            },
            required: ["tid"],
            additionalProperties: false
        }
    }
];

const allowedArguments = {
    get_forum_info: [],
    get_post: ["pid"],
    get_topic: ["tid"],
    get_user: ["uid"],
    search_knowledge: ["query", "limit"],
    create_topic: ["cid", "title", "content", "tags"],
    delete_topic: ["tid"],
    restore_topic: ["tid"],
    list_topics: ["start", "limit", "sort", "cid"],
    create_post: ["tid", "content"],
    edit_post: ["pid", "content"],
    delete_post: ["pid"],
    restore_post: ["pid"],
    delete_user_posts: ["uid", "start", "limit"],
    list_posts: ["tid", "start", "limit", "reverse"]
};

function requireId(args, key) {
    if (!Number.isSafeInteger(args[key]) || args[key] < 1) {
        throw new Error(`Invalid ${key}`);
    }
}

function requireText(args, key, maximum) {
    if (typeof args[key] !== "string" ||
        !args[key].trim() || args[key].length > maximum) {
        throw new Error(`Invalid ${key}`);
    }
}

function pageValue(value, fallback, maximum, name) {
    const result = value === undefined ? fallback : value;

    if (!Number.isSafeInteger(result) || result < 0 || result > maximum) {
        throw new Error(`Invalid ${name}`);
    }

    return result;
}

function validateArguments(name, args) {
    if (!args || typeof args !== "object" || Array.isArray(args)) {
        throw new Error("Tool arguments must be an object");
    }

    const allowed = allowedArguments[name];

    if (!allowed) throw new Error(`Unknown MCP tool: ${name}`);

    if (Object.keys(args).some(key => !allowed.includes(key))) {
        throw new Error("Unexpected tool argument");
    }

    if (name === "get_forum_info") return {};

    if (["get_post", "get_topic", "get_user",
        "delete_topic", "restore_topic",
        "delete_post", "restore_post"].includes(name)) {
        const key = name.endsWith("_post") || name === "get_post"
            ? "pid" : name.endsWith("_topic") || name === "get_topic"
                ? "tid" : "uid";

        requireId(args, key);
        return { [key]: args[key] };
    }

    if (name === "search_knowledge") {
        requireText(args, "query", 2000);
        const limit = args.limit === undefined ? 5 : args.limit;

        if (!Number.isSafeInteger(limit) || limit < 1 || limit > 20) {
            throw new Error("Search limit must be from 1 to 20");
        }

        return { query: args.query.trim(), limit };
    }

    if (name === "create_topic") {
        requireId(args, "cid");
        requireText(args, "title", 255);
        requireText(args, "content", 20000);

        const tags = args.tags === undefined ? [] : args.tags;

        if (!Array.isArray(tags) || tags.length > 10 ||
            tags.some(tag => typeof tag !== "string" ||
                !tag.trim() || tag.length > 32)) {
            throw new Error("Invalid tags");
        }

        return {
            cid: args.cid,
            title: args.title.trim(),
            content: args.content,
            tags
        };
    }

    if (name === "create_post" || name === "edit_post") {
        const key = name === "create_post" ? "tid" : "pid";
        requireId(args, key);
        requireText(args, "content", 20000);
        return { [key]: args[key], content: args.content };
    }

    if (name === "list_topics") {
        const result = {
            start: pageValue(args.start, 0, 10000000, "start"),
            limit: pageValue(args.limit, 20, 100, "limit"),
            sort: args.sort === undefined ? "recent" : args.sort
        };

        if (!["recent", "old", "create", "posts", "votes", "views"]
            .includes(result.sort)) {
            throw new Error("Invalid sort");
        }

        if (args.cid !== undefined) {
            requireId(args, "cid");
            result.cid = args.cid;
        }

        return result;
    }

    if (name === "delete_user_posts") {
        requireId(args, "uid");

        return {
            uid: args.uid,
            start: pageValue(args.start, 0, 10000000, "start"),
            limit: pageValue(args.limit, 100, 100, "limit")
        };
    }

    if (name === "list_posts") {
        requireId(args, "tid");

        if (args.reverse !== undefined && typeof args.reverse !== "boolean") {
            throw new Error("Invalid reverse");
        }

        return {
            tid: args.tid,
            start: pageValue(args.start, 0, 10000000, "start"),
            limit: pageValue(args.limit, 20, 100, "limit"),
            reverse: args.reverse ?? false
        };
    }

    throw new Error(`Unknown MCP tool: ${name}`);
}

async function execute(name, args = {}, api) {
    if (!api || typeof api.request !== "function") {
        throw new Error("NodeBB API client is not configured");
    }

    const validated = validateArguments(name, args);

    const routes = {
        get_forum_info: ["GET", "/api/v3/integration/internal/info"],
        get_post: ["POST", "/api/v3/integration/internal/post"],
        get_topic: ["POST", "/api/v3/integration/internal/topic"],
        get_user: ["POST", "/api/v3/integration/internal/user"],
        search_knowledge: ["POST", "/api/v3/integration/internal/search"],
        create_topic: ["POST", "/api/v3/integration/internal/topic/create"],
        delete_topic: ["POST", "/api/v3/integration/internal/topic/delete"],
        restore_topic: ["POST", "/api/v3/integration/internal/topic/restore"],
        list_topics: ["POST", "/api/v3/integration/internal/topics"],
        create_post: ["POST", "/api/v3/integration/internal/post/create"],
        edit_post: ["POST", "/api/v3/integration/internal/post/edit"],
        delete_post: ["POST", "/api/v3/integration/internal/post/delete"],
        restore_post: ["POST", "/api/v3/integration/internal/post/restore"],
        delete_user_posts: ["POST", "/api/v3/integration/internal/user/delete-posts"],
        list_posts: ["POST", "/api/v3/integration/internal/posts"]
    };

    const [method, path] = routes[name];

    return api.request(method, path, validated);
}

function register(server, api) {
    const {
        ListToolsRequestSchema,
        CallToolRequestSchema
    } = require("@modelcontextprotocol/sdk/types.js");

    server.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools: definitions
    }));

    server.setRequestHandler(CallToolRequestSchema, async request => {
        const name = request.params.name;
        const args = request.params.arguments || {};

        try {
            const result = await execute(name, args, api);

            return {
                content: [{
                    type: "text",
                    text: JSON.stringify(result, null, 2)
                }]
            };
        } catch (error) {
            return {
                isError: true,
                content: [{
                    type: "text",
                    text: error.message || "Tool execution failed"
                }]
            };
        }
    });
}

module.exports = {
    definitions,
    validateArguments,
    execute,
    register
};
