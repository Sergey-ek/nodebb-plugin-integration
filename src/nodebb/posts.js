"use strict";

/*

NodeBB Integration Layer


NodeBB Posts Adapter



*/




const NodeBB =
require("./index");













let nativePosts = null;













function loadNative() {




if(nativePosts) {


    return nativePosts;


}








try {



    if(

        require.main &&

        require.main.require

    ) {



        nativePosts =

            require.main.require(

                "./src/posts"

            );


    }



}


catch(error) {


    nativePosts = null;


}







return nativePosts;




}













async function getPost(pid) {




const posts =

    loadNative();








/*
 * Native NodeBB mode
 */


if(

    posts &&

    typeof posts.getPostFields === "function"

) {



    return await posts.getPostFields(

        pid,

        [

            "pid",

            "tid",

            "uid",

            "content",

            "timestamp"

        ]

    );


}








/*
 * Standalone mode
 */


return {


    pid,


    tid:

        null,



    uid:

        null,



    content:

        "NodeBB unavailable",



    timestamp:

        Date.now()



};




}













async function getPosts(pids = []) {




const result = [];








for(const pid of pids) {



    result.push(

        await getPost(pid)

    );


}







return result;




}













function info() {




return {


    nodebb:

        NodeBB.info(),



    adapter:

        "posts"



};




}













module.exports = {

getPost,


getPosts,


info




};