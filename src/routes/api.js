"use strict";

/*

NodeBB Integration Layer


HTTP API routes



*/




const Meta =
require("../nodebb/meta");

const Search =
require("../ai/search");













function init(router) {




if(!router) {


    return false;


}








router.get(

    "/api/v3/integration/info",

    async function(

        req,

        res

    ) {



        try {



            const info =

                await Meta.getInfo();







            res.json(info);



        }


        catch(error) {



            res.status(500)

                .json({

                    error:

                        error.message

                });



        }



    }

);









router.post(

    "/api/v3/integration/search",

    async function(

        req,

        res

    ) {



        try {



            const query =

                req.body.query;







            const limit =

                req.body.limit || 5;







            const result =

                await Search.searchText(

                    query,

                    limit

                );







            res.json(result);



        }


        catch(error) {



            res.status(500)

                .json({

                    error:

                        error.message

                });



        }



    }

);








return true;




}













module.exports = {

init




};