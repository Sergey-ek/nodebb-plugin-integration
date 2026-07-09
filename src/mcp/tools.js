"use strict";

/*

NodeBB Integration Layer


MCP Tools



*/




const Meta =
require("../nodebb/meta");

const Posts =
require("../nodebb/posts");

const Topics =
require("../nodebb/topics");

const Users =
require("../nodebb/users");

const Search =
require("../ai/search");













const definitions = [

{


    name:

        "get_forum_info",



    description:

        "Get NodeBB forum information",



    inputSchema:

    {

        type:

            "object",

        properties: {}

    }



},





{


    name:

        "get_post",



    description:

        "Get NodeBB post by pid",



    inputSchema:

    {

        type:

            "object",


        properties:

        {


            pid:

            {

                type:

                    "number"

            }


        },


        required:

        [

            "pid"

        ]

    }



},





{


    name:

        "get_topic",



    description:

        "Get NodeBB topic by tid",



    inputSchema:

    {

        type:

            "object",


        properties:

        {


            tid:

            {

                type:

                    "number"

            }


        },


        required:

        [

            "tid"

        ]

    }



},





{


    name:

        "get_user",



    description:

        "Get NodeBB user by uid",



    inputSchema:

    {

        type:

            "object",


        properties:

        {


            uid:

            {

                type:

                    "number"

            }


        },


        required:

        [

            "uid"

        ]

    }



},





{


    name:

        "search_knowledge",



    description:

        "Semantic search in forum knowledge base",



    inputSchema:

    {

        type:

            "object",


        properties:

        {


            query:

            {

                type:

                    "string"

            },


            limit:

            {

                type:

                    "number"

            }


        },


        required:

        [

            "query"

        ]

    }



}




];













async function execute(

name,

args = {}

) {




switch(name) {



    case "get_forum_info":



        return Meta.getInfo();







    case "get_post":



        return Posts.getPost(

            args.pid

        );







    case "get_topic":



        return Topics.getTopic(

            args.tid

        );







    case "get_user":



        return Users.getUser(

            args.uid

        );







    case "search_knowledge":



        return Search.searchText(

            args.query,

            args.limit || 5

        );







    default:



        throw new Error(

            `Unknown MCP tool: ${name}`

        );



}




}













function register(server) {




/*
 * MCP SDK 1.x compatibility
 */


if(

    typeof server.setRequestHandler !== "function"

) {



    throw new Error(

        "Invalid MCP server instance"

    );


}








server.setRequestHandler(

    {

        method:

            "tools/list"


    },


    async () => ({


        tools:

            definitions


    })

);








server.setRequestHandler(

    {

        method:

            "tools/call"


    },


    async request => {



        const result =

            await execute(

                request.params.name,

                request.params.arguments || {}

            );







        return {


            content:

            [

                {


                    type:

                        "text",



                    text:

                        JSON.stringify(

                            result,

                            null,

                            2

                        )


                }

            ]

        };



    }

);








console.log(

    "[MCP] tools registered"

);




}













module.exports = {

register,


execute,


definitions




};