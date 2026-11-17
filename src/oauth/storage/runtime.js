"use strict";

const { createNodeBBStorage } = require("./factory");

let storage = null;

function init(createStorage = createNodeBBStorage) {
    if (storage) {
        return storage;
    }

    if (typeof createStorage !== "function") {
        throw new TypeError("OAuth storage factory must be a function");
    }

    const instance = createStorage();

    if (!instance || typeof instance !== "object") {
        throw new TypeError("OAuth storage factory returned an invalid instance");
    }

    storage = instance;

    return storage;
}

function get() {
    if (!storage) {
        throw new Error("OAuth storage has not been initialized");
    }

    return storage;
}

function isInitialized() {
    return storage !== null;
}

module.exports = {
    init,
    get,
    isInitialized
};
