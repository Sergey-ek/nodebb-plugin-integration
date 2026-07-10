"use strict";

/**
 * NodeBB Integration Layer
 *
 * Main plugin entry point
 */

const Config = require("./src/config");
const Routes = require("./src/routes");
const Events = require("./src/events");
const Indexer = require("./src/ai/indexer");
const MCP = require("./src/mcp/server");

const Plugin = {};

/**
 * static:app.load
 */
Plugin.init = async function (params = {}) {

    console.log("[NodeBB Integration] initializing");

    const { router, middleware } = params;

    if (router) {
        Routes.init(router, middleware);
    } else {
        console.log("[NodeBB Integration] router unavailable (standalone mode)");
    }

    if (Events && typeof Events.init === "function") {
        await Events.init();
    }

    const settings = await Config.get();

    if (
        settings.mcpEnabled &&
        MCP &&
        typeof MCP.start === "function"
    ) {
        try {
            await MCP.start();
            console.log("[NodeBB Integration] MCP server started");
        } catch (err) {
            console.error("[NodeBB Integration] MCP start failed:", err.message);
        }
    }

    console.log("[NodeBB Integration] ready");
};

/**
 * action:post.save
 */
Plugin.onPostSave = async function (post) {

    try {

        if (Events && typeof Events.postSave === "function") {
            await Events.postSave(post);
        }

        if (Indexer && typeof Indexer.indexPost === "function") {
            await Indexer.indexPost(post);
        }

    } catch (err) {

        console.error("[Plugin] post save error:", err.message);

    }

};

/**
 * action:topic.save
 */
Plugin.onTopicSave = async function (topic) {

    try {

        if (Events && typeof Events.topicCreate === "function") {
            await Events.topicCreate(topic);
        }

        if (Indexer && typeof Indexer.indexTopic === "function") {
            await Indexer.indexTopic(topic);
        }

    } catch (err) {

        console.error("[Plugin] topic save error:", err.message);

    }

};

/**
 * ACP menu item
 */
Plugin.addAdminNavigation = async function (header) {

    header.plugins.push({
        route: "/plugins/integration",
        icon: "fa-robot",
        name: "NodeBB Integration"
    });

    return header;

};

module.exports = Plugin;