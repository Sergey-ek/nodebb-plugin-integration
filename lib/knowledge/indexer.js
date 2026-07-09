"use strict";


/*
 * Knowledge indexer
 */


const Embeddings =
require("./embeddings");


const Qdrant =
require("./qdrant");






async function indexPost(post){



    if(!post){


        return false;


    }





    const text =

        post.content ||

        post.text ||

        "";






    if(!text){


        return false;


    }





    const vector =

        await Embeddings.createEmbedding(

            text

        );







    await Qdrant.savePoint(


        post.pid || Date.now(),


        vector,


        {

            pid:
            post.pid,


            tid:
            post.tid,


            uid:
            post.uid,


            content:
            text


        }


    );





    console.log(

        "[Indexer] indexed post",

        post.pid

    );




    return true;



}






module.exports = {


    indexPost


};