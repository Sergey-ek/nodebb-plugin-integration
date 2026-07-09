"use strict";


/*
 * NodeBB Integration Layer
 * Topics service
 */


const Topics =
require.main.require("./src/topics");



async function getRecent(limit = 20) {


    const tids =
        await Topics.getRecentTids(
            0,
            limit
        );


    const topics =
        await Topics.getTopics(
            tids,
            {}
        );


    return topics.map(function(topic){


        return {

            tid: topic.tid,

            title: topic.title,

            category:
                topic.category,

            cid:
                topic.cid,

            author:
                topic.username,

            replies:
                topic.postcount - 1,

            views:
                topic.viewcount,

            timestamp:
                topic.timestamp

        };


    });

}



async function getById(tid) {


    const topic =
        await Topics.getTopicData(tid);


    if (!topic) {

        return null;

    }


    return topic;

}



module.exports = {


    getRecent,

    getById


};