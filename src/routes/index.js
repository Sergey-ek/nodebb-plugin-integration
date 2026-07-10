"use strict";

/**
 * NodeBB Integration Layer
 *
 * Routes
 */

const API = require("./api");

exports.init = function (router, middleware) {

    if (!router) {
        return;
    }

    /*
     * REST API
     */

    router.get(
        "/api/v3/integration/info",
        API.apiInfo
    );

    router.post(
        "/api/v3/integration/search",
        API.apiSearch
    );

    /*
     * ACP page
     */

    if (
        middleware &&
        middleware.admin &&
        typeof middleware.admin.buildHeader === "function"
    ) {

        router.get(
            "/admin/plugins/integration",
            middleware.admin.buildHeader,
            API.renderAdmin
        );

    }

};