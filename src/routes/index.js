"use strict";

const API = require("./api");
const OAuthRoutes = require("./oauth");

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

    router.get(
        "/.well-known/oauth-authorization-server",
        OAuthRoutes.authorizationServerMetadata
    );

    router.get(
        "/oauth/authorize",
        OAuthRoutes.authorize
    );

    router.post(
        "/oauth/token",
        OAuthRoutes.token
    );

    router.post(
        "/oauth/revoke",
        OAuthRoutes.revoke
    );

    router.post(
        "/api/v3/integration/search",
        middleware.ensureLoggedIn,
        API.apiSearch
    );

    const internal = "/api/v3/integration/internal";

    router.get(`${internal}/info`, API.internalAuth, API.internalInfo);
    router.get(
        `${internal}/auth/validate`,
        API.internalAuth,
        API.internalValidate
    );

    const routes = {
        post: API.internalPost,
        topic: API.internalTopic,
        user: API.internalUser,
        search: API.internalSearch,
        "topic/create": API.internalCreateTopic,
        "topic/delete": API.internalDeleteTopic,
        "topic/restore": API.internalRestoreTopic,
        topics: API.internalListTopics,
        "post/create": API.internalCreatePost,
        "post/edit": API.internalEditPost,
        "post/delete": API.internalDeletePost,
        "post/restore": API.internalRestorePost,
        "user/delete-posts": API.internalDeleteUserPosts,
        posts: API.internalListPosts
    };

    for (const [path, handler] of Object.entries(routes)) {
        router.post(`${internal}/${path}`, API.internalAuth, handler);
    }

    helpers.setupAdminPageRoute(
        router,
        "/admin/plugins/integration",
        [middleware.pluginHooks],
        API.renderAdmin
    );
};
