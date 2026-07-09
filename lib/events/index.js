"use strict";


const Indexer =
require("../knowledge/indexer");



const Posts =
require.main.require("./src/posts");





function init(){



process.on(
"event:post.created",

async function(data){


    try {


        const post =
            await Posts.getPostData(
                data.pid
            );


        await Indexer.indexPost(
            post
        );


    }

    catch(err){

        console.error(
            "[AI Index error]",
            err
        );

    }


});


}





module.exports = {

init

};