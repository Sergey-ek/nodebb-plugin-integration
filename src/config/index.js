"use strict";

/*

NodeBB Integration Layer


Global configuration



*/

require("dotenv").config();













const Config = {




environment:

    process.env.NODE_ENV ||

    "development",





nodebb: {


    url:

        process.env.NODEBB_URL ||

        "http://localhost:4567",



    apiKey:

        process.env.NODEBB_API_KEY ||

        ""


},








redis: {


    host:

        process.env.REDIS_HOST ||

        "localhost",



    port:

        Number(

            process.env.REDIS_PORT ||

            6379

        ),



    password:

        process.env.REDIS_PASSWORD ||

        ""



},








qdrant: {


    url:

        process.env.QDRANT_URL ||

        "http://localhost:6333",



    collection:

        process.env.QDRANT_COLLECTION ||

        "nodebb_knowledge"



},








openai: {


    apiKey:

        process.env.OPENAI_API_KEY ||

        "",



    model:

        process.env.OPENAI_MODEL ||

        "gpt-4.1-mini",



    embeddingModel:

        process.env.OPENAI_EMBEDDING_MODEL ||

        "text-embedding-3-small"



},








embeddings: {


    provider:

        process.env.AI_PROVIDER ||

        "fake",



    size:

        Number(

            process.env.EMBEDDING_SIZE ||

            1536

        )



},








mcp: {


    enabled:

        process.env.MCP_ENABLED !== "false"



}













};













/*

Safe debug output


Does not expose API keys
*/

Config.info = function() {




return {


    environment:

        Config.environment,



    nodebb:

    {

        url:

            Config.nodebb.url

    },



    qdrant:

    {

        url:

            Config.qdrant.url,


        collection:

            Config.qdrant.collection

    },



    embeddings:

        Config.embeddings,



    mcp:

        Config.mcp



};

};













module.exports = Config;