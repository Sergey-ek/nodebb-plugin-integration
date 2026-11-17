"use strict";

const assert = require("node:assert/strict");
const { describe, it } = require("mocha");

const {
    createStorageFromDatabase
} = require("../src/oauth/storage/factory");

describe("OAuth storage factory", function () {
    it("rejects a missing database adapter", function () {
        assert.throws(
            () => createStorageFromDatabase(null),
            /database adapter is unavailable/
        );
    });

    it("rejects an uninitialized database client", function () {
        assert.throws(
            () => createStorageFromDatabase({}),
            /not initialized/
        );
    });

    it("selects Redis when sendCommand is available", function () {
        const calls = [];

        const database = {
            client: {
                async sendCommand(args) {
                    calls.push(args);
                    return "OK";
                }
            }
        };

        const storage = createStorageFromDatabase(database);

        assert.equal(typeof storage.createAuthorizationCode, "function");
        assert.equal(typeof storage.rotateRefreshToken, "function");
    });

    it("defers MongoDB support", function () {
        assert.throws(
            () => createStorageFromDatabase({
                client: {
                    collection() {}
                }
            }),
            /MongoDB storage is not implemented/
        );
    });

    it("defers PostgreSQL support", function () {
        assert.throws(
            () => createStorageFromDatabase({
                client: {},
                pool: {}
            }),
            /PostgreSQL storage is not implemented/
        );
    });
});
