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
        description: "Get a forum post by its post ID. Access permissions are checked by NodeBB.",
        inputSchema: {
            type: "object",
            properties: {
                pid: { type: "integer", minimum: 1 }
            },
            required: ["pid"],
            additionalProperties: false
        }
    },
    {
        name: "get_topic",
        description: "Get a forum topic by its topic ID. Access permissions are checked by NodeBB.",
        inputSchema: {
            type: "object",
            properties: {
                tid: { type: "integer", minimum: 1 }
            },
            required: ["tid"],
            additionalProperties: false
        }
    },
    {
        name: "get_user",
        description: "Get public profile information for a forum user",
        inputSchema: {
            type: "object",
            properties: {
                uid: { type: "integer", minimum: 1 }
            },
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
    }
];

function validateArguments(name, args) {
    if (!args || typeof args !== "object" || Array.isArray(args)) {
        throw new Error("Tool arguments must be an object");
    }

    const allowed = {
        get_forum_info: [],
        get_post: ["pid"],
        get_topic: ["tid"],
        get_user: ["uid"],
        search_knowledge: ["query", "limit"]
    }[name];

    if (!allowed) {
        throw new Error(`Unknown MCP tool: ${name}`);
    }

    if (Object.keys(args).some((key) => !allowed.includes(key))) {
        throw new Error("Unexpected tool argument");
    }

    if (name === "get_forum_info") {
        return {};
    }

    if (name === "get_post" || name === "get_topic" || name === "get_user") {
        const key = name === "get_post"
            ? "pid"
            : name === "get_topic"
                ? "tid"
                : "uid";

        if (!Number.isSafeInteger(args[key]) || args[key] < 1) {
            throw new Error(`Invalid ${key}`);
        }

        return { [key]: args[key] };
    }

    if (
        typeof args.query !== "string" ||
        !args.query.trim() ||
        args.query.length > 2000
    ) {
        throw new Error("Search query must contain 1 to 2000 characters");
    }

    const limit = args.limit === undefined ? 5 : args.limit;

    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 20) {
        throw new Error("Search limit must be an integer from 1 to 20");
    }

    return {
        query: args.query.trim(),
        limit
    };
}

async function execute(name, args = {}, api) {
    if (!api || typeof api.request !== "function") {
        throw new Error("NodeBB API client is not configured");
    }

    const validated = validateArguments(name, args);

    switch (name) {
        case "get_forum_info":
            return api.request("GET", "/api/v3/integration/internal/info");

        case "get_post":
            return api.request("POST", "/api/v3/integration/internal/post", validated);

        case "get_topic":
            return api.request("POST", "/api/v3/integration/internal/topic", validated);

        case "get_user":
            return api.request("POST", "/api/v3/integration/internal/user", validated);

        case "search_knowledge":
            return api.request("POST", "/api/v3/integration/internal/search", validated);

        default:
            throw new Error(`Unknown MCP tool: ${name}`);
    }
}

function register(server, api) {
    const {
        ListToolsRequestSchema,
        CallToolRequestSchema
    } = require("@modelcontextprotocol/sdk/types.js");

    server.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools: definitions
    }));

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const name = request.params.name;
        const args = request.params.arguments || {};

        try {
            const result = await execute(name, args, api);

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(result, null, 2)
                    }
                ]
            };
        } catch (error) {
            return {
                isError: true,
                content: [
                    {
                        type: "text",
                        text: error.message || "Tool execution failed"
                    }
                ]
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
