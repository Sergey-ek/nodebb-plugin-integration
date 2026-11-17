"use strict";

const API = require("./api");
const OAuthRoutes = require("./oauth");
const OAuthClients = require("./oauth-clients");

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

    router.get(
        "/oauth/consent",
        middleware.buildHeader,
        OAuthRoutes.consent
    );

    router.post(
        "/oauth/consent",
        middleware.applyCSRF,
        middleware.ensureLoggedIn,
        OAuthRoutes.consentDecision
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

    helpers.setupPageRoute(
        router,
        "/user/:userslug/integration",
        [
            middleware.exposeUid,
            middleware.canViewUsers,
            middleware.buildAccountData,
            middleware.noIndexRemoteUser,
            middleware.ensureLoggedIn,
            middleware.checkAccountPermissions
        ],
        OAuthClients.render
    );

    router.post(
        "/user/:userslug/integration/access",
        middleware.applyCSRF,
        middleware.ensureLoggedIn,
        OAuthClients.setAccess
    );

    router.post(
        "/user/:userslug/integration/revoke",
        middleware.applyCSRF,
        middleware.ensureLoggedIn,
        OAuthClients.revoke
    );

    helpers.setupAdminPageRoute(
        router,
        "/admin/plugins/integration",
        [middleware.pluginHooks],
        API.renderAdmin
    );
};
