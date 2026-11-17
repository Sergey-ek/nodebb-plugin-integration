"use strict";

const MAX_CLIENT_ID_LENGTH = 2048;
const MAX_REDIRECT_URI_LENGTH = 2048;
const MAX_REDIRECT_URIS = 20;

function validateClientId(clientId) {
    if (typeof clientId !== "string" ||
        !clientId ||
        clientId.length > MAX_CLIENT_ID_LENGTH ||
        clientId !== clientId.trim()) {
        throw new TypeError("Invalid OAuth client_id");
    }

    let url;

    try {
        url = new URL(clientId);
    } catch {
        throw new TypeError("OAuth client_id must be a valid HTTPS URL");
    }

    if (
        url.protocol !== "https:" ||
        !url.hostname ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        !url.pathname ||
        url.pathname === "/" ||
        url.pathname.split("/").some(part => part === "." || part === "..")
    ) {
        throw new TypeError("OAuth client_id must be a valid CIMD URL");
    }

    return clientId;
}

function validateRedirectUri(uri) {
    if (
        typeof uri !== "string" ||
        !uri ||
        uri.length > MAX_REDIRECT_URI_LENGTH ||
        uri !== uri.trim()
    ) {
        throw new TypeError("Invalid OAuth redirect_uri");
    }

    let url;

    try {
        url = new URL(uri);
    } catch {
        throw new TypeError("OAuth redirect_uri must be an absolute URL");
    }

    if (
        url.username ||
        url.password ||
        url.hash ||
        !url.hostname
    ) {
        throw new TypeError("Invalid OAuth redirect_uri");
    }

    if (url.protocol === "https:") {
        return uri;
    }

    const loopbackHosts = new Set([
        "localhost",
        "127.0.0.1",
        "[::1]"
    ]);

    if (url.protocol === "http:" && loopbackHosts.has(url.hostname)) {
        return uri;
    }

    throw new TypeError(
        "OAuth redirect_uri must use HTTPS or HTTP loopback"
    );
}

function validateStringArray(value, name, defaults) {
    if (value === undefined) {
        return defaults;
    }

    if (
        !Array.isArray(value) ||
        value.length === 0 ||
        value.some(item => typeof item !== "string" || !item)
    ) {
        throw new TypeError(`Invalid OAuth ${name}`);
    }

    return value;
}

function validateClientMetadata(requestedClientId, metadata) {
    validateClientId(requestedClientId);

    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
        throw new TypeError("OAuth client metadata must be an object");
    }

    if (metadata.client_id !== requestedClientId) {
        throw new TypeError("OAuth client_id does not match metadata URL");
    }

    if (
        typeof metadata.client_name !== "string" ||
        !metadata.client_name.trim() ||
        metadata.client_name.length > 128
    ) {
        throw new TypeError("Invalid OAuth client_name");
    }

    if (Object.prototype.hasOwnProperty.call(metadata, "client_secret")) {
        throw new TypeError("Public OAuth clients must not have client_secret");
    }

    if (metadata.token_endpoint_auth_method !== "none") {
        throw new TypeError(
            "Only public OAuth clients using token_endpoint_auth_method none are supported"
        );
    }

    const redirectUris = validateStringArray(
        metadata.redirect_uris,
        "redirect_uris"
    );

    if (redirectUris.length > MAX_REDIRECT_URIS) {
        throw new TypeError("Too many OAuth redirect_uris");
    }

    const validatedRedirectUris = redirectUris.map(validateRedirectUri);

    if (new Set(validatedRedirectUris).size !== validatedRedirectUris.length) {
        throw new TypeError("Duplicate OAuth redirect_uri");
    }

    const grantTypes = validateStringArray(
        metadata.grant_types,
        "grant_types",
        ["authorization_code"]
    );

    if (
        !grantTypes.includes("authorization_code") ||
        grantTypes.some(type =>
            !["authorization_code", "refresh_token"].includes(type)
        )
    ) {
        throw new TypeError("Unsupported OAuth grant_types");
    }

    const responseTypes = validateStringArray(
        metadata.response_types,
        "response_types",
        ["code"]
    );

    if (
        responseTypes.length !== 1 ||
        responseTypes[0] !== "code"
    ) {
        throw new TypeError("Only OAuth response_type code is supported");
    }

    return Object.freeze({
        clientId: requestedClientId,
        clientName: metadata.client_name.trim(),
        redirectUris: Object.freeze(validatedRedirectUris),
        grantTypes: Object.freeze([...new Set(grantTypes)]),
        responseTypes: Object.freeze(["code"]),
        tokenEndpointAuthMethod: "none"
    });
}

function isRedirectUriAllowed(client, redirectUri) {
    if (
        !client ||
        !Array.isArray(client.redirectUris) ||
        typeof redirectUri !== "string"
    ) {
        return false;
    }

    if (client.redirectUris.includes(redirectUri)) {
        return true;
    }

    let requested;

    try {
        validateRedirectUri(redirectUri);
        requested = new URL(redirectUri);
    } catch {
        return false;
    }

    // RFC 8252: native apps may use a dynamically assigned port
    // for IPv4 and IPv6 loopback IP-literal redirect URIs.
    for (const registeredUri of client.redirectUris) {
        let registered;

        try {
            registered = new URL(registeredUri);
        } catch {
            continue;
        }

        const isLoopbackIp =
            registered.protocol === "http:" &&
            (registered.hostname === "127.0.0.1" ||
                registered.hostname === "[::1]");

        if (
            isLoopbackIp &&
            requested.protocol === registered.protocol &&
            requested.hostname === registered.hostname &&
            requested.pathname === registered.pathname &&
            requested.search === registered.search
        ) {
            return true;
        }
    }

    return false;
}

module.exports = {
    validateClientId,
    validateRedirectUri,
    validateClientMetadata,
    isRedirectUriAllowed
};
