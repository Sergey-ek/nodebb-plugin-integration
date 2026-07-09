"use strict";

const Routes = require("./lib/routes");


const Plugin = {};

Plugin.init = function(params){

    Routes.init(params.router);

};


module.exports = Plugin;