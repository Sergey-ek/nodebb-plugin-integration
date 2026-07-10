"use strict";

/**
 * NodeBB Integration Layer
 *
 * API controllers
 */

const Config = require("../config");
const Search = require("../ai/search");
const Meta = require("../nodebb/meta");

/**
 * GET /api/v3/integration/info
 */
exports.apiInfo = async function (req, res) {

    try {

        const forum = await Meta.getInfo();
        const settings = await Config.info();

        res.json({
            success: true,
            forum,
            settings
        });

    } catch (err) {

        res.status(500).json({
            success: false,
            error: err.message
        });

    }

};

/**
 * POST /api/v3/integration/search
 */
exports.apiSearch = async function (req, res) {

    try {

        const query = req.body?.query || "";
        const limit = Number(req.body?.limit || 5);

        const result = await Search.searchText(
            query,
            limit
        );

        res.json({
            success: true,
            result
        });

    } catch (err) {

        res.status(500).json({
            success: false,
            error: err.message
        });

    }

};

/**
 * ACP page
 */
exports.renderAdmin = async function (req, res) {

    try {

        const settings = await Config.get();

        res.render(
            "admin/plugins/integration",
            {
                title: "NodeBB Integration",

                settings
            }
        );

    } catch (err) {

        res.status(500).render("500", {
            error: err.message
        });

    }

};