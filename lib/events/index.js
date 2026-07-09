"use strict";



const Indexer =
require("../knowledge/indexer");



const Events = {};




Events.init = function(){


    console.log(
        "[Integration Events] loaded"
    );


};






Events.postCreated =
async function(post){


    console.log(
        "New post:",
        post.pid
    );



    if(Indexer.indexPost){


        await Indexer.indexPost(
            post
        );


    }


};






Events.topicCreated =
async function(topic){


    console.log(
        "New topic:",
        topic.tid
    );


};






module.exports =
Events;