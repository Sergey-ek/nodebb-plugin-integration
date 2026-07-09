"use strict";


const express = require("express");


const Forum =
require("./services/forum");


const Topics =
require("./services/topics");


const Topic =
require("./services/topic");



const router =
express.Router();



exports.init = function(app){



/*
 * Health check
 */

router.get(
"/ping",
function(req,res){


res.json({

    ok:true,

    plugin:
    "nodebb-plugin-integration"

});


});




/*
 * Forum information
 */

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


res.status(500)
.json({

error:
err.message

});


}


});






/*
 * Recent topics
 *
 * GET:
 * /api/integration/v1/topics/recent
 *
 * optional:
 * ?limit=10
 */

router.get(
"/topics/recent",
async function(req,res){


try {


const limit =
parseInt(
req.query.limit || 20
);



const topics =
await Topics.getRecent(limit);



res.json(topics);



}
catch(err){


console.error(err);


res.status(500)
.json({

error:
err.message

});


}


});







/*
 * Single topic
 *
 * GET:
 *
 * /api/integration/v1/topics/123
 *
 */

router.get(
"/topics/:tid",
async function(req,res){


try {


const tid =
parseInt(
req.params.tid
);



const topic =
await Topic.getTopic(tid);



if(!topic){


return res.status(404)
.json({

error:
"Topic not found"

});


}



res.json(topic);



}
catch(err){


console.error(err);



res.status(500)
.json({

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