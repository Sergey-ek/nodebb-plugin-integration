"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { createClient } = require("redis");

const {
    createRedisGrantAdapter
} = require(process.env.GRANTS_MODULE || "../src/oauth/storage/grants");

async function main() {
    const client = createClient({
        url: process.env.REDIS_URL || "redis://nodebb-redis:6379"
    });

    client.on("error", error => {
        console.error("Redis error:", error.message);
    });

    await client.connect();

    const uid = 800000000 + crypto.randomInt(1, 1000000);
    const clientId = `https://integration-test.invalid/${crypto.randomUUID()}`;
    const sessionBindingHash = crypto.randomBytes(32).toString("hex");
    const metadataFingerprint = crypto.randomBytes(32).toString("hex");

    const transactionId = () => crypto.randomBytes(32).toString("hex");
    const transaction1 = transactionId();
    const transaction2 = transactionId();
    const transaction3 = transactionId();

    const prefix = "{integration:oauth}";
    const clientHash = crypto.createHash("sha256")
        .update(clientId, "utf8")
        .digest("hex");

    const keys = [
        `${prefix}:user:${uid}`,
        `${prefix}:user:${uid}:grants`,
        `${prefix}:grant:${uid}:${clientHash}`,
        `${prefix}:consent:${transaction1}`,
        `${prefix}:consent:${transaction2}`,
        `${prefix}:consent:${transaction3}`
    ];

    const storage = createRedisGrantAdapter(client);

    const expected = {
        uid,
        clientId,
        sessionBindingHash,
        metadataFingerprint
    };

    const transaction = {
        ...expected,
        redirectUri: "https://integration-test.invalid/callback",
        state: "integration-test-state",
        codeChallenge: crypto.randomBytes(32).toString("base64url"),
        scopes: ["mcp"],
        createdAt: Date.now()
    };

    const grantData = {
        clientName: "Redis Integration Test",
        metadataFingerprint,
        redirectUris: [transaction.redirectUri],
        createdAt: Date.now()
    };

    try {
        console.log("1. Default user access");
        const defaultAccess = await storage.getUserAccess(uid);
        assert.deepStrictEqual(defaultAccess, {
            enabled: true,
            version: 1
        });

        console.log("2. Global access toggle and versioning");
        const disabled = await storage.setUserAccess(uid, false);
        assert.equal(disabled.enabled, false);
        assert.equal(disabled.version, 2);

        const stillDisabled = await storage.setUserAccess(uid, false);
        assert.equal(stillDisabled.version, 2);

        const enabled = await storage.setUserAccess(uid, true);
        assert.equal(enabled.enabled, true);
        assert.equal(enabled.version, 3);

        console.log("3. Consent creation and NX");
        assert.equal(
            await storage.createConsentTransaction(transaction1, transaction, 300),
            true
        );
        assert.equal(
            await storage.createConsentTransaction(transaction1, transaction, 300),
            false
        );

        console.log("3a. Read existing and missing consent transactions");
        assert.deepStrictEqual(
            await storage.getConsentTransaction(transaction1),
            transaction
        );

        assert.equal(
            await storage.getConsentTransaction(transactionId()),
            null
        );

        console.log("4. Disabled consent is consumed atomically");
        await storage.setUserAccess(uid, false);

        const denied = await storage.approveConsentTransaction(
            transaction1,
            expected,
            grantData
        );

        assert.equal(denied.status, "disabled");
        assert.equal(denied.grant, null);

        const replayAfterDisabled = await storage.approveConsentTransaction(
            transaction1,
            expected,
            grantData
        );

        assert.equal(replayAfterDisabled.status, "missing");

        assert.equal(
            await storage.getConsentTransaction(transaction1),
            null
        );

        await storage.setUserAccess(uid, true);

        console.log("5. Successful consent approval");
        assert.equal(
            await storage.createConsentTransaction(transaction2, transaction, 300),
            true
        );

        const approved = await storage.approveConsentTransaction(
            transaction2,
            expected,
            grantData
        );

        assert.equal(approved.status, "approved");
        assert.equal(approved.grant.uid, uid);
        assert.equal(approved.grant.clientId, clientId);
        assert.equal(approved.grant.enabled, true);
        assert.equal(approved.grant.version, 1);

        assert.deepStrictEqual(
            await storage.getClientGrant(uid, clientId),
            approved.grant
        );

        const listedAfterApproval = await storage.listClientGrants(uid);
        assert.equal(listedAfterApproval.length, 1);
        assert.equal(listedAfterApproval[0].clientId, clientId);
        assert.equal(listedAfterApproval[0].enabled, true);

        console.log("5a. Grant index after approval: one active grant");
        console.log("6. Concurrent approval: exactly one succeeds");
        const concurrentExpected = {
            ...expected,
            metadataFingerprint: crypto.randomBytes(32).toString("hex")
        };

        const concurrentTransaction = {
            ...transaction,
            metadataFingerprint: concurrentExpected.metadataFingerprint
        };

        assert.equal(
            await storage.createConsentTransaction(
                transaction3,
                concurrentTransaction,
                300
            ),
            true
        );

        const concurrentGrantData = {
            ...grantData,
            metadataFingerprint: concurrentExpected.metadataFingerprint
        };

        const results = await Promise.all([
            storage.approveConsentTransaction(
                transaction3,
                concurrentExpected,
                concurrentGrantData
            ),
            storage.approveConsentTransaction(
                transaction3,
                concurrentExpected,
                concurrentGrantData
            )
        ]);

        assert.deepStrictEqual(
            results.map(result => result.status).sort(),
            ["approved", "missing"]
        );

        console.log("7. Grant update and revocation versions");
        const updated = await storage.setClientGrant(uid, clientId, {
            clientName: "Updated Integration Test",
            metadataFingerprint,
            redirectUris: [transaction.redirectUri]
        });

        assert.equal(updated.version, 3);

        const listedAfterUpdate = await storage.listClientGrants(uid);
        assert.equal(listedAfterUpdate.length, 1);
        assert.equal(listedAfterUpdate[0].clientId, clientId);
        assert.equal(listedAfterUpdate[0].enabled, true);
        assert.equal(listedAfterUpdate[0].version, 3);

        const revoked = await storage.revokeClientGrant(uid, clientId);
        assert.equal(revoked.enabled, false);
        assert.equal(revoked.version, 4);

        const listedAfterRevoke = await storage.listClientGrants(uid);
        assert.equal(listedAfterRevoke.length, 1);
        assert.equal(listedAfterRevoke[0].clientId, clientId);
        assert.equal(listedAfterRevoke[0].enabled, false);
        assert.equal(listedAfterRevoke[0].version, 4);

        const revokedAgain = await storage.revokeClientGrant(uid, clientId);
        assert.equal(revokedAgain.enabled, false);
        assert.equal(revokedAgain.version, 4);

        console.log("8. All Redis Grant integration checks passed.");
    } finally {
        await client.del(keys);
        await client.quit();
    }
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
