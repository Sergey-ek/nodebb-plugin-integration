"use strict";

const Routes = require("./src/routes");
const Events = require("./src/events");
const Config = require("./src/config");
const MCPManager = require("./src/mcp/manager");

const Plugin = {};

function registerSocketHandlers() {
    if (typeof nodebb === "undefined" || !nodebb ||
        typeof nodebb.require !== "function") {
        throw new Error("Cannot access the NodeBB module loader");
    }

    const SocketPlugins = nodebb.require("./src/socket.io/plugins");
    const SocketAdmin = nodebb.require("./src/socket.io/admin");

    SocketPlugins.integration = SocketPlugins.integration || {};

    SocketPlugins.integration.save = async function (socket, data) {
        await SocketAdmin.before(socket, "admin.settings.set");

        await Config.set(data);

        MCPManager.refresh().catch((error) => {
            console.error(
                "[NodeBB Integration] MCP configuration refresh failed:",
                error.message
            );
        });

        return Config.info();
    };
}

Plugin.init = async function (params = {}) {
    console.log("[NodeBB Integration] initializing");

    const { router, middleware } = params;

    registerSocketHandlers();

    if (router) {
        Routes.init(router, middleware);
    }

    await Events.init();

    MCPManager.init();

    console.log("[NodeBB Integration] ready");
};

Plugin.onPostSave = async function (data) {
    return Events.postSave(data);
};

Plugin.onPostEdit = async function (data) {
    return Events.postEdit(data);
};

Plugin.onPostDelete = async function (data) {
    return Events.postDelete(data);
};

Plugin.onPostRestore = async function (data) {
    return Events.postRestore(data);
};

Plugin.onPostsPurge = async function (data) {
    return Events.postsPurge(data);
};

Plugin.onTopicDelete = async function (data) {
    return Events.topicDelete(data);
};

Plugin.onTopicRestore = async function (data) {
    return Events.topicRestore(data);
};

Plugin.addAdminNavigation = async function (header) {
    header.plugins.push({
        route: "/plugins/integration",
        icon: "fa-robot",
        name: "NodeBB Integration"
    });

    return header;
};

module.exports = Plugin;
