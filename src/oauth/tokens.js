"use strict";

const crypto = require("node:crypto");

const TTL = Object.freeze({
    authorizationCode: 5 * 60,
    accessToken: 15 * 60,
    refreshToken: 30 * 24 * 60 * 60
});

function generateToken() {
    return crypto.randomBytes(32).toString("base64url");
}

function hashToken(token) {
    if (typeof token !== "string" || !token) {
        throw new TypeError("Token must be a non-empty string");
    }

    return crypto
        .createHash("sha256")
        .update(token, "utf8")
        .digest("hex");
}

function generateFamilyId() {
    return crypto.randomBytes(16).toString("hex");
}

module.exports = {
    TTL,
    generateToken,
    hashToken,
    generateFamilyId
};
