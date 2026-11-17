"use strict";

const assert = require("node:assert/strict");
const { describe, it } = require("mocha");

const {
    REQUIRED_METHODS,
    createStorage
} = require("../src/oauth/storage");

describe("OAuth storage contract", function () {
    function createAdapter(overrides = {}) {
        const adapter = {};

        for (const method of REQUIRED_METHODS) {
            adapter[method] = async (...args) => ({
                method,
                args
            });
        }

        return Object.assign(adapter, overrides);
    }

    it("declares all required storage methods", function () {
        assert.deepStrictEqual(REQUIRED_METHODS, [
            "createAuthorizationCode",
            "consumeAuthorizationCode",
            "createAccessToken",
            "getAccessToken",
            "revokeAccessToken",
            "createRefreshFamily",
            "getRefreshFamily",
            "rotateRefreshToken",
            "revokeRefreshFamily",
            "getUserAccess",
            "setUserAccess",
            "getClientGrant",
            "listClientGrants",
            "setClientGrant",
            "revokeClientGrant",
            "getConsentTransaction",
"createConsentTransaction",
            "approveConsentTransaction",
            "consumeConsentTransaction"
        ]);
    });

    it("accepts a complete adapter", function () {
        const storage = createStorage(createAdapter());

        assert.ok(storage);
        assert.ok(Object.isFrozen(storage));

        for (const method of REQUIRED_METHODS) {
            assert.equal(typeof storage[method], "function");
        }
    });

    it("rejects a missing adapter", function () {
        assert.throws(
            () => createStorage(null),
            /must be an object/
        );
    });

    it("rejects an adapter with missing methods", function () {
        const adapter = createAdapter();
        delete adapter.consumeAuthorizationCode;

        assert.throws(
            () => createStorage(adapter),
            /consumeAuthorizationCode/
        );
    });

    it("forwards arguments and return values to the adapter", async function () {
        const adapter = createAdapter();
        const storage = createStorage(adapter);

        const result = await storage.createAuthorizationCode(
            "code-hash",
            { uid: 1, clientId: "test-client" },
            300
        );

        assert.deepStrictEqual(result, {
            method: "createAuthorizationCode",
            args: [
                "code-hash",
                { uid: 1, clientId: "test-client" },
                300
            ]
        });
    });

    it("preserves the adapter as the method receiver", async function () {
        const adapter = createAdapter({
            getAccessToken() {
                return Promise.resolve(this === adapter);
            }
        });

        const storage = createStorage(adapter);

        assert.equal(await storage.getAccessToken("token-hash"), true);
    });
});
