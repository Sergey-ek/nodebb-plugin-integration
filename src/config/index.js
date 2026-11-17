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
    authMode: "oauth",
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
    const raw = saved && typeof saved === "object" && !Array.isArray(saved)
        ? { ...saved }
        : {};

    let shouldSave = false;

    // Preserve legacy authentication only when the old Bearer token is valid.
    if (!Object.prototype.hasOwnProperty.call(raw, "authMode")) {
        let hasValidLegacyToken = false;

        try {
            hasValidLegacyToken = Boolean(
                Validation.validateBearerToken(raw.mcpBearerToken)
            );
        } catch {
            hasValidLegacyToken = false;
        }

        raw.authMode = hasValidLegacyToken ? "legacy" : "oauth";
        shouldSave = true;
    }

    const settings = Validation.normalize(raw, DEFAULTS);

    if (!settings.mcpBearerToken) {
        settings.mcpBearerToken = crypto.randomBytes(32).toString("base64url");
        shouldSave = true;
    }

    if (!settings.internalApiToken) {
        settings.internalApiToken = crypto.randomBytes(48).toString("hex");
        shouldSave = true;
    }

    if (shouldSave) {
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
        "authMode",
        "mcpEnabled",
        "mcpHost",
        "mcpPort",
        "mcpNodebbUrl",
        "mcpBearerToken"
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

    if (Object.prototype.hasOwnProperty.call(values, "authMode")) {
        next.authMode = Validation.validateAuthMode(values.authMode);
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

    // The service UID is only relevant to Legacy Bearer authentication.
    // ACP submits every form field on every save, so ignore its OAuth value.
    if (
        Object.prototype.hasOwnProperty.call(values, "mcpServiceUid") &&
        next.authMode === "legacy"
    ) {
        next.mcpServiceUid = Validation.validateServiceUid(values.mcpServiceUid);
    }

    if (Object.prototype.hasOwnProperty.call(values, "mcpBearerToken")) {
        next.mcpBearerToken = Validation.validateBearerToken(next.mcpBearerToken);
    }

    const normalized = Validation.normalize(next, DEFAULTS);

    if (normalized.mcpEnabled && normalized.authMode === "legacy") {
        if (!normalized.mcpBearerToken) {
            throw new Error("Set MCP Bearer Token before enabling legacy authentication");
        }

        if (!normalized.mcpServiceUid) {
            throw new Error("Set MCP service UID before enabling legacy authentication");
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
        authMode: settings.authMode,
        authModeOauth: settings.authMode === "oauth",
        authModeLegacy: settings.authMode === "legacy",
        mcpHost: settings.mcpHost,
        mcpPort: settings.mcpPort,
        mcpNodebbUrl: settings.mcpNodebbUrl,
        mcpBearerTokenConfigured: Boolean(settings.mcpBearerToken),
        mcpServiceUid: settings.mcpServiceUid,
        internalApiConfigured: Boolean(settings.internalApiToken)
    };
}

async function adminInfo() {
    const settings = await get();

    return {
        ...await info(),
        // This method is only used by authenticated ACP handlers.
        mcpBearerToken: settings.mcpBearerToken
    };
}

async function regenerateBearerToken() {
    const token = crypto.randomBytes(32).toString("base64url");
    await set({ mcpBearerToken: token });
    return adminInfo();
}

module.exports = {
    DEFAULTS,
    get,
    set,
    info,
    adminInfo,
    regenerateBearerToken
};
