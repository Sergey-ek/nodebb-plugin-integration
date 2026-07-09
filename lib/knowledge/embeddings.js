"use strict";


/*
 * Embedding generator
 */



let OpenAI = null;



try {


    const {
        OpenAI: Client
    } =
    require("openai");


    OpenAI = Client;


}

catch(err){


    console.log(
        "[Embeddings] OpenAI package unavailable"
    );


}






async function createEmbedding(text){



    /*
     * Test mode
     */


    if(!OpenAI ||
       !process.env.OPENAI_API_KEY){



        console.log(
            "[Embeddings] Using fake vector"
        );



        return new Array(1536)
            .fill(0);



    }






    const client =
        new OpenAI({

            apiKey:
            process.env.OPENAI_API_KEY

        });





    const response =
        await client.embeddings.create({


            model:

            process.env.EMBEDDING_MODEL ||
            "text-embedding-3-small",



            input:text


        });






    return response
        .data[0]
        .embedding;



}





module.exports = {


    createEmbedding


};