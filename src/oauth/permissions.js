"use strict";

const { createClientFingerprint } = require("./client-fingerprint");

function assertVersion(value, name) {
    if (!Number.isSafeInteger(value) || value < 1) {
        throw new TypeError(`Invalid OAuth ${name}`);
    }

    return value;
}

async function getCurrentPermissionSnapshot(storage, uid, clientId) {
    if (
        !storage ||
        typeof storage.getUserAccess !== "function" ||
        typeof storage.getClientGrant !== "function"
    ) {
        throw new TypeError("Invalid OAuth grant storage");
    }

    if (!Number.isSafeInteger(uid) || uid <= 0) {
        throw new TypeError("Invalid OAuth user ID");
    }

    if (typeof clientId !== "string" || !clientId) {
        throw new TypeError("Invalid OAuth client ID");
    }

    const [userAccess, grant] = await Promise.all([
        storage.getUserAccess(uid),
        storage.getClientGrant(uid, clientId)
    ]);

    if (!userAccess || typeof userAccess !== "object") {
        throw new TypeError("Invalid OAuth user access record");
    }

    const userAccessVersion = assertVersion(
        userAccess.version,
        "user access version"
    );

    if (userAccess.enabled !== true) {
        return {
            active: false,
            reason: "user_access_disabled"
        };
    }

    if (!grant) {
        return {
            active: false,
            reason: "grant_missing"
        };
    }

    if (typeof grant !== "object") {
        throw new TypeError("Invalid OAuth client grant");
    }

    const grantVersion = assertVersion(
        grant.version,
        "grant version"
    );

    if (grant.enabled !== true) {
        return {
            active: false,
            reason: "grant_disabled"
        };
    }

    if (typeof grant.metadataFingerprint !== "string") {
        throw new TypeError("Invalid OAuth metadata fingerprint");
    }

    return {
        active: true,
        userAccessVersion,
        grantVersion,
        metadataFingerprint: grant.metadataFingerprint
    };
}

async function getActivePermissionSnapshot(storage, uid, client) {
    if (!client || typeof client.clientId !== "string" || !client.clientId) {
        throw new TypeError("Invalid OAuth client");
    }

    const snapshot = await getCurrentPermissionSnapshot(
        storage,
        uid,
        client.clientId
    );

    if (!snapshot.active) {
        return snapshot;
    }

    const metadataFingerprint = createClientFingerprint(client);

    if (snapshot.metadataFingerprint !== metadataFingerprint) {
        return {
            active: false,
            reason: "metadata_changed"
        };
    }

    return snapshot;
}

module.exports = {
    getCurrentPermissionSnapshot,
    getActivePermissionSnapshot
};
