"use strict";


const express = require("express");

const MCP =
require("./mcp/server");

const Forum =
require("./services/forum");


const Topics =
require("./services/topics");


const Topic =
require("./services/topic");


const Search =
require("./services/search");



const router =
express.Router();




exports.init = function(app){



/*
 * Ping
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
 * Forum info
 */

router.get(
"/info",
async function(req,res){


try {


res.json(
await Forum.getInfo()
);


}
catch(err){


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
 * /topics/recent?limit=10
 */

router.get(
"/topics/recent",
async function(req,res){


try {


const limit =
parseInt(
req.query.limit || 20
);



res.json(
await Topics.getRecent(limit)
);


}
catch(err){


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
 * /topics/123
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


res.status(500)
.json({

error:
err.message

});


}


});








/*
 * Search topics
 *
 * /search?q=deepfake
 *
 */

router.get(
"/search",
async function(req,res){


try {


const query =
req.query.q;



const limit =
parseInt(
req.query.limit || 20
);



const result =
await Search.searchTopics(
query,
limit
);



res.json(result);



}
catch(err){


res.status(500)
.json({

error:
err.message

});


}


});


router.post(
"/mcp",
MCP.handleMCP
);



app.use(
"/api/integration/v1",
router
);



};