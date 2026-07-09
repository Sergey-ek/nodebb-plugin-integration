"use strict";

/*

NodeBB Integration Layer


NodeBB Topics Adapter



*/




const NodeBB =
require("./index");













let nativeTopics = null;













function loadNative() {




if(nativeTopics) {


    return nativeTopics;


}








try {



    if(

        require.main &&

        require.main.require

    ) {



        nativeTopics =

            require.main.require(

                "./src/topics"

            );


    }



}


catch(error) {


    nativeTopics = null;


}







return nativeTopics;




}













async function getTopic(tid) {




const topics =

    loadNative();








/*
 * Native NodeBB mode
 */


if(

    topics &&

    typeof topics.getTopicFields === "function"

) {



    return await topics.getTopicFields(

        tid,

        [

            "tid",

            "uid",

            "title",

            "cid",

            "timestamp",

            "mainPid"

        ]

    );


}








/*
 * Standalone mode
 */


return {


    tid,


    uid:

        null,



    title:

        "NodeBB unavailable",



    cid:

        null,



    timestamp:

        Date.now(),



    mainPid:

        null



};




}













async function getTopics(tids = []) {




const result = [];








for(const tid of tids) {



    result.push(

        await getTopic(tid)

    );


}







return result;




}













function info() {




return {


    nodebb:

        NodeBB.info(),



    adapter:

        "topics"



};




}













module.exports = {

getTopic,


getTopics,


info




};