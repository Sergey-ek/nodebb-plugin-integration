"use strict";

const crypto = require("node:crypto");

const VERIFIER_PATTERN = /^[A-Za-z0-9\-._~]{43,128}$/;
const CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function generateVerifier() {
    return crypto.randomBytes(32).toString("base64url");
}

function validateVerifier(verifier) {
    return typeof verifier === "string" &&
        VERIFIER_PATTERN.test(verifier);
}

function createChallenge(verifier) {
    if (!validateVerifier(verifier)) {
        throw new TypeError("Invalid PKCE code_verifier");
    }

    return crypto
        .createHash("sha256")
        .update(verifier, "ascii")
        .digest("base64url");
}

function verifyChallenge(verifier, challenge, method = "S256") {
    if (method !== "S256") {
        return false;
    }

    if (
        !validateVerifier(verifier) ||
        typeof challenge !== "string" ||
        !CHALLENGE_PATTERN.test(challenge)
    ) {
        return false;
    }

    const expected = Buffer.from(createChallenge(verifier), "ascii");
    const actual = Buffer.from(challenge, "ascii");

    return crypto.timingSafeEqual(expected, actual);
}

module.exports = {
    generateVerifier,
    validateVerifier,
    createChallenge,
    verifyChallenge
};
