"use strict";

const Routes = require("./src/routes");
const Events = require("./src/events");
const Config = require("./src/config");
const MCPManager = require("./src/mcp/manager");
const OAuthStorage = require("./src/oauth/storage/runtime");

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

        return Config.adminInfo();
    };

    SocketPlugins.integration.regenerateBearerToken = async function (socket) {
        await SocketAdmin.before(socket, "admin.settings.set");

        const result = await Config.regenerateBearerToken();

        MCPManager.refresh().catch((error) => {
            console.error(
                "[NodeBB Integration] MCP configuration refresh failed:",
                error.message
            );
        });

        return result;
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

    OAuthStorage.init();

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


Plugin.addProfileItem = async function (data) {

    data.links.push({
        id: "integration",
        route: "integration",
        icon: "fa-plug",
        name: "[[integration:menu-connected-apps]]",
        visibility: {
            self: true,
            other: false,
            moderator: false,
            globalMod: false,
            admin: false,
            canViewInfo: false
        }
    });

    return data;
};

Plugin.addAdminNavigation = async function (header) {
    header.plugins.push({
        route: "/plugins/integration",
        icon: "fa-robot",
        name: "[[integration:menu-admin-title]]"
    });

    return header;
};

module.exports = Plugin;
