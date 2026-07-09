"use strict";


const Routes =
require("./lib/routes");


const Events =
require("./lib/events");



const Plugin = {};



Plugin.init = function(params){


    Routes.init(
        params.router
    );


    Events.init();


};



module.exports = Plugin;