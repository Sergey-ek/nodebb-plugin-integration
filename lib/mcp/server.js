"use strict";


const tools =
require("./tools");



async function handleMCP(req,res){


    try {


        const body =
            req.body;



        if(body.method === "tools/list"){


            return res.json({

                tools:
                tools.map(function(tool){

                    return {

                        name:
                        tool.name,

                        description:
                        tool.description

                    };

                })

            });


        }




        if(body.method === "tools/call"){



            const tool =
                tools.find(
                    t =>
                    t.name === body.params.name
                );



            if(!tool){


                return res.status(404)
                .json({

                    error:
                    "Tool not found"

                });


            }



            const result =
                await tool.execute(
                    body.params.arguments || {}
                );



            return res.json({

                result

            });


        }



        res.status(400)
        .json({

            error:
            "Unsupported MCP method"

        });



    }

    catch(err){


        res.status(500)
        .json({

            error:
            err.message

        });


    }


}



module.exports = {

    handleMCP

};