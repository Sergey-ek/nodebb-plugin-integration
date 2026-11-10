"use strict";

const crypto = require("crypto");
const Validation = require("./validation");

const DEFAULTS = Object.freeze({
    aiProvider: "openai",
    openaiApiKey: "",
    openaiModel: "text-embedding-3-small",
    embeddingSize: 1536,
    qdrantUrl: "http://qdrant:6333",
    collection: "nodebb_knowledge",
    excludedCategories: [],

    mcpEnabled: false,
    mcpHost: "127.0.0.1",
    mcpPort: 3100,
    mcpNodebbUrl: "http://127.0.0.1:4567",
    mcpBearerToken: "",
    mcpServiceUid: 0,

    internalApiToken: ""
});

const SETTINGS_KEY = "nodebb-plugin-integration";

let nativeMeta = null;

function getMeta() {
    if (nativeMeta) {
        return nativeMeta;
    }

    try {
        if (typeof nodebb !== "undefined" && nodebb &&
            typeof nodebb.require === "function") {
            nativeMeta = nodebb.require("./src/meta");
        }
    } catch (error) {
        throw new Error(`Cannot load NodeBB meta module: ${error.message}`);
    }

    if (!nativeMeta || !nativeMeta.settings) {
        throw new Error("NodeBB settings API is unavailable");
    }

    return nativeMeta;
}

async function get() {
    const meta = getMeta();
    const saved = await meta.settings.get(SETTINGS_KEY);
    const settings = Validation.normalize(saved || {}, DEFAULTS);

    if (!settings.internalApiToken) {
        settings.internalApiToken = crypto.randomBytes(48).toString("hex");
        await meta.settings.set(SETTINGS_KEY, settings);
    }

    return settings;
}

async function set(values = {}) {
    if (!values || typeof values !== "object" || Array.isArray(values)) {
        throw new TypeError("Settings must be an object");
    }

    const current = await get();
    const next = { ...current };

    const allowed = [
        "aiProvider",
        "openaiApiKey",
        "openaiModel",
        "embeddingSize",
        "qdrantUrl",
        "collection",
        "excludedCategories",
        "mcpEnabled",
        "mcpHost",
        "mcpPort",
        "mcpNodebbUrl",
        "mcpBearerToken",
        "mcpServiceUid"
    ];

    for (const key of allowed) {
        if (Object.prototype.hasOwnProperty.call(values, key)) {
            next[key] = values[key];
        }
    }

    for (const key of ["openaiApiKey", "mcpBearerToken"]) {
        if (
            Object.prototype.hasOwnProperty.call(values, key) &&
            (typeof values[key] !== "string" || !values[key].trim())
        ) {
            next[key] = current[key];
        }
    }

    if (Object.prototype.hasOwnProperty.call(values, "aiProvider")) {
        next.aiProvider = Validation.validateAiProvider(values.aiProvider);
    }

    if (Object.prototype.hasOwnProperty.call(values, "qdrantUrl")) {
        next.qdrantUrl = Validation.validateQdrantUrl(values.qdrantUrl);
    }

    if (Object.prototype.hasOwnProperty.call(values, "mcpHost")) {
        next.mcpHost = Validation.validateMcpHost(values.mcpHost);
    }

    if (Object.prototype.hasOwnProperty.call(values, "mcpPort")) {
        next.mcpPort = Validation.validatePort(values.mcpPort);
    }

    if (Object.prototype.hasOwnProperty.call(values, "mcpNodebbUrl")) {
        next.mcpNodebbUrl = Validation.validateNodebbUrl(values.mcpNodebbUrl);
    }

    if (Object.prototype.hasOwnProperty.call(values, "mcpServiceUid")) {
        next.mcpServiceUid = Validation.validateServiceUid(values.mcpServiceUid);
    }

    if (Object.prototype.hasOwnProperty.call(values, "mcpBearerToken")) {
        next.mcpBearerToken = Validation.validateBearerToken(next.mcpBearerToken);
    }

    const normalized = Validation.normalize(next, DEFAULTS);

    if (normalized.mcpEnabled) {
        if (!normalized.mcpBearerToken) {
            throw new Error("Set MCP Bearer Token before enabling MCP");
        }

        if (!normalized.mcpServiceUid) {
            throw new Error("Set MCP service UID before enabling MCP");
        }
    }

    await getMeta().settings.set(SETTINGS_KEY, normalized);

    return normalized;
}

async function info() {
    const settings = await get();

    return {
        aiProvider: settings.aiProvider,
        aiProviderOpenai: settings.aiProvider === "openai",
        aiProviderFake: settings.aiProvider === "fake",
        openaiConfigured: Boolean(settings.openaiApiKey),
        openaiModel: settings.openaiModel,
        embeddingSize: settings.embeddingSize,
        qdrantUrl: settings.qdrantUrl,
        collection: settings.collection,
        excludedCategories: settings.excludedCategories,

        mcpEnabled: settings.mcpEnabled,
        mcpHost: settings.mcpHost,
        mcpPort: settings.mcpPort,
        mcpNodebbUrl: settings.mcpNodebbUrl,
        mcpBearerTokenConfigured: Boolean(settings.mcpBearerToken),
        mcpServiceUid: settings.mcpServiceUid,
        internalApiConfigured: Boolean(settings.internalApiToken)
    };
}

module.exports = {
    DEFAULTS,
    get,
    set,
    info
};
