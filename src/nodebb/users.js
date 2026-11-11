"use strict";

const NodeBB = require("./index");

const FIELDS = [
    "uid",
    "username",
    "userslug",
    "picture"
];

async function getUser(uid) {
    uid = Number(uid);

    if (!Number.isSafeInteger(uid) || uid <= 0) {
        throw new TypeError("Invalid user ID");
    }

    const users = NodeBB.get("users");

    if (typeof users.getUserFields !== "function") {
        throw new Error("NodeBB users.getUserFields is unavailable");
    }

    return users.getUserFields(uid, FIELDS);
}

async function getUsers(uids = []) {
    if (!Array.isArray(uids)) {
        throw new TypeError("User IDs must be an array");
    }

    const unique = [...new Set(
        uids.map(Number).filter(
            uid => Number.isSafeInteger(uid) && uid > 0
        )
    )];

    if (!unique.length) return [];

    const users = NodeBB.get("users");

    if (typeof users.getUsersFields === "function") {
        return users.getUsersFields(unique, FIELDS);
    }

    const result = [];

    for (const uid of unique) {
        const user = await getUser(uid);
        if (user) result.push(user);
    }

    return result;
}

async function getPostIds(uid, start, stop) {
    uid = Number(uid);

    if (!Number.isSafeInteger(uid) || uid <= 0) {
        throw new TypeError("Invalid user ID");
    }

    const users = NodeBB.get("users");

    if (typeof users.getPostIds !== "function") {
        throw new Error("NodeBB users.getPostIds is unavailable");
    }

    return users.getPostIds(uid, start, stop);
}

module.exports = {
    getUser,
    getUsers,
    getPostIds,
    FIELDS
};
