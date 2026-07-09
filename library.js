"use strict";

/**
 * NodeBB Integration Layer
 *
 * Main plugin entry point
 */

require("dotenv").config();

const Config = require("./src/config");
const Routes = require("./src/routes");
const Events = require("./src/events");
const Indexer = require("./src/ai/indexer");
const MCP = require("./src/mcp/server");


const Plugin = {};


/**
 * NodeBB hook:
 *
 * static:app.load
 */
Plugin.init = async function ({ router } = {}) {

    console.log(
        "[NodeBB Integration] initializing"
    );


    if (router) {

        Routes.init(
            router
        );

    } else {

        console.log(
            "[NodeBB Integration] router unavailable (standalone mode)"
        );

    }


    if (
        Events &&
        typeof Events.init === "function"
    ) {

        await Events.init();

    }


    if (
        Config?.mcp?.enabled &&
        process.env.MCP_AUTOSTART === "true" &&
        MCP &&
        typeof MCP.start === "function"
    ) {

        await MCP.start();

        console.log(
            "[NodeBB Integration] MCP started"
        );

    }


    console.log(
        "[NodeBB Integration] ready"
    );

};


/**
 * NodeBB hook:
 *
 * action:post.save
 */
Plugin.onPostSave = async function (post) {

    try {

        if (
            Events &&
            typeof Events.postSave === "function"
        ) {

            await Events.postSave(
                post
            );

        }


        if (
            Indexer &&
            typeof Indexer.indexPost === "function"
        ) {

            await Indexer.indexPost(
                post
            );

        }


    } catch (error) {

        console.error(
            "[Plugin] post save error",
            error.message
        );

    }

};


/**
 * NodeBB hook:
 *
 * action:topic.save
 */
Plugin.onTopicSave = async function (topic) {

    try {

        if (
            Events &&
            typeof Events.topicCreate === "function"
        ) {

            await Events.topicCreate(
                topic
            );

        }


        if (
            Indexer &&
            typeof Indexer.indexTopic === "function"
        ) {

            await Indexer.indexTopic(
                topic
            );

        }


    } catch (error) {

        console.error(
            "[Plugin] topic save error",
            error.message
        );

    }

};


module.exports = Plugin;