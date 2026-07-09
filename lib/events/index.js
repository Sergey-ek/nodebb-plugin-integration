"use strict";


/*
 * NodeBB Events
 * AI Knowledge Pipeline
 */



const Posts =
require.main.require("./src/posts");


const Topics =
require.main.require("./src/topics");





function init() {



    process.on(
        "event:topic.post",
        async function(data){


            console.log(
                "[Integration] New post:",
                data.pid
            );


        }
    );





    process.on(
        "event:topic.create",
        async function(data){


            console.log(
                "[Integration] New topic:",
                data.tid
            );


        }
    );





}



module.exports = {

    init

};