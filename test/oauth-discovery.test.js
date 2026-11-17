"use strict";

const assert = require("node:assert/strict");
const { describe, it } = require("mocha");
const Discovery = require("../src/oauth/discovery");

describe("OAuth authorization server discovery", function () {
    it("builds metadata for an HTTPS issuer", function () {
        const result = Discovery.buildAuthorizationServerMetadata(
            "https://forum.example.com"
        );

        assert.equal(result.issuer, "https://forum.example.com");
        assert.equal(
            result.authorization_endpoint,
            "https://forum.example.com/oauth/authorize"
        );
        assert.equal(
            result.token_endpoint,
            "https://forum.example.com/oauth/token"
        );
        assert.equal(
            result.revocation_endpoint,
            "https://forum.example.com/oauth/revoke"
        );
        assert.deepStrictEqual(result.response_types_supported, ["code"]);
        assert.deepStrictEqual(
            result.grant_types_supported,
            ["authorization_code", "refresh_token"]
        );
        assert.deepStrictEqual(
            result.token_endpoint_auth_methods_supported,
            ["none"]
        );
        assert.deepStrictEqual(
            result.code_challenge_methods_supported,
            ["S256"]
        );
        assert.equal(result.client_id_metadata_document_supported, true);
    });

    it("normalizes trailing slashes", function () {
        const result = Discovery.buildAuthorizationServerMetadata(
            "https://forum.example.com///"
        );

        assert.equal(result.issuer, "https://forum.example.com");
        assert.equal(
            result.authorization_endpoint,
            "https://forum.example.com/oauth/authorize"
        );
    });

    it("accepts an HTTP issuer for local testing", function () {
        const result = Discovery.buildAuthorizationServerMetadata(
            "http://localhost:4567"
        );

        assert.equal(result.issuer, "http://localhost:4567");
    });

    it("rejects invalid issuers", function () {
        for (const issuer of [
            "",
            "not-a-url",
            "ftp://forum.example.com",
            "https://user:pass@forum.example.com",
            "https://forum.example.com?x=1",
            "https://forum.example.com#fragment"
        ]) {
            assert.throws(
                () => Discovery.buildAuthorizationServerMetadata(issuer)
            );
        }
    });

    it("returns immutable metadata", function () {
        const result = Discovery.buildAuthorizationServerMetadata(
            "https://forum.example.com"
        );

        assert.equal(Object.isFrozen(result), true);
        assert.equal(Object.isFrozen(result.grant_types_supported), true);
    });
});
