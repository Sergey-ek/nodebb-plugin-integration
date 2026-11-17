"use strict";

const NodeBB = require("./index");

function getPublicUrl() {
    const nconf = nodebb.require("nconf");
    const url = nconf.get("url");

    if (typeof url !== "string" || !url.trim()) {
        throw new Error("NodeBB public URL is not configured");
    }

    const parsed = new URL(url);

    if (
        !["http:", "https:"].includes(parsed.protocol) ||
        !parsed.hostname ||
        parsed.username ||
        parsed.password ||
        parsed.search ||
        parsed.hash
    ) {
        throw new Error("NodeBB public URL is invalid");
    }

    return parsed.toString().replace(/\/+$/, "");
}

async function getInfo() {
    const meta = NodeBB.get("meta");

    if (!meta.configs || typeof meta.configs.list !== "function") {
        throw new Error("NodeBB meta.configs.list is unavailable");
    }

    const config = await meta.configs.list();

    return {
        title: config.title || "",
        url: getPublicUrl(),
        version: config.version || "",
        language: config.defaultLang || null
    };
}

module.exports = {
    getInfo,
    getPublicUrl
};
