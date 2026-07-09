"use strict";

/*

NodeBB Integration Layer


Main plugin entry point



*/




require("dotenv").config();




const Config =
require("./src/config");

const Routes =
require("./src/routes");

const Events =
require("./src/events");

const Indexer =
require("./src/ai/indexer");

const MCP =
require("./src/mcp/server");













const Plugin = {};













/*

NodeBB hook:


static.load



*/

Plugin.init = async function(params) {




console.log(

    "[NodeBB Integration] initializing"

);







if(params && params.router) {



    Routes.init(

        params.router

    );



}

else {



    console.log(

        "[NodeBB Integration] router unavailable (standalone mode)"

    );



}








if(

    Events &&

    typeof Events.init === "function"

) {


    await Events.init();


}








console.log(

    "[NodeBB Integration] ready"

);




};













/*

NodeBB hook:


action.save



*/

Plugin.onPostSave = async function(post) {




try {



    await Events.postSave(

        post

    );



    await Indexer.indexPost(

        post

    );



}


catch(error) {



    console.error(

        "[Plugin] post save error",

        error.message

    );



}




};













/*

NodeBB hook:


action.save



*/

Plugin.onTopicSave = async function(topic) {




try {



    await Events.topicCreate(

        topic

    );



    await Indexer.indexTopic(

        topic

    );



}


catch(error) {



    console.error(

        "[Plugin] topic save error",

        error.message

    );



}




};













/*

API route:


/api/v3/integration/info



*/

Plugin.apiInfo = async function(req, res) {




const Meta =

    require("./src/nodebb/meta");







try {



    const info =

        await Meta.getInfo();







    res.json(info);



}


catch(error) {



    res.status(500)

        .json({

            error:

                error.message

        });



}




};













/*

API route:


/api/v3/integration/search



*/

Plugin.apiSearch = async function(req, res) {




const Search =

    require("./src/ai/search");







try {



    const result =

        await Search.searchText(

            req.body.query,

            req.body.limit || 5

        );







    res.json(result);



}


catch(error) {



    res.status(500)

        .json({

            error:

                error.message

        });



}




};













/*

Optional MCP startup
*/

Plugin.startMCP = async function() {




if(

    Config.mcp.enabled &&

    process.env.MCP_AUTOSTART === "true"

) {



    await MCP.start();



}




};













module.exports = Plugin;