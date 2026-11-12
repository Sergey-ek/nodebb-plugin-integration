"use strict";

const NodeBB = require("./index");

async function getInfo() {
    const meta = NodeBB.get("meta");
    const nconf = nodebb.require("nconf");

    if (!meta.configs || typeof meta.configs.list !== "function") {
        throw new Error("NodeBB meta.configs.list is unavailable");
    }

    const config = await meta.configs.list();

    return {
        title: config.title || "",
        url: nconf.get("url") || "",
        version: config.version || "",
        language: config.defaultLang || null
    };
}

module.exports = {
    getInfo
};
