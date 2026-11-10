"use strict";

const net = require("net");

function normalizeBoolean(value) {
    return value === true ||
        value === "true" ||
        value === "on" ||
        value === 1;
}

function normalizeCategories(value) {
    if (!Array.isArray(value)) {
        return [];
    }

    return [...new Set(
        value
            .map(Number)
            .filter(item => Number.isSafeInteger(item) && item > 0)
    )];
}

function validateHttpUrl(value, label) {
    if (typeof value !== "string" || !value.trim()) {
        throw new Error(`${label} is required`);
    }

    let parsed;

    try {
        parsed = new URL(value.trim());
    } catch {
        throw new Error(`Invalid ${label}`);
    }

    if (
        !["http:", "https:"].includes(parsed.protocol) ||
        !parsed.hostname ||
        parsed.username ||
        parsed.password ||
        parsed.search ||
        parsed.hash
    ) {
        throw new Error(`${label} must be a valid HTTP or HTTPS URL`);
    }

    return parsed.toString().replace(/\/+$/, "");
}

function validateQdrantUrl(value) {
    return validateHttpUrl(value, "Qdrant URL");
}

function validateNodebbUrl(value) {
    return validateHttpUrl(value, "NodeBB API URL");
}

function validateAiProvider(value) {
    if (value !== "openai" && value !== "fake") {
        throw new Error("AI provider must be openai or fake");
    }

    return value;
}

function validateMcpHost(value) {
    if (typeof value !== "string" || !value.trim()) {
        throw new Error("MCP bind address is required");
    }

    const host = value.trim();

    if (host.length > 253 || /[\s/\\?#@]/.test(host)) {
        throw new Error("Invalid MCP bind address");
    }

    if (net.isIP(host)) {
        return host;
    }

    const labels = host.split(".");

    const validHostname = labels.every((label) => {
        if (
            label.length < 1 ||
            label.length > 63 ||
            !/[a-zA-Z0-9]/.test(label[0]) ||
            !/[a-zA-Z0-9]/.test(label[label.length - 1])
        ) {
            return false;
        }

        return [...label].every((char) => (
            (char >= "a" && char <= "z") ||
            (char >= "A" && char <= "Z") ||
            (char >= "0" && char <= "9") ||
            char === "-"
        ));
    });

    if (!validHostname) {
        throw new Error("Invalid MCP bind address");
    }

    return host;
}

function validatePort(value) {
    const port = Number(value);

    if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
        throw new Error("MCP port must be between 1 and 65535");
    }

    return port;
}

function validateServiceUid(value) {
    const uid = Number(value);

    if (!Number.isSafeInteger(uid) || uid < 1) {
        throw new Error("MCP service UID must be a positive NodeBB user ID");
    }

    return uid;
}

function validateBearerToken(value) {
    if (typeof value !== "string" || /[\r\n]/.test(value)) {
        throw new Error("Invalid MCP Bearer Token");
    }

    const token = value.trim();

    if (/\s/.test(token)) {
        throw new Error("MCP Bearer Token must not contain whitespace");
    }

    if (token && token.length < 32) {
        throw new Error("MCP Bearer Token must contain at least 32 characters");
    }

    if (token.length > 512) {
        throw new Error("Invalid MCP Bearer Token");
    }

    return token;
}

function normalize(values = {}, defaults) {
    const result = {
        ...defaults,
        ...values
    };

    try {
        result.aiProvider = validateAiProvider(result.aiProvider);
    } catch {
        result.aiProvider = defaults.aiProvider;
    }

    result.openaiApiKey =
        typeof result.openaiApiKey === "string"
            ? result.openaiApiKey.trim()
            : "";

    result.openaiModel =
        typeof result.openaiModel === "string" &&
        result.openaiModel.trim()
            ? result.openaiModel.trim()
            : defaults.openaiModel;

    result.embeddingSize = Number(result.embeddingSize);

    if (
        !Number.isSafeInteger(result.embeddingSize) ||
        result.embeddingSize < 1
    ) {
        result.embeddingSize = defaults.embeddingSize;
    }

    try {
        result.qdrantUrl = validateQdrantUrl(result.qdrantUrl);
    } catch {
        result.qdrantUrl = defaults.qdrantUrl;
    }

    result.collection =
        typeof result.collection === "string" &&
        /^[a-zA-Z0-9_-]+$/.test(result.collection.trim())
            ? result.collection.trim()
            : defaults.collection;

    result.excludedCategories =
        normalizeCategories(result.excludedCategories);

    result.mcpEnabled = normalizeBoolean(result.mcpEnabled);

    try {
        result.mcpHost = validateMcpHost(result.mcpHost);
    } catch {
        result.mcpHost = defaults.mcpHost;
    }

    try {
        result.mcpPort = validatePort(result.mcpPort);
    } catch {
        result.mcpPort = defaults.mcpPort;
    }

    try {
        result.mcpNodebbUrl = validateNodebbUrl(result.mcpNodebbUrl);
    } catch {
        result.mcpNodebbUrl = defaults.mcpNodebbUrl;
    }

    try {
        result.mcpServiceUid = validateServiceUid(result.mcpServiceUid);
    } catch {
        result.mcpServiceUid = 0;
    }

    try {
        result.mcpBearerToken = validateBearerToken(result.mcpBearerToken);
    } catch {
        result.mcpBearerToken = "";
    }

    result.internalApiToken =
        typeof result.internalApiToken === "string"
            ? result.internalApiToken
            : "";

    return result;
}

module.exports = {
    normalizeBoolean,
    normalizeCategories,
    validateHttpUrl,
    validateQdrantUrl,
    validateNodebbUrl,
    validateAiProvider,
    validateMcpHost,
    validatePort,
    validateServiceUid,
    validateBearerToken,
    normalize
};
