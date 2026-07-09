"use strict";

/*

NodeBB Integration Layer


MCP Server



*/




const {

Server

} = require("@modelcontextprotocol/sdk/server/index.js");




const {

StdioServerTransport

} = require("@modelcontextprotocol/sdk/server/stdio.js");




const Tools =
require("./tools");













let server = null;













function createServer() {




if(server) {


    return server;


}








server = new Server(


    {

        name:

            "nodebb-integration-mcp",


        version:

            "0.2.0"


    },


    {


        capabilities:


        {


            tools: {}

        }


    }


);








Tools.register(

    server

);








return server;




}













async function start() {




const mcpServer =

    createServer();







const transport =

    new StdioServerTransport();








await mcpServer.connect(

    transport

);








console.log(

    "[MCP] server started"

);




}













module.exports = {

createServer,


start




};