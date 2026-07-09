"use strict";

/*

NodeBB Integration Layer


Routes loader



*/




const API =
require("./api");













function init(router) {




if(!router) {


    console.log(

        "[Routes] router unavailable"

    );


    return false;


}








API.init(

    router

);








console.log(

    "[Routes] initialized"

);







return true;




}













module.exports = {

init




};