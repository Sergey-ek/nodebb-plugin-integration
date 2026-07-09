"use strict";


const express = require("express");

const Forum =
require("./services/forum");


const router =
express.Router();



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



router.get(
"/info",
async function(req,res){

try {


const info =
await Forum.getInfo();


res.json(info);


}
catch(err){

console.error(err);

res.status(500).json({

error:
err.message

});

}

});



app.use(
"/api/integration/v1",
router
);


};