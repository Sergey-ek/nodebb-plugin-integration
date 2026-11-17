"use strict";

const assert = require("node:assert/strict");
const { describe, it } = require("mocha");

const {
    createClientFingerprint
} = require("../src/oauth/client-fingerprint");

function createClient(overrides = {}) {
    return {
        clientId: "https://client.example.com/metadata.json",
        clientName: "Example MCP Client",
        redirectUris: [
            "http://127.0.0.1:3344/callback",
            "https://client.example.com/callback"
        ],
        grantTypes: ["authorization_code", "refresh_token"],
        responseTypes: ["code"],
        tokenEndpointAuthMethod: "none",
        ...overrides
    };
}

describe("OAuth client metadata fingerprint", function () {
    it("creates a SHA-256 fingerprint", function () {
        const fingerprint = createClientFingerprint(createClient());

        assert.match(fingerprint, /^[a-f0-9]{64}$/);
    });

    it("does not depend on array ordering", function () {
        const first = createClientFingerprint(createClient());

        const second = createClientFingerprint(createClient({
            redirectUris: [
                "https://client.example.com/callback",
                "http://127.0.0.1:3344/callback"
            ],
            grantTypes: ["refresh_token", "authorization_code"]
        }));

        assert.equal(first, second);
    });

    it("changes when the client name changes", function () {
        const first = createClientFingerprint(createClient());
        const second = createClientFingerprint(createClient({
            clientName: "Different Client"
        }));

        assert.notEqual(first, second);
    });

    it("changes when a redirect URI changes", function () {
        const first = createClientFingerprint(createClient());
        const second = createClientFingerprint(createClient({
            redirectUris: [
                "http://127.0.0.1:3344/new-callback"
            ]
        }));

        assert.notEqual(first, second);
    });

    it("changes when supported grant types change", function () {
        const first = createClientFingerprint(createClient());
        const second = createClientFingerprint(createClient({
            grantTypes: ["authorization_code"]
        }));

        assert.notEqual(first, second);
    });

    it("rejects incomplete metadata", function () {
        assert.throws(
            () => createClientFingerprint({
                clientId: "https://client.example.com/metadata.json"
            }),
            /Invalid OAuth client metadata/
        );
    });
});
