"use strict";


/*
 * NodeBB Integration Layer
 *
 * Embeddings Service
 *
 * Unified interface for:
 *
 * - OpenAI embeddings
 * - Fake test embeddings
 *
 */



const Config =
    require("../config");


const OpenAI =
    require("./openai");







/*
 * Embedding size
 *
 * text-embedding-3-small = 1536
 */


const SIZE =

    Number(

        process.env.EMBEDDING_SIZE ||

        1536

    );









/*
 * Generate fake vector
 *
 * Used for:
 *
 * - tests
 * - development
 *
 */


function fakeEmbedding() {


    const vector = [];



    for(let i = 0; i < SIZE; i++) {


        vector.push(

            Math.random()

        );


    }



    return vector;


}









/*
 * Select provider
 */


function provider() {



    return (

        process.env.AI_PROVIDER ||

        "fake"

    );


}









/*
 * Create embedding
 */


async function create(text) {



    if(!text || !text.trim()) {


        return null;


    }








    /*
     * OpenAI mode
     */


    if(

        provider() === "openai"

    ) {



        const vector =

            await OpenAI.embeddings(

                text

            );





        return vector;


    }








    /*
     * Development/Test mode
     */


    return fakeEmbedding();



}









/*
 * Service information
 */


function info() {


    return {


        provider:
            provider(),


        size:
            SIZE


    };


}









module.exports = {


    create,


    info,


    SIZE



};