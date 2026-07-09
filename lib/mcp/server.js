"use strict";


/*
 * NodeBB Integration Layer
 * MCP HTTP Server
 */


const tools =
require("./tools");





function getToolSchemas(){


    return tools.map(function(tool){


        return {

            name:
            tool.name,


            description:
            tool.description,


            inputSchema:
            tool.inputSchema || {

                type:"object",

                properties:{}

            }

        };


    });


}






async function handleMCP(req,res){


    try {



        const body =
            req.body;



        if(!body || !body.method){


            return res.status(400)
            .json({

                error:
                "Invalid MCP request"

            });


        }





        /*
         * MCP tools/list
         */

        if(body.method === "tools/list"){



            return res.json({

                tools:
                getToolSchemas()

            });


        }






        /*
         * MCP tools/call
         */

        if(body.method === "tools/call"){



            const name =
                body.params &&
                body.params.name;




            const args =
                body.params &&
                body.params.arguments
                ?
                body.params.arguments
                :
                {};





            const tool =
                tools.find(function(t){


                    return t.name === name;


                });






            if(!tool){


                return res.status(404)
                .json({

                    error:
                    "Tool not found"

                });


            }






            const result =
                await tool.execute(args);






            return res.json({

                content:[

                    {

                        type:"text",

                        text:
                        JSON.stringify(
                            result,
                            null,
                            2
                        )

                    }

                ]

            });





        }





        return res.status(400)
        .json({

            error:
            "Unsupported MCP method"

        });




    }

    catch(err){



        console.error(
            "[MCP ERROR]",
            err
        );



        return res.status(500)
        .json({

            error:
            err.message

        });



    }



}






module.exports = {

    handleMCP

};