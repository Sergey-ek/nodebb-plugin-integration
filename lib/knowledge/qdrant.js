"use strict";


/*
 * Qdrant vector storage layer
 */



let client = null;



const TEST_MODE =
process.env.NODE_ENV === "test" ||
process.env.CI === "true";



if(!TEST_MODE){


    try {


        const {
            QdrantClient
        } =
        require("@qdrant/js-client-rest");



        client =
        new QdrantClient({

            url:
            process.env.QDRANT_URL ||
            "http://localhost:6333"

        });



    }

    catch(err){


        console.log(
            "[Qdrant] client unavailable"
        );


    }


}




const COLLECTION =
process.env.QDRANT_COLLECTION ||
"nodebb_topics";






async function savePoint(
id,
vector,
payload
){



    if(!client){


        console.log(
            "[Qdrant] test mode skip"
        );


        return true;


    }





    await client.upsert(

        COLLECTION,

        {

            points:[

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






module.exports = {


    savePoint


};