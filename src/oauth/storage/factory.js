"use strict";

const NodeBB = require("../../nodebb");
const { createStorage } = require("./index");
const { createRedisAdapter } = require("./redis");
const { createRedisGrantAdapter } = require("./grants");

function createStorageFromDatabase(database) {
    if (!database || typeof database !== "object") {
        throw new TypeError("NodeBB database adapter is unavailable");
    }

    if (!database.client) {
        throw new Error("NodeBB database client is not initialized");
    }

    // NodeBB Redis adapter exposes the native Redis v4 client.
    if (typeof database.client.sendCommand === "function") {
        const oauthAdapter = createRedisAdapter(database.client);
        const grantAdapter = createRedisGrantAdapter(database.client);

        return createStorage({
            ...oauthAdapter,
            ...grantAdapter
        });
    }

    if (typeof database.client.collection === "function") {
        throw new Error(
            "OAuth MongoDB storage is not implemented yet. See src/oauth/storage/TODO.md"
        );
    }

    if (database.pool) {
        throw new Error(
            "OAuth PostgreSQL storage is not implemented yet. See src/oauth/storage/TODO.md"
        );
    }

    throw new Error("Unsupported NodeBB database adapter for OAuth storage");
}

function createNodeBBStorage() {
    return createStorageFromDatabase(NodeBB.get("database"));
}

module.exports = {
    createStorageFromDatabase,
    createNodeBBStorage
};
