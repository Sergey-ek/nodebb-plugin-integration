"use strict";


const Embeddings =
require("./embeddings");


const Qdrant =
require("./qdrant");





async function indexPost(post){


    const text =
        post.content
        .replace(/<[^>]*>/g,"")
        .trim();



    if(!text){

        return;

    }



    const vector =
        await Embeddings.createEmbedding(
            text
        );



    await Qdrant.savePoint(

        post.pid,

        vector,

        {

            type:"post",

            pid:post.pid,

            tid:post.tid,

            uid:post.uid,

            text:text.substring(0,1000)

        }

    );



    console.log(
        "[AI Index]",
        post.pid
    );


}



module.exports = {

    indexPost

};