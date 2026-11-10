"use strict";

const MODULES = Object.freeze({
    meta: "./src/meta",
    posts: "./src/posts",
    topics: "./src/topics",
    users: "./src/user",
    categories: "./src/categories",
    privileges: "./src/privileges",
    plugins: "./src/plugins"
});

let modules = null;
let loadError = null;

function initialize() {
    if (modules) {
        return modules;
    }

    if (typeof nodebb === "undefined" || !nodebb ||
        typeof nodebb.require !== "function") {
        throw new Error("NodeBB runtime is not available");
    }

    const loaded = {};

    try {
        for (const [name, path] of Object.entries(MODULES)) {
            loaded[name] = nodebb.require(path);
        }

        modules = Object.freeze(loaded);

        return modules;
    } catch (error) {
        throw new Error(
            `NodeBB modules initialization failed: ${error.message}`,
            { cause: error }
        );
    }
}

function get(name) {
    if (!Object.prototype.hasOwnProperty.call(MODULES, name)) {
        throw new Error(`Unknown NodeBB module: ${name}`);
    }

    return initialize()[name];
}

function isAvailable() {
    try {
        initialize();
        return true;
    } catch {
        return false;
    }
}

function info() {
    return {
        available: isAvailable(),
        modules: modules ? Object.keys(modules) : []
    };
}

module.exports = {
    get,
    initialize,
    isAvailable,
    info
};