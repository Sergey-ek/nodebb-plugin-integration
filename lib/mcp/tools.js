"use strict";


/*
 * NodeBB Integration Layer
 * MCP Tools Definition
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




/*
 * Forum information
 */

{
    name: "forum_info",

    description:
    "Get basic information about the NodeBB forum",


    inputSchema: {

        type: "object",

        properties: {}

    },


    execute:
    async function(){


        return await Forum.getInfo();


    }

},







/*
 * Recent topics
 */

{
    name: "recent_topics",

    description:
    "Get recent topics from the forum",



    inputSchema: {

        type: "object",


        properties: {


            limit: {

                type: "number",

                description:
                "Maximum number of topics to return"

            }


        }


    },



    execute:
    async function(args){


        return await Topics.getRecent(

            args.limit || 20

        );


    }

},







/*
 * Get full topic
 */

{
    name: "get_topic",

    description:
    "Get a complete topic including posts",



    inputSchema: {

        type: "object",


        properties: {


            tid: {

                type: "number",

                description:
                "Topic ID"

            }


        },


        required: [

            "tid"

        ]


    },



    execute:
    async function(args){


        return await Topic.getTopic(

            args.tid

        );


    }

},







/*
 * Text search
 */

{
    name: "search_topics",

    description:
    "Search forum topics using NodeBB text search",



    inputSchema: {

        type: "object",


        properties: {


            query: {

                type: "string",

                description:
                "Search query"

            },


            limit: {

                type: "number",

                description:
                "Maximum number of results"

            }


        },


        required: [

            "query"

        ]


    },



    execute:
    async function(args){


        return await Search.searchTopics(

            args.query,

            args.limit || 20

        );


    }

},







/*
 * Semantic AI search
 */

{
    name: "semantic_search",

    description:
    "Search forum knowledge by meaning using AI embeddings and vector database",



    inputSchema: {

        type: "object",


        properties: {


            query: {

                type: "string",

                description:
                "Natural language question or search request"

            },


            limit: {

                type: "number",

                description:
                "Maximum number of similar documents"

            }


        },


        required: [

            "query"

        ]


    },



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


                    document:
                    item.payload


                };


            }


        );



    }

}




];