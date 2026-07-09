"use strict";

/*

NodeBB Integration Layer


Knowledge Indexer



*/




const Embeddings =
require("./embeddings");

const Qdrant =
require("./qdrant");

const crypto =
require("crypto");













function createId(prefix, id) {

/*
 * Qdrant supports UUID or integer.
 * Create deterministic UUID from source id.
 */


return crypto

    .createHash("sha256")

    .update(

        `${prefix}:${id}`

    )

    .digest("hex")

    .substring(0, 32);

}













async function indexDocument(

type,

id,

text,

payload = {}

) {




if(!text || !text.trim()) {


    return false;


}







const vector =

    await Embeddings.create(

        text

    );







if(!vector) {


    console.log(

        "[Indexer] embedding unavailable"

    );


    return false;


}







await Qdrant.ensureCollection();








const pointId =

    createId(

        type,

        id

    );







const result =

    await Qdrant.upsert(

        pointId,

        vector,

        {


            type,


            sourceId: id,


            text,


            ...payload


        }


    );








if(result) {



    console.log(

        `[Indexer] indexed ${type}:${id}`

    );


}







return result;




}













/*

Index post
*/

async function indexPost(post) {




if(!post) {


    return false;


}







return indexDocument(

    "post",

    post.pid,


    post.content || post.text || "",


    {


        pid:
            post.pid,


        uid:
            post.uid,


        tid:
            post.tid



    }


);

}













/*

Index topic
*/

async function indexTopic(topic) {




if(!topic) {


    return false;


}







return indexDocument(

    "topic",

    topic.tid,


    topic.title || "",


    {


        tid:
            topic.tid,


        uid:
            topic.uid



    }


);

}













module.exports = {

indexPost,


indexTopic,


indexDocument




};