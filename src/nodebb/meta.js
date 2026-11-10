"use strict";

const NodeBB = require("./index");

async function getInfo() {
    const meta = NodeBB.get("meta");

    if (!meta.configs || typeof meta.configs.list !== "function") {
        throw new Error("NodeBB meta.configs.list is unavailable");
    }

    const config = await meta.configs.list();

    return {
        title: config.title || "",
        url: config.url || "",
        version: config.version || "",
        language: config.language || null
    };
}

module.exports = {
    getInfo
};
