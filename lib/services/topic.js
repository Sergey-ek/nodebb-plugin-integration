"use strict";


/*
 * NodeBB Integration Layer
 * Single topic service
 */


const Topics =
require.main.require("./src/topics");



async function getTopic(tid) {


    const topic =
        await Topics.getTopicData(tid);



    if (!topic) {

        return null;

    }



    const posts =
        await Topics.getPosts(
            tid,
            0,
            topic.postcount
        );



    return {

        tid: topic.tid,

        title: topic.title,


        category: {

            cid: topic.cid,

            name: topic.category

        },


        author: {

            uid: topic.uid,

            username: topic.username

        },


        statistics: {

            views:
                topic.viewcount,

            replies:
                topic.postcount - 1

        },


        timestamp:
            topic.timestamp,


        posts:
            posts.map(function(post){

                return {

                    pid:
                        post.pid,

                    uid:
                        post.uid,

                    username:
                        post.username,

                    content:
                        post.content,

                    timestamp:
                        post.timestamp

                };

            })

    };

}



module.exports = {

    getTopic

};