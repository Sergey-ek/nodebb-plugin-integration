"use strict";

const assert = require("node:assert/strict");
const { describe, it } = require("mocha");

const {
    getActivePermissionSnapshot
} = require("../src/oauth/permissions");

const {
    createClientFingerprint
} = require("../src/oauth/client-fingerprint");

const client = {
    clientId: "https://client.example.com/oauth-client.json",
    clientName: "Test MCP Client",
    redirectUris: ["https://client.example.com/callback"],
    grantTypes: ["authorization_code", "refresh_token"],
    responseTypes: ["code"],
    tokenEndpointAuthMethod: "none"
};

function createStorage(options = {}) {
    const fingerprint = createClientFingerprint(client);

    return {
        async getUserAccess() {
            return options.userAccess || {
                enabled: true,
                version: 3
            };
        },

        async getClientGrant() {
            if (options.grant === null) {
                return null;
            }

            return options.grant || {
                enabled: true,
                version: 7,
                metadataFingerprint: fingerprint
            };
        }
    };
}

describe("OAuth permission snapshots", () => {
    it("returns active permission versions for an approved client", async () => {
        const result = await getActivePermissionSnapshot(
            createStorage(),
            42,
            client
        );

        assert.deepEqual(result, {
            active: true,
            userAccessVersion: 3,
            grantVersion: 7,
            metadataFingerprint: createClientFingerprint(client)
        });
    });

    it("rejects globally disabled user access", async () => {
        const result = await getActivePermissionSnapshot(
            createStorage({
                userAccess: {
                    enabled: false,
                    version: 4
                }
            }),
            42,
            client
        );

        assert.equal(result.active, false);
        assert.equal(result.reason, "user_access_disabled");
    });

    it("rejects a missing client grant", async () => {
        const result = await getActivePermissionSnapshot(
            createStorage({ grant: null }),
            42,
            client
        );

        assert.equal(result.active, false);
        assert.equal(result.reason, "grant_missing");
    });

    it("rejects a disabled client grant", async () => {
        const result = await getActivePermissionSnapshot(
            createStorage({
                grant: {
                    enabled: false,
                    version: 8,
                    metadataFingerprint: createClientFingerprint(client)
                }
            }),
            42,
            client
        );

        assert.equal(result.active, false);
        assert.equal(result.reason, "grant_disabled");
    });

    it("rejects changed client metadata", async () => {
        const changedClient = {
            ...client,
            clientName: "Changed MCP Client"
        };

        const result = await getActivePermissionSnapshot(
            createStorage(),
            42,
            changedClient
        );

        assert.equal(result.active, false);
        assert.equal(result.reason, "metadata_changed");
    });

    it("rejects invalid user IDs", async () => {
        await assert.rejects(
            getActivePermissionSnapshot(createStorage(), 0, client),
            /Invalid OAuth user ID/
        );
    });

    it("rejects invalid permission versions", async () => {
        await assert.rejects(
            getActivePermissionSnapshot(
                createStorage({
                    userAccess: {
                        enabled: true,
                        version: 0
                    }
                }),
                42,
                client
            ),
            /Invalid OAuth user access version/
        );
    });

    it("rejects invalid grant versions", async () => {
        await assert.rejects(
            getActivePermissionSnapshot(
                createStorage({
                    grant: {
                        enabled: true,
                        version: 0,
                        metadataFingerprint: createClientFingerprint(client)
                    }
                }),
                42,
                client
            ),
            /Invalid OAuth grant version/
        );
    });

    it("propagates storage errors", async () => {
        const storage = createStorage();
        storage.getUserAccess = async () => {
            throw new Error("Redis unavailable");
        };

        await assert.rejects(
            getActivePermissionSnapshot(storage, 42, client),
            /Redis unavailable/
        );
    });
});
