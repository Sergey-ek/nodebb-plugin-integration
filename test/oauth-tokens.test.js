"use strict";

const assert = require("node:assert/strict");
const { describe, it } = require("mocha");
const Tokens = require("../src/oauth/tokens");

describe("OAuth token utilities", function () {
    it("defines the expected token lifetimes", function () {
        assert.deepStrictEqual(Tokens.TTL, {
            authorizationCode: 300,
            accessToken: 900,
            refreshToken: 2592000
        });

        assert.equal(Object.isFrozen(Tokens.TTL), true);
    });

    it("generates cryptographically random opaque tokens", function () {
        const first = Tokens.generateToken();
        const second = Tokens.generateToken();

        assert.equal(typeof first, "string");
        assert.match(first, /^[A-Za-z0-9_-]{43}$/);
        assert.notEqual(first, second);
    });

    it("hashes tokens using SHA-256", function () {
        const hash = Tokens.hashToken("test-token");

        assert.equal(hash.length, 64);
        assert.match(hash, /^[a-f0-9]{64}$/);
        assert.equal(
            hash,
            "4c5dc9b7708905f77f5e5d16316b5dfb425e68cb326dcd55a860e90a7707031e"
        );
    });

    it("generates unique refresh family IDs", function () {
        const first = Tokens.generateFamilyId();
        const second = Tokens.generateFamilyId();

        assert.match(first, /^[a-f0-9]{32}$/);
        assert.notEqual(first, second);
    });

    it("rejects invalid token values", function () {
        assert.throws(() => Tokens.hashToken(""), /non-empty string/);
        assert.throws(() => Tokens.hashToken(null), /non-empty string/);
        assert.throws(() => Tokens.hashToken(123), /non-empty string/);
    });
});
