"use strict";


const QDRANT =
process.env.QDRANT_URL ||
"http://localhost:6333";



const COLLECTION =
"nodebb_topics";





async function savePoint(
id,
vector,
payload
){


    await fetch(

        QDRANT +
        "/collections/" +
        COLLECTION +
        "/points",

        {

        method:"PUT",

        headers:{

        "Content-Type":
        "application/json"

        },


        body:JSON.stringify({

            points:[{

                id:id,

                vector:vector,

                payload:payload

            }]

        })


        }

    );


}





module.exports = {

    savePoint

};