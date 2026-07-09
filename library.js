"use strict";


const Routes =
require("./lib/routes");


const Indexer =
require("./lib/knowledge/indexer");



const Posts =
require.main.require("./src/posts");



const Plugin = {};





Plugin.init = function(params, callback){


    Routes.init(
        params.router
    );


    callback();


};






/*
 * New post event
 */

Plugin.onPostCreate =
async function(post){


    try {


        const data =
            await Posts.getPostData(
                post.pid
            );


        await Indexer.indexPost(
            data
        );


    }

    catch(err){


        console.error(
            "[Integration Index Error]",
            err
        );


    }


};







/*
 * New topic event
 */

Plugin.onTopicCreate =
async function(topic){


    console.log(

        "[Integration] New topic:",

        topic.tid

    );


};







module.exports =
Plugin;