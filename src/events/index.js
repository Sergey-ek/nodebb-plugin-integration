"use strict";

/*

NodeBB Integration Layer


NodeBB Events



*/




const Indexer =
require("../ai/indexer");




let initialized = false;













async function init() {




if(initialized) {


    return;


}







initialized = true;





console.log(

    "[Events] initialized"

);





console.log(

    "[Events] AI provider:",

    process.env.AI_PROVIDER || "fake"

);




}













/*

New post handler


NodeBB hook:


filter.save



*/

async function postSave(post) {




try {



    if(!post) {


        return post;


    }







    console.log(

        "[Events] post saved:",

        post.pid

    );








    if(Indexer && typeof Indexer.indexPost === "function") {


        await Indexer.indexPost(

            post

        );


    }



}


catch(error) {



    console.error(

        "[Events] postSave error",

        error.message

    );



}







return post;

}













/*

New topic handler


NodeBB hook:


filter.create



*/

async function topicCreate(topic) {




try {



    if(!topic) {


        return topic;


    }







    console.log(

        "[Events] topic created:",

        topic.tid

    );








    if(Indexer && typeof Indexer.indexTopic === "function") {


        await Indexer.indexTopic(

            topic

        );


    }



}


catch(error) {



    console.error(

        "[Events] topicCreate error",

        error.message

    );



}







return topic;

}













module.exports = {

init,


postSave,


topicCreate




};