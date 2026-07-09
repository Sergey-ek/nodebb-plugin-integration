"use strict";


/*
 * NodeBB Integration Layer
 *
 * OpenAI Adapter
 *
 * Provides:
 *
 * - Chat completion
 * - Embeddings
 *
 * Safe modes:
 *
 * - Development
 * - Test
 * - Production
 */



const Config =
    require("../config");



let client = null;








/*
 * Check API availability
 */


function isAvailable() {


    return Boolean(

        Config.openai.apiKey

    );


}









/*
 * Lazy OpenAI client creation
 */


async function getClient() {



    if(client) {


        return client;


    }







    if(!isAvailable()) {


        console.log(

            "[OpenAI] API key not configured"

        );


        return null;


    }








    try {



        const OpenAI =
            require("openai");





        client =
            new OpenAI({

                apiKey:
                    Config.openai.apiKey

            });






        return client;


    }


    catch(error) {



        console.error(

            "[OpenAI] initialization failed",

            error

        );



        return null;


    }


}









/*
 * Create embedding vector
 */


async function embeddings(text) {



    const openai =
        await getClient();





    if(!openai) {



        return null;


    }








    if(!text || !text.trim()) {



        return null;


    }








    const response =
        await openai.embeddings.create({

            model:
                Config.openai.embeddingModel,


            input:
                text


        });






    return response
        .data[0]
        .embedding;


}









/*
 * Chat completion
 */


async function chat(messages) {



    const openai =
        await getClient();





    if(!openai) {


        return null;


    }







    const response =
        await openai.chat.completions.create({


            model:
                Config.openai.model,



            messages



        });







    return response
        .choices[0]
        .message
        .content;


}









module.exports = {


    isAvailable,


    getClient,


    embeddings,


    chat



};