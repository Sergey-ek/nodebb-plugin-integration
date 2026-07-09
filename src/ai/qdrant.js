"use strict";

/*

NodeBB Integration Layer


Qdrant Vector Database Adapter



*/




const {

QdrantClient

} = require("@qdrant/js-client-rest");




const Config =
require("../config");













let client = null;













function getClient() {




if(client) {


    return client;


}








client = new QdrantClient({


    url:

        Config.qdrant.url



});







return client;




}













function isTestMode() {




return (

    process.env.NODE_ENV === "test"

);




}













async function ensureCollection() {




if(isTestMode()) {



    console.log(

        "[Qdrant] test mode skip"

    );


    return true;


}








const qdrant =

    getClient();








try {



    const collections =

        await qdrant.getCollections();








    const exists =

        collections.collections.some(

            c =>

            c.name === Config.qdrant.collection

        );








    if(!exists) {



        await qdrant.createCollection(

            Config.qdrant.collection,

            {


                vectors:

                {


                    size:

                        Config.embeddings.size,


                    distance:

                        "Cosine"


                }


            }

        );








        console.log(

            "[Qdrant] collection created"

        );



    }








    return true;



}


catch(error) {



    console.error(

        "[Qdrant] collection error",

        error.message

    );



    return false;



}




}













async function upsert(

id,

vector,

payload = {}

) {




if(isTestMode()) {


    return true;


}








const qdrant =

    getClient();








try {



    await qdrant.upsert(

        Config.qdrant.collection,

        {


            wait: true,


            points:

            [


                {


                    id,


                    vector,


                    payload



                }


            ]



        }

    );








    return true;



}


catch(error) {



    console.error(

        "[Qdrant] upsert error",

        error.message

    );



    return false;



}




}













async function search(

vector,

limit = 5

) {




if(isTestMode()) {



    return [];


}








const qdrant =

    getClient();








try {



    return await qdrant.search(

        Config.qdrant.collection,

        {


            vector,


            limit,


            with_payload: true



        }

    );



}


catch(error) {



    console.error(

        "[Qdrant] search error",

        error.message

    );



    return [];


}




}













module.exports = {

getClient,


ensureCollection,


upsert,


search




};