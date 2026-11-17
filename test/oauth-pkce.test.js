"use strict";

const assert = require("node:assert/strict");
const { describe, it } = require("mocha");

const PKCE = require("../src/oauth/pkce");

describe("OAuth PKCE", function () {
    it("generates a valid verifier", function () {
        const verifier = PKCE.generateVerifier();

        assert.equal(typeof verifier, "string");
        assert.equal(verifier.length, 43);
        assert.equal(PKCE.validateVerifier(verifier), true);
    });

    it("generates unique verifiers", function () {
        const first = PKCE.generateVerifier();
        const second = PKCE.generateVerifier();

        assert.notEqual(first, second);
    });

    it("creates an S256 challenge", function () {
        const verifier = "a".repeat(43);
        const challenge = PKCE.createChallenge(verifier);

        assert.match(challenge, /^[A-Za-z0-9_-]{43}$/);
    });

    it("verifies a correct S256 challenge", function () {
        const verifier = PKCE.generateVerifier();
        const challenge = PKCE.createChallenge(verifier);

        assert.equal(
            PKCE.verifyChallenge(verifier, challenge, "S256"),
            true
        );
    });

    it("rejects an incorrect challenge", function () {
        const verifier = PKCE.generateVerifier();
        const challenge = PKCE.createChallenge(verifier);
        const wrongChallenge = "A".repeat(43);

        assert.equal(
            PKCE.verifyChallenge(verifier, wrongChallenge),
            false
        );

        assert.equal(
            PKCE.verifyChallenge(verifier, challenge.slice(0, 42) + (challenge.endsWith("A") ? "B" : "A")),
            false
        );
    });

    it("rejects the plain method", function () {
        const verifier = PKCE.generateVerifier();

        assert.equal(
            PKCE.verifyChallenge(verifier, verifier, "plain"),
            false
        );
    });

    it("rejects invalid verifiers", function () {
        assert.equal(PKCE.validateVerifier("short"), false);
        assert.equal(PKCE.validateVerifier("a".repeat(129)), false);
        assert.equal(PKCE.validateVerifier("a".repeat(42) + "!"), false);

        assert.throws(
            () => PKCE.createChallenge("invalid"),
            /Invalid PKCE code_verifier/
        );
    });

    it("rejects malformed challenges", function () {
        const verifier = PKCE.generateVerifier();

        assert.equal(PKCE.verifyChallenge(verifier, ""), false);
        assert.equal(PKCE.verifyChallenge(verifier, "x".repeat(42)), false);
        assert.equal(PKCE.verifyChallenge(verifier, "x".repeat(44)), false);
        assert.equal(PKCE.verifyChallenge(verifier, "x".repeat(42) + "!"), false);
    });
});
