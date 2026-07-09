"use strict";

/*

NodeBB Integration Layer


NodeBB Meta Adapter



*/




const NodeBB =
require("./index");













let nativeMeta = null;













function loadNative() {




if(nativeMeta) {


    return nativeMeta;


}








try {



    if(

        require.main &&

        require.main.require

    ) {



        nativeMeta =

            require.main.require(

                "./src/meta"

            );


    }



}


catch(error) {


    nativeMeta = null;


}







return nativeMeta;




}













async function getInfo() {




const meta =

    loadNative();








/*
 * Real NodeBB
 */


if(

    meta &&

    meta.configs &&

    meta.configs.get

) {



    const config =

        await meta.configs.get(

            "config"

        );







    return {


        title:

            config.title || "",



        url:

            config.url || "",



        version:

            config.version || "",



        language:

            config.language || null



    };


}








/*
 * Standalone mode
 */


return {


    title:

        "NodeBB Integration Development",



    url:

        NodeBB.info().url,



    version:

        "unknown",



    language:

        null



};




}













module.exports = {

getInfo




};