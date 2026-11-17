"use strict";

const assert = require("assert");
const Runtime = require("../src/oauth/storage/runtime");

describe("OAuth storage runtime", function () {
    it("reports that storage is not initialized initially", function () {
        assert.strictEqual(Runtime.isInitialized(), false);
    });

    it("rejects access before initialization", function () {
        assert.throws(
            () => Runtime.get(),
            /has not been initialized/
        );
    });

    it("initializes storage once and returns the same instance", function () {
        const storage = {
            createAuthorizationCode() {},
            consumeAuthorizationCode() {},
            createAccessToken() {},
            getAccessToken() {},
            revokeAccessToken() {},
            createRefreshFamily() {},
            rotateRefreshToken() {},
            revokeRefreshFamily() {}
        };

        let factoryCalls = 0;

        const factory = () => {
            factoryCalls += 1;
            return storage;
        };

        const first = Runtime.init(factory);
        const second = Runtime.init(() => {
            throw new Error("Factory must not be called twice");
        });

        assert.strictEqual(first, storage);
        assert.strictEqual(second, storage);
        assert.strictEqual(Runtime.get(), storage);
        assert.strictEqual(Runtime.isInitialized(), true);
        assert.strictEqual(factoryCalls, 1);
    });
});
