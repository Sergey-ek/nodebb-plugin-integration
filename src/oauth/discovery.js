"use strict";

function buildAuthorizationServerMetadata(issuer) {
    if (typeof issuer !== "string" || !issuer.trim()) {
        throw new TypeError("OAuth issuer must be a non-empty URL");
    }

    let url;

    try {
        url = new URL(issuer);
    } catch {
        throw new TypeError("Invalid OAuth issuer URL");
    }

    if (
        !["http:", "https:"].includes(url.protocol) ||
        !url.hostname ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
    ) {
        throw new TypeError("Invalid OAuth issuer URL");
    }

    const normalizedIssuer = url.toString().replace(/\/+$/, "");

    return Object.freeze({
        issuer: normalizedIssuer,
        authorization_endpoint: `${normalizedIssuer}/oauth/authorize`,
        token_endpoint: `${normalizedIssuer}/oauth/token`,
        revocation_endpoint: `${normalizedIssuer}/oauth/revoke`,
        response_types_supported: Object.freeze(["code"]),
        grant_types_supported: Object.freeze([
            "authorization_code",
            "refresh_token"
        ]),
        token_endpoint_auth_methods_supported: Object.freeze(["none"]),
        code_challenge_methods_supported: Object.freeze(["S256"]),
        client_id_metadata_document_supported: true
    });
}

module.exports = {
    buildAuthorizationServerMetadata
};
