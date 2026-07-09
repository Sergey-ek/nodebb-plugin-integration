"use strict";


/*
 * NodeBB Integration Layer
 * Topics service
 */



let Topics = null;



try {


    Topics =
    require.main.require("./src/topics");


}

catch(err) {


    console.log(
        "[Topics Service] NodeBB API unavailable"
    );


}





async function getRecent(limit = 20) {



    /*
     * Real NodeBB mode
     */


    if(Topics) {


        const tids =
            await Topics.getRecentTopics(
                0,
                limit
            );


        return tids;


    }





    /*
     * Test mode
     */


    return [

        {
            tid: 1,

            title:
            "AI Security Research",

            author:
            "test-user",

            replies:
            5

        },

        {

            tid: 2,

            title:
            "Machine Learning Safety",

            author:
            "test-user",

            replies:
            3

        }

    ].slice(0, limit);



}





module.exports = {


    getRecent


};