"use strict";

const crypto = require("node:crypto");

function normalizeArray(value, name) {
    if (
        !Array.isArray(value) ||
        value.some(item => typeof item !== "string" || !item)
    ) {
        throw new TypeError(`Invalid OAuth client ${name}`);
    }

    return [...new Set(value)].sort();
}

function createClientFingerprint(client) {
    if (
        !client ||
        typeof client !== "object" ||
        typeof client.clientId !== "string" ||
        !client.clientId ||
        typeof client.clientName !== "string" ||
        !client.clientName ||
        typeof client.tokenEndpointAuthMethod !== "string"
    ) {
        throw new TypeError("Invalid OAuth client metadata");
    }

    const canonical = {
        clientId: client.clientId,
        clientName: client.clientName,
        redirectUris: normalizeArray(client.redirectUris, "redirectUris"),
        grantTypes: normalizeArray(client.grantTypes, "grantTypes"),
        responseTypes: normalizeArray(client.responseTypes, "responseTypes"),
        tokenEndpointAuthMethod: client.tokenEndpointAuthMethod
    };

    return crypto
        .createHash("sha256")
        .update(JSON.stringify(canonical), "utf8")
        .digest("hex");
}

module.exports = {
    createClientFingerprint
};
