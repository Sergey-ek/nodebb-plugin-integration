"use strict";

const assert = require("assert");




describe(

"NodeBB Integration Layer",

function() {





    it(

        "should load plugin",

        function() {


            const plugin =

                require("../library");


            assert.ok(plugin);


            assert.equal(

                typeof plugin.init,

                "function"

            );


        }

    );









    it(

        "should load configuration",

        function() {


            const config =

                require("../src/config");


            assert.ok(config);


            assert.ok(

                config.nodebb

            );


            assert.ok(

                config.qdrant

            );


            assert.ok(

                config.embeddings

            );


        }

    );









    it(

        "should load AI modules",

        function() {


            const embeddings =

                require("../src/ai/embeddings");


            const qdrant =

                require("../src/ai/qdrant");


            const search =

                require("../src/ai/search");


            assert.equal(

                typeof embeddings.create,

                "function"

            );


            assert.ok(qdrant);


            assert.equal(

                typeof search.search,

                "function"

            );


        }

    );









    it(

        "should create fake embedding",

        async function() {


            process.env.AI_PROVIDER = "fake";


            const embeddings =

                require("../src/ai/embeddings");


            const vector =

                await embeddings.create(

                    "test text"

                );



            assert.ok(

                Array.isArray(vector)

            );


            assert.equal(

                vector.length,

                1536

            );


        }

    );









    it(

        "should load MCP modules",

        function() {


            const server =

                require("../src/mcp/server");


            const tools =

                require("../src/mcp/tools");


            assert.equal(

                typeof server.start,

                "function"

            );


            assert.equal(

                typeof tools.register,

                "function"

            );


        }

    );









    it(

        "should load NodeBB adapters",

        function() {


            const meta =

                require("../src/nodebb/meta");


            const posts =

                require("../src/nodebb/posts");


            const topics =

                require("../src/nodebb/topics");


            const users =

                require("../src/nodebb/users");



            assert.equal(

                typeof meta.getInfo,

                "function"

            );


            assert.equal(

                typeof posts.getPost,

                "function"

            );


            assert.equal(

                typeof topics.getTopic,

                "function"

            );


            assert.equal(

                typeof users.getUser,

                "function"

            );


        }

    );









    it(

        "should run standalone mode",

        async function() {


            const plugin =

                require("../library");


            await plugin.init({});


            assert.ok(true);


        }

    );





}

);