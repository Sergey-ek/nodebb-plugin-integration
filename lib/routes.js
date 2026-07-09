"use strict";


const express = require("express");


const router = express.Router();


exports.init = function(app){


router.get(
"/ping",
function(req,res){

res.json({

ok:true,

plugin:
"nodebb-plugin-integration"

});

});


app.use(
"/api/integration/v1",
router
);


};