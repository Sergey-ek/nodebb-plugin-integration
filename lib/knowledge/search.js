"use strict";


const QDRANT =
process.env.QDRANT_URL ||
"http://localhost:6333";


const COLLECTION =
"nodebb_topics";



async function search(
    vector,
    limit = 10
){


    const response =
        await fetch(

        QDRANT +
        "/collections/" +
        COLLECTION +
        "/points/search",

        {

        method:"POST",

        headers:{

            "Content-Type":
            "application/json"

        },


        body:JSON.stringify({

            vector:vector,

            limit:limit,

            with_payload:true

        })


        }

    );



    const data =
        await response.json();



    return data.result || [];

}



module.exports = {

    search

};