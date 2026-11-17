"use strict";

const NodeBB = require("../../nodebb");
const { createStorage } = require("./index");
const { createRedisAdapter } = require("./redis");
const { createRedisGrantAdapter } = require("./grants");
const { createMongoAdapter } = require("./mongo");
const { createPostgresAdapter } = require("./postgres");

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

    // NodeBB MongoDB adapter exposes the native Db object.
    if (typeof database.client.collection === "function") {
        return createStorage(createMongoAdapter(database.client));
    }

    // NodeBB PostgreSQL adapter exposes its initialized pg.Pool.
    if (database.pool) {
        return createStorage(createPostgresAdapter(database.pool));
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
