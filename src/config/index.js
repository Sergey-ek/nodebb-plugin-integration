"use strict";

/**
 * NodeBB Integration Layer
 *
 * Configuration provider
 *
 * Settings are stored in the NodeBB database
 * using meta.settings.
 */

let meta = null;

try {

    meta = require.main.require("./src/meta");

} catch (err) {

    // Standalone mode (tests, npm, CLI)

}

const DEFAULTS = {

    aiProvider: "fake",

    openaiApiKey: "",

    openaiModel: "text-embedding-3-small",

    qdrantUrl: "http://localhost:6333",

    collection: "nodebb_knowledge",

    mcpEnabled: false,

    mcpPort: 3001

};

async function get() {

    if (!meta) {
        return { ...DEFAULTS };
    }

    try {

        return await meta.settings.get(
            "nodebb-plugin-integration",
            DEFAULTS
        );

    } catch (err) {

        console.error(
            "[Config] unable to load settings:",
            err.message
        );

        return { ...DEFAULTS };

    }

}

async function set(values) {

    if (!meta) {
        return false;
    }

    try {

        await meta.settings.set(
            "nodebb-plugin-integration",
            values
        );

        return true;

    } catch (err) {

        console.error(
            "[Config] unable to save settings:",
            err.message
        );

        return false;

    }

}

async function info() {

    const cfg = await get();

    return {

        aiProvider: cfg.aiProvider,

        openaiModel: cfg.openaiModel,

        qdrantUrl: cfg.qdrantUrl,

        collection: cfg.collection,

        mcpEnabled: cfg.mcpEnabled,

        mcpPort: cfg.mcpPort,

        openaiApiKey:
            cfg.openaiApiKey
                ? "***configured***"
                : ""

    };

}

module.exports = {

    get,

    set,

    info,

    defaults: DEFAULTS

};