/*

NodeBB Integration Layer


NodeBB Users Adapter



*/




const NodeBB =
require("./index");













let nativeUsers = null;













function loadNative() {




if(nativeUsers) {


    return nativeUsers;


}








try {



    if(

        require.main &&

        require.main.require

    ) {



        nativeUsers =

            require.main.require(

                "./src/user"

            );


    }



}


catch(error) {


    nativeUsers = null;


}







return nativeUsers;




}













async function getUser(uid) {




const users =

    loadNative();








/*
 * Native NodeBB mode
 */


if(

    users &&

    typeof users.getUserFields === "function"

) {



    return await users.getUserFields(

        uid,

        [

            "uid",

            "username",

            "userslug",

            "email",

            "picture"

        ]

    );


}








/*
 * Standalone mode
 */


return {


    uid,


    username:

        "NodeBB unavailable",



    userslug:

        null,



    email:

        null,



    picture:

        null



};




}













async function getUsers(uids = []) {




const result = [];








for(const uid of uids) {



    result.push(

        await getUser(uid)

    );


}







return result;




}













function info() {




return {


    nodebb:

        NodeBB.info(),



    adapter:

        "users"



};




}













module.exports = {

getUser,


getUsers,


info




};