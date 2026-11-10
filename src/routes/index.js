"use strict";

const API = require("./api");

exports.init = function (router, middleware) {
    if (!router || !middleware) {
        throw new Error("[Integration] Router middleware unavailable");
    }

    if (typeof middleware.pluginHooks !== "function") {
        throw new Error("[Integration] pluginHooks middleware unavailable");
    }

    const helpers = nodebb.require("./src/routes/helpers");

    if (typeof helpers.setupAdminPageRoute !== "function") {
        throw new Error("[Integration] setupAdminPageRoute unavailable");
    }

    // Existing user-facing semantic search.
    router.post(
        "/api/v3/integration/search",
        middleware.ensureLoggedIn,
        API.apiSearch
    );

    router.get(
        "/api/v3/integration/internal/info",
        API.internalAuth,
        API.internalInfo
    );

    router.post(
        "/api/v3/integration/internal/post",
        API.internalAuth,
        API.internalPost
    );

    router.post(
        "/api/v3/integration/internal/topic",
        API.internalAuth,
        API.internalTopic
    );

    router.post(
        "/api/v3/integration/internal/user",
        API.internalAuth,
        API.internalUser
    );

    router.post(
        "/api/v3/integration/internal/search",
        API.internalAuth,
        API.internalSearch
    );

    // Existing ACP page.
    helpers.setupAdminPageRoute(
        router,
        "/admin/plugins/integration",
        [middleware.pluginHooks],
        API.renderAdmin
    );
};
