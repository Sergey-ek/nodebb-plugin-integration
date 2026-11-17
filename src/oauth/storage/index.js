"use strict";

const REQUIRED_METHODS = Object.freeze([
    "createAuthorizationCode",
    "consumeAuthorizationCode",
    "createAccessToken",
    "getAccessToken",
    "revokeAccessToken",
    "createRefreshFamily",
    "getRefreshFamily",
    "rotateRefreshToken",
    "revokeRefreshFamily"
]);

function createStorage(adapter) {
    if (!adapter || typeof adapter !== "object") {
        throw new TypeError("OAuth storage adapter must be an object");
    }

    const missing = REQUIRED_METHODS.filter(
        method => typeof adapter[method] !== "function"
    );

    if (missing.length) {
        throw new TypeError(
            `OAuth storage adapter is missing methods: ${missing.join(", ")}`
        );
    }

    const storage = {};

    for (const method of REQUIRED_METHODS) {
        storage[method] = (...args) => adapter[method](...args);
    }

    return Object.freeze(storage);
}

module.exports = {
    REQUIRED_METHODS,
    createStorage
};
