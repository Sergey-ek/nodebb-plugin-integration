"use strict";


/*
 * Embedding provider
 * OpenAI compatible API
 */


async function createEmbedding(text) {


    const response =
        await fetch(
            "https://api.openai.com/v1/embeddings",
            {

                method:"POST",

                headers:{

                    "Content-Type":
                    "application/json",

                    "Authorization":
                    "Bearer " +
                    process.env.OPENAI_API_KEY

                },


                body:JSON.stringify({

                    model:
                    "text-embedding-3-small",

                    input:text

                })

            }
        );



    const data =
        await response.json();



    return data.data[0].embedding;


}



module.exports = {

    createEmbedding

};