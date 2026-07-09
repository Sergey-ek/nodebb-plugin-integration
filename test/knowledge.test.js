"use strict";


const assert =
require("assert");


const Indexer =
require("../lib/knowledge/indexer");




describe(
"Knowledge Pipeline",
function(){


    it(
    "should index post without external services",
    async function(){


        const result =
            await Indexer.indexPost({

                pid:1,

                tid:10,

                content:
                "AI security research"

            });



        assert.equal(
            result,
            true
        );


    });


});