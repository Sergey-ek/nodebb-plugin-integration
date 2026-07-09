"use strict";


const Routes =
require("./lib/routes");


const Events =
require("./lib/events");



const Plugin = {};




/*
 * Plugin initialization
 */

Plugin.init = function(params, callback){


    const router =
        params.router;


    Routes.init(router);



    Events.init();



    console.log(
        "[NodeBB Integration] initialized"
    );



    callback();


};





/*
 * Called when post is created
 */

Plugin.onPostCreate =
async function(data){


    try{


        await Events.postCreated(
            data
        );


    }

    catch(err){


        console.error(
            "[NodeBB Integration]",
            err
        );


    }

};





/*
 * Called when topic is created
 */

Plugin.onTopicCreate =
async function(data){


    try{


        await Events.topicCreated(
            data
        );


    }

    catch(err){


        console.error(
            "[NodeBB Integration]",
            err
        );


    }

};





module.exports =
Plugin;