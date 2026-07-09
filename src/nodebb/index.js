"use strict";

/*

NodeBB Integration Layer


NodeBB Adapter



*/




const Config =
require("../config");




let available = false;













function check() {




try {



    if(

        Config.nodebb.url &&

        Config.nodebb.url.length > 0

    ) {



        available = true;


    }



}


catch(error) {



    available = false;


}







return available;




}













function isAvailable() {

return available;




}













function info() {




return {


    available,


    url:

        Config.nodebb.url



};

}













async function request(

path,

options = {}

) {




if(!available) {


    throw new Error(

        "NodeBB API unavailable"

    );


}








const fetch =

    global.fetch ||

    require("node-fetch");







const headers = {



    "Content-Type":

        "application/json"



};








if(Config.nodebb.apiKey) {


    headers.Authorization =

        Config.nodebb.apiKey;


}








const response =

    await fetch(

        Config.nodebb.url + path,

        {


            method:

                options.method || "GET",



            headers,



            body:

                options.body

                    ? JSON.stringify(options.body)

                    : undefined


        }

    );








return response.json();




}













module.exports = {

check,


isAvailable,


info,


request




};