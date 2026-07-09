"use strict";

/*

NodeBB Integration Layer


Semantic Search



*/




const Embeddings =
require("./embeddings");

const Qdrant =
require("./qdrant");













async function search(

query,

limit = 5

) {




if(!query || !query.trim()) {


    return [];


}








try {



    const vector =

        await Embeddings.create(

            query

        );








    if(!vector) {



        return [];


    }








    const results =

        await Qdrant.search(

            vector,

            limit

        );








    return results.map(

        item =>

        ({


            id:

                item.id,



            score:

                item.score,



            payload:

                item.payload || {}



        })

    );



}


catch(error) {



    console.error(

        "[Search] error",

        error.message

    );



    return [];


}




}













async function searchText(

text,

limit = 5

) {

return search(

    text,

    limit

);

}













function formatResults(results) {




return results.map(

    result =>

    ({


        score:

            result.score,



        text:

            result.payload.text || "",



        type:

            result.payload.type || null,



        sourceId:

            result.payload.sourceId || null



    })

);




}













module.exports = {

search,


searchText,


formatResults




};