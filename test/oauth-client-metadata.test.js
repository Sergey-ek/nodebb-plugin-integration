"use strict";

const assert = require("node:assert/strict");
const { describe, it } = require("mocha");
const ClientMetadata = require("../src/oauth/client-metadata");

const CLIENT_ID = "https://example.com/oauth/client.json";

function metadata(overrides = {}) {
    return {
        client_id: CLIENT_ID,
        client_name: "Example MCP Client",
        redirect_uris: [
            "http://127.0.0.1:3000/callback",
            "https://example.com/callback"
        ],
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
        ...overrides
    };
}

describe("OAuth client metadata", function () {
    it("accepts a valid HTTPS client ID", function () {
        assert.equal(
            ClientMetadata.validateClientId(CLIENT_ID),
            CLIENT_ID
        );
    });

    it("rejects invalid client ID URLs", function () {
        for (const value of [
            "",
            "http://example.com/client.json",
            "https://example.com/",
            "https://user:pass@example.com/client.json",
            "https://example.com/client.json?x=1",
            "https://example.com/client.json#fragment",
            "not-a-url"
        ]) {
            assert.throws(
                () => ClientMetadata.validateClientId(value)
            );
        }
    });

    it("accepts HTTPS redirect URIs", function () {
        assert.equal(
            ClientMetadata.validateRedirectUri(
                "https://example.com/callback"
            ),
            "https://example.com/callback"
        );
    });

    it("accepts HTTP loopback redirect URIs", function () {
        for (const uri of [
            "http://localhost:3000/callback",
            "http://127.0.0.1:3000/callback",
            "http://[::1]:3000/callback"
        ]) {
            assert.equal(
                ClientMetadata.validateRedirectUri(uri),
                uri
            );
        }
    });

    it("rejects unsafe redirect URI schemes and hosts", function () {
        for (const uri of [
            "http://example.com/callback",
            "http://localhost.evil.com/callback",
            "javascript:alert(1)",
            "file:///etc/passwd",
            "https://user:pass@example.com/callback",
            "https://example.com/callback#fragment"
        ]) {
            assert.throws(
                () => ClientMetadata.validateRedirectUri(uri)
            );
        }
    });

    it("validates complete client metadata", function () {
        const result = ClientMetadata.validateClientMetadata(
            CLIENT_ID,
            metadata()
        );

        assert.equal(result.clientId, CLIENT_ID);
        assert.equal(result.clientName, "Example MCP Client");
        assert.equal(result.redirectUris.length, 2);
        assert.deepStrictEqual(
            result.grantTypes,
            ["authorization_code", "refresh_token"]
        );
        assert.deepStrictEqual(result.responseTypes, ["code"]);
        assert.equal(result.tokenEndpointAuthMethod, "none");
        assert.equal(Object.isFrozen(result), true);
        assert.equal(Object.isFrozen(result.redirectUris), true);
    });

    it("requires exact client ID match", function () {
        assert.throws(
            () => ClientMetadata.validateClientMetadata(
                CLIENT_ID,
                metadata({ client_id: "https://other.example/client.json" })
            ),
            /does not match/
        );
    });

    it("rejects missing or invalid client names", function () {
        for (const name of ["", "   ", 123, "x".repeat(129)]) {
            assert.throws(
                () => ClientMetadata.validateClientMetadata(
                    CLIENT_ID,
                    metadata({ client_name: name })
                )
            );
        }
    });

    it("rejects public clients with client secrets", function () {
        assert.throws(
            () => ClientMetadata.validateClientMetadata(
                CLIENT_ID,
                metadata({ client_secret: "secret" })
            ),
            /must not have client_secret/
        );
    });

    it("requires public client authentication method none", function () {
        assert.throws(
            () => ClientMetadata.validateClientMetadata(
                CLIENT_ID,
                metadata({ token_endpoint_auth_method: "client_secret_basic" })
            ),
            /token_endpoint_auth_method none/
        );
    });

    it("rejects duplicate and excessive redirect URIs", function () {
        assert.throws(
            () => ClientMetadata.validateClientMetadata(
                CLIENT_ID,
                metadata({
                    redirect_uris: [
                        "https://example.com/callback",
                        "https://example.com/callback"
                    ]
                })
            ),
            /Duplicate/
        );

        assert.throws(
            () => ClientMetadata.validateClientMetadata(
                CLIENT_ID,
                metadata({
                    redirect_uris: Array.from(
                        { length: 21 },
                        (_, i) => `https://example.com/callback/${i}`
                    )
                })
            ),
            /Too many/
        );
    });

    it("rejects unsupported grant and response types", function () {
        assert.throws(
            () => ClientMetadata.validateClientMetadata(
                CLIENT_ID,
                metadata({ grant_types: ["client_credentials"] })
            ),
            /grant_types/
        );

        assert.throws(
            () => ClientMetadata.validateClientMetadata(
                CLIENT_ID,
                metadata({ response_types: ["token"] })
            ),
            /response_type/
        );
    });

    it("checks redirect URIs using exact string matching", function () {
        const client = ClientMetadata.validateClientMetadata(
            CLIENT_ID,
            metadata()
        );

        assert.equal(
            ClientMetadata.isRedirectUriAllowed(
                client,
                "http://127.0.0.1:3000/callback"
            ),
            true
        );

        assert.equal(
            ClientMetadata.isRedirectUriAllowed(
                client,
                "http://127.0.0.1:3000/other"
            ),
            false
        );

        assert.equal(
            ClientMetadata.isRedirectUriAllowed(
                client,
                "http://127.0.0.1:3000/callback/"
            ),
            false
        );
    });

    it("allows dynamic ports for IPv4 and IPv6 loopback IP literals", function () {
        const client = ClientMetadata.validateClientMetadata(
            CLIENT_ID,
            metadata({
                redirect_uris: [
                    "http://127.0.0.1:3000/callback",
                    "http://[::1]:3000/callback"
                ]
            })
        );

        assert.equal(
            ClientMetadata.isRedirectUriAllowed(
                client,
                "http://127.0.0.1:49152/callback"
            ),
            true
        );

        assert.equal(
            ClientMetadata.isRedirectUriAllowed(
                client,
                "http://[::1]:54321/callback"
            ),
            true
        );
    });

    it("keeps loopback redirect URI path and query matching strict", function () {
        const client = ClientMetadata.validateClientMetadata(
            CLIENT_ID,
            metadata({
                redirect_uris: [
                    "http://127.0.0.1:3000/callback?state=expected"
                ]
            })
        );

        for (const uri of [
            "http://127.0.0.1:49152/other?state=expected",
            "http://127.0.0.1:49152/callback?state=wrong",
            "http://127.0.0.2:49152/callback?state=expected",
            "https://127.0.0.1:49152/callback?state=expected"
        ]) {
            assert.equal(
                ClientMetadata.isRedirectUriAllowed(client, uri),
                false,
                uri
            );
        }
    });

    it("does not allow dynamic ports for localhost or HTTPS redirects", function () {
        const client = ClientMetadata.validateClientMetadata(
            CLIENT_ID,
            metadata({
                redirect_uris: [
                    "http://localhost:3000/callback",
                    "https://example.com/callback"
                ]
            })
        );

        assert.equal(
            ClientMetadata.isRedirectUriAllowed(
                client,
                "http://localhost:49152/callback"
            ),
            false
        );

        assert.equal(
            ClientMetadata.isRedirectUriAllowed(
                client,
                "https://example.com:49152/callback"
            ),
            false
        );
    });
});
