"use strict";


/*
 * NodeBB Integration Layer
 * Search service
 */


const Search =
require.main.require("./src/search");



async function searchTopics(
    query,
    limit = 20
){


    if (!query) {

        throw new Error(
            "Search query required"
        );

    }



    const results =
        await Search.search(
            query,
            {
                searchIn:
                    "titles",

                limit:
                    limit
            }
        );



    return results.map(function(item){


        return {

            tid:
                item.tid,

            title:
                item.title,

            category:
                item.category,

            cid:
                item.cid,

            author:
                item.username,

            timestamp:
                item.timestamp

        };


    });


}



module.exports = {

    searchTopics

};