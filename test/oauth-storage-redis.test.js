"use strict";

const assert = require("node:assert/strict");
const { describe, it } = require("mocha");

const {
    createRedisAdapter,
    scripts
} = require("../src/oauth/storage/redis");

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const FAMILY_ID = "c".repeat(32);

function createFakeRedis() {
    const values = new Map();
    const calls = [];

    return {
        values,
        calls,

        async sendCommand(args) {
            calls.push(args);

            const command = args[0];

            if (command === "SET") {
                const [, key, value, , ttl, nx] = args;

                if (nx === "NX" && values.has(key)) {
                    return null;
                }

                values.set(key, {
                    value,
                    ttl: Number(ttl)
                });

                return "OK";
            }

            if (command === "GET") {
                return values.get(args[1])?.value ?? null;
            }

            if (command === "DEL") {
                return values.delete(args[1]) ? 1 : 0;
            }

            if (command === "EVAL") {
                const script = args[1];

                if (script.includes("integration-oauth:consume")) {
                    const key = args[3];
                    const entry = values.get(key);

                    if (!entry) {
                        return null;
                    }

                    values.delete(key);
                    return entry.value;
                }

                if (script.includes("integration-oauth:rotate")) {
                    return ["rotated", JSON.stringify({
                        currentTokenHash: HASH_B,
                        usedTokenHashes: [HASH_A],
                        revoked: false
                    })];
                }

                if (script.includes("integration-oauth:revoke-family")) {
                    return 1;
                }
            }

            throw new Error(`Unexpected Redis command: ${args.join(" ")}`);
        }
    };
}

describe("OAuth Redis storage adapter", function () {
    it("rejects an invalid Redis client", function () {
        assert.throws(
            () => createRedisAdapter({}),
            /sendCommand/
        );
    });

    it("creates records with NX and an expiration", async function () {
        const redis = createFakeRedis();
        const storage = createRedisAdapter(redis);

        const created = await storage.createAuthorizationCode(
            HASH_A,
            { uid: 1, clientId: "test-client" },
            300
        );

        assert.equal(created, true);
        assert.equal(redis.calls[0][0], "SET");
        assert.equal(redis.calls[0][1], `{integration:oauth}:code:${HASH_A}`);
        assert.deepStrictEqual(redis.calls[0].slice(-3), ["EX", "300", "NX"]);
        assert.deepStrictEqual(
            JSON.parse(redis.values.get(`{integration:oauth}:code:${HASH_A}`).value),
            { uid: 1, clientId: "test-client" }
        );
    });

    it("does not overwrite an existing record", async function () {
        const redis = createFakeRedis();
        const storage = createRedisAdapter(redis);

        await storage.createAccessToken(HASH_A, { uid: 1 }, 600);
        const createdAgain = await storage.createAccessToken(
            HASH_A,
            { uid: 2 },
            600
        );

        assert.equal(createdAgain, false);
        assert.equal(
            JSON.parse(redis.values.get(`{integration:oauth}:access:${HASH_A}`).value).uid,
            1
        );
    });

    it("reads and revokes access tokens", async function () {
        const redis = createFakeRedis();
        const storage = createRedisAdapter(redis);

        await storage.createAccessToken(HASH_A, { uid: 7 }, 600);

        assert.deepStrictEqual(
            await storage.getAccessToken(HASH_A),
            { uid: 7 }
        );

        assert.equal(await storage.revokeAccessToken(HASH_A), true);
        assert.equal(await storage.getAccessToken(HASH_A), null);
        assert.equal(await storage.revokeAccessToken(HASH_A), false);
    });

    it("consumes authorization codes through one EVAL command", async function () {
        const redis = createFakeRedis();
        const storage = createRedisAdapter(redis);

        await storage.createAuthorizationCode(
            HASH_A,
            { uid: 1, clientId: "client" },
            300
        );

        const before = redis.calls.length;
        const record = await storage.consumeAuthorizationCode(HASH_A);

        assert.deepStrictEqual(record, { uid: 1, clientId: "client" });
        assert.equal(redis.calls.length, before + 1);
        assert.equal(redis.calls.at(-1)[0], "EVAL");
        assert.equal(await storage.consumeAuthorizationCode(HASH_A), null);
    });

    it("creates a refresh family", async function () {
        const redis = createFakeRedis();
        const storage = createRedisAdapter(redis);

        const created = await storage.createRefreshFamily(
            FAMILY_ID,
            {
                uid: 1,
                clientId: "client",
                currentTokenHash: HASH_A,
                scopes: ["mcp:read"]
            },
            2592000
        );

        assert.equal(created, true);

        const stored = JSON.parse(
            redis.values.get(`{integration:oauth}:refresh:${FAMILY_ID}`).value
        );

        assert.equal(stored.currentTokenHash, HASH_A);
        assert.deepStrictEqual(stored.usedTokenHashes, []);
        assert.equal(stored.revoked, false);
    });

    it("reads a refresh family by its ID", async function () {
        const redis = createFakeRedis();
        const storage = createRedisAdapter(redis);

        await storage.createRefreshFamily(
            FAMILY_ID,
            {
                uid: 7,
                clientId: "client",
                currentTokenHash: HASH_A,
                scopes: ["mcp"]
            },
            3600
        );

        const family = await storage.getRefreshFamily(FAMILY_ID);

        assert.equal(family.uid, 7);
        assert.equal(family.clientId, "client");
        assert.equal(family.currentTokenHash, HASH_A);
        assert.deepStrictEqual(family.usedTokenHashes, []);
        assert.equal(family.revoked, false);
        assert.equal(redis.calls.at(-1)[0], "GET");
    });

    it("rotates a refresh token through one EVAL command", async function () {
        const redis = createFakeRedis();
        const storage = createRedisAdapter(redis);

        const before = redis.calls.length;
        const result = await storage.rotateRefreshToken(
            FAMILY_ID,
            HASH_A,
            HASH_B,
            2592000
        );

        assert.equal(redis.calls.length, before + 1);
        assert.equal(redis.calls.at(-1)[0], "EVAL");
        assert.equal(result.status, "rotated");
        assert.equal(result.family.currentTokenHash, HASH_B);
    });

    it("revokes a refresh family through one EVAL command", async function () {
        const redis = createFakeRedis();
        const storage = createRedisAdapter(redis);

        assert.equal(
            await storage.revokeRefreshFamily(FAMILY_ID),
            true
        );

        assert.equal(redis.calls.at(-1)[0], "EVAL");
        assert.match(redis.calls.at(-1)[1], /integration-oauth:revoke-family/);
    });

    it("rejects malformed hashes and invalid TTL values", async function () {
        const storage = createRedisAdapter(createFakeRedis());

        await assert.rejects(
            storage.getAccessToken("not-a-hash"),
            /SHA-256 hash/
        );

        await assert.rejects(
            storage.createAccessToken(HASH_A, {}, 0),
            /positive integer/
        );

        await assert.rejects(
            storage.createRefreshFamily("bad-id", {
                currentTokenHash: HASH_A
            }, 100),
            /familyId/
        );
    });

    it("uses the same Redis Cluster hash tag for all keys", async function () {
        assert.match(scripts.consume, /integration-oauth:consume/);
        assert.match(scripts.rotate, /integration-oauth:rotate/);
        assert.match(scripts.revokeFamily, /integration-oauth:revoke-family/);

        const redis = createFakeRedis();
        const storage = createRedisAdapter(redis);

        await storage.createAuthorizationCode(HASH_A, {}, 60);
        await storage.createAccessToken(HASH_B, {}, 60);
        await storage.createRefreshFamily(FAMILY_ID, {
            currentTokenHash: HASH_A
        }, 60);

        const keys = redis.calls.map(call => call[1]);

        assert.ok(keys.every(key => key.startsWith("{integration:oauth}:")));
    });
});
