"use strict";


const Forum =
require("../services/forum");


const Topics =
require("../services/topics");


const Topic =
require("../services/topic");


const Search =
require("../services/search");



module.exports = [



{
    name:"forum_info",

    description:
    "Get forum information",

    execute:
    async function(){

        return await Forum.getInfo();

    }

},




{
    name:"recent_topics",

    description:
    "Get recent forum topics",

    execute:
    async function(args){

        return await Topics.getRecent(
            args.limit || 20
        );

    }

},




{
    name:"get_topic",

    description:
    "Get complete topic with posts",

    execute:
    async function(args){

        return await Topic.getTopic(
            args.tid
        );

    }

},




{
    name:"search_topics",

    description:
    "Search forum topics",

    execute:
    async function(args){

        return await Search.searchTopics(
            args.query,
            args.limit || 20
        );

    }

}



];