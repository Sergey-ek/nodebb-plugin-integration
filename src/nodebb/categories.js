"use strict";

const NodeBB = require("./index");

async function getAll() {
    const categories = NodeBB.get("categories");

    if (typeof categories.getAllCategories !== "function") {
        throw new Error("NodeBB categories.getAllCategories is unavailable");
    }

    const result = await categories.getAllCategories();

    return (result || [])
        .filter(category => category && Number.isSafeInteger(Number(category.cid)))
        .map(category => ({
            cid: Number(category.cid),
            name: category.name || "",
            parentCid: Number(category.parentCid || 0),
            disabled: Boolean(category.disabled)
        }));
}

async function getById(cid) {
    cid = Number(cid);

    if (!Number.isSafeInteger(cid) || cid < 0) {
        throw new TypeError("Invalid category ID");
    }

    const categories = await getAll();

    return categories.find(category => category.cid === cid) || null;
}

module.exports = {
    getAll,
    getById
};
