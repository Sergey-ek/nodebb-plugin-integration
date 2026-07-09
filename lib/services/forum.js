"use strict";


/*
 * NodeBB Integration Layer
 * Forum service
 */


const meta =
require.main.require("./src/meta");


async function getInfo() {

    const config =
        await meta.configs.get("config");


    return {

        title: config.title,

        url: config.url,

        version: config.version,

        language: config.language || null

    };

}


module.exports = {

    getInfo

};