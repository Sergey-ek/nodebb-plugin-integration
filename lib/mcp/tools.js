"use strict";


/*
 * NodeBB Integration Layer
 * MCP Tools
 */


const Forum =
require("../services/forum");


const Topics =
require("../services/topics");


const Topic =
require("../services/topic");


const Search =
require("../services/search");


const Embeddings =
require("../knowledge/embeddings");


const VectorSearch =
require("../knowledge/search");




module.exports = [



{
    name: "forum_info",

    description:
    "Get forum information",


    execute:
    async function(){


        return await Forum.getInfo();


    }

},






{
    name: "recent_topics",

    description:
    "Get recent forum topics",


    execute:
    async function(args){


        return await Topics.getRecent(

            args.limit || 20

        );


    }

},






{
    name: "get_topic",

    description:
    "Get complete topic with posts",


    execute:
    async function(args){


        return await Topic.getTopic(

            args.tid

        );


    }

},







{
    name: "search_topics",

    description:
    "Search forum topics by text",


    execute:
    async function(args){


        return await Search.searchTopics(

            args.query,

            args.limit || 20

        );


    }

},







{
    name: "semantic_search",

    description:
    "Search forum knowledge by meaning using AI embeddings",



    execute:
    async function(args){



        if(!args.query){

            throw new Error(
                "Query required"
            );

        }




        const vector =
            await Embeddings.createEmbedding(

                args.query

            );





        const results =
            await VectorSearch.search(

                vector,

                args.limit || 10

            );






        return results.map(

            function(item){


                return {


                    score:
                    item.score,



                    post:
                    item.payload


                };


            }

        );



    }

}





];