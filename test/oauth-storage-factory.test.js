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

    it("selects MongoDB and exposes the complete storage contract", function () {
        const collections = new Map();

        const database = {
            collection(name) {
                if (!collections.has(name)) {
                    collections.set(name, {
                        async createIndex() {
                            return name;
                        }
                    });
                }

                return collections.get(name);
            }
        };

        const storage = createStorageFromDatabase({ client: database });

        assert.equal(typeof storage.createAuthorizationCode, "function");
        assert.equal(typeof storage.consumeAuthorizationCode, "function");
        assert.equal(typeof storage.createAccessToken, "function");
        assert.equal(typeof storage.getAccessToken, "function");
        assert.equal(typeof storage.revokeAccessToken, "function");
        assert.equal(typeof storage.createRefreshFamily, "function");
        assert.equal(typeof storage.getRefreshFamily, "function");
        assert.equal(typeof storage.rotateRefreshToken, "function");
        assert.equal(typeof storage.revokeRefreshFamily, "function");
        assert.equal(typeof storage.getUserAccess, "function");
        assert.equal(typeof storage.setUserAccess, "function");
        assert.equal(typeof storage.getClientGrant, "function");
        assert.equal(typeof storage.listClientGrants, "function");
        assert.equal(typeof storage.setClientGrant, "function");
        assert.equal(typeof storage.revokeClientGrant, "function");
        assert.equal(typeof storage.getConsentTransaction, "function");
        assert.equal(typeof storage.createConsentTransaction, "function");
        assert.equal(typeof storage.approveConsentTransaction, "function");
        assert.equal(typeof storage.consumeConsentTransaction, "function");
        assert.equal(Object.isFrozen(storage), true);
    });

    it("selects PostgreSQL and exposes the complete storage contract", function () {
        const pool = {
            async query() {
                return { rows: [], rowCount: 0 };
            },
            async connect() {
                return {
                    async query() {
                        return { rows: [], rowCount: 0 };
                    },
                    release() {}
                };
            }
        };

        const storage = createStorageFromDatabase({
            client: pool,
            pool
        });

        assert.equal(typeof storage.createAuthorizationCode, "function");
        assert.equal(typeof storage.consumeAuthorizationCode, "function");
        assert.equal(typeof storage.createAccessToken, "function");
        assert.equal(typeof storage.getAccessToken, "function");
        assert.equal(typeof storage.revokeAccessToken, "function");
        assert.equal(typeof storage.createRefreshFamily, "function");
        assert.equal(typeof storage.getRefreshFamily, "function");
        assert.equal(typeof storage.rotateRefreshToken, "function");
        assert.equal(typeof storage.revokeRefreshFamily, "function");
        assert.equal(typeof storage.getUserAccess, "function");
        assert.equal(typeof storage.setUserAccess, "function");
        assert.equal(typeof storage.getClientGrant, "function");
        assert.equal(typeof storage.listClientGrants, "function");
        assert.equal(typeof storage.setClientGrant, "function");
        assert.equal(typeof storage.revokeClientGrant, "function");
        assert.equal(typeof storage.getConsentTransaction, "function");
        assert.equal(typeof storage.createConsentTransaction, "function");
        assert.equal(typeof storage.approveConsentTransaction, "function");
        assert.equal(typeof storage.consumeConsentTransaction, "function");
        assert.equal(Object.isFrozen(storage), true);
    });
});
