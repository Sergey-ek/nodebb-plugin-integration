"use strict";


const assert =
require("assert");



describe(
"NodeBB Integration Plugin",
function(){


    it(
    "should load plugin",
    function(){


        const plugin =
        require("../library");


        assert.ok(
            plugin
        );


        assert.ok(
            plugin.init
        );


    });



});