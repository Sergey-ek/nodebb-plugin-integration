"use strict";


/*
 * NodeBB Integration Layer
 * Single topic service
 */



let Topics = null;


let Posts = null;



try {


    Topics =
    require.main.require("./src/topics");


    Posts =
    require.main.require("./src/posts");



}

catch(err) {


    console.log(
        "[Topic Service] NodeBB API unavailable"
    );


}





async function getTopic(tid) {



    /*
     * NodeBB mode
     */


    if(Topics && Posts) {



        const topic =
            await Topics.getTopicData(
                tid
            );



        const posts =
            await Posts.getPosts(
                topic.mainPid,
                -1,
                -1
            );



        return {


            tid:
            tid,


            title:
            topic.title,


            cid:
            topic.cid,


            posts:
            posts



        };



    }





    /*
     * Test mode
     */


    return {


        tid:
        tid,


        title:
        "AI Security Test Topic",


        cid:
        1,


        posts:[

            {

                pid:1,

                username:
                "researcher",

                content:
                "Discussion about AI security."

            }

        ]


    };


}






module.exports = {


    getTopic


};