"use strict";


/*
 * NodeBB Integration Layer
 * Search service
 */



let Search = null;



try {


    Search =
    require.main.require("./src/search");


}

catch(err) {


    console.log(
        "[Search Service] NodeBB API unavailable"
    );


}





async function searchTopics(
    query,
    limit = 20
) {



    /*
     * NodeBB mode
     */


    if(Search) {


        const result =
            await Search.search(
                query,
                0,
                limit
            );


        return result;


    }





    /*
     * Test mode
     */


    return [

        {


            tid:
            1,


            title:
            "AI Security Fundamentals",


            content:
            "Research about artificial intelligence security."


        },


        {


            tid:
            2,


            title:
            "Protecting AI Agents",


            content:
            "Threat models and attack prevention."


        }


    ].slice(0, limit);



}





module.exports = {


    searchTopics


};