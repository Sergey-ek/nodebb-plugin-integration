"use strict";


/*
 * NodeBB Integration Layer
 * Forum service
 */


let meta = null;



/*
 * Load NodeBB internal API only when running inside NodeBB
 */

try {

    meta =
    require.main.require("./src/meta");


}

catch(err) {


    console.log(
        "[Forum Service] NodeBB meta API unavailable"
    );


}





async function getInfo() {


    /*
     * Running inside NodeBB
     */


    if(meta) {


        const config =
            await meta.configs.get("config");



        return {


            title:
            config.title || "NodeBB Forum",



            url:
            config.url || null,



            version:
            config.version || null,



            language:
            config.language || null


        };


    }





    /*
     * Running in tests / development
     */


    return {


        title:
        "NodeBB Integration Test Forum",


        url:
        "http://localhost:4567",


        version:
        "development",


        language:
        "en"


    };


}





module.exports = {


    getInfo


};