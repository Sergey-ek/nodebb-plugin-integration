"use strict";

const crypto = require("crypto");

const PREFIX = "{integration:oauth}";

const SET_USER_ACCESS_SCRIPT = `
-- integration-oauth:set-user-access
local raw = redis.call("GET", KEYS[1])
local current = raw and cjson.decode(raw) or {
    enabled = true,
    version = 1
}

local desired = ARGV[1] == "1"

if current.enabled ~= desired then
    current.enabled = desired
    current.version = current.version + 1
end

redis.call("SET", KEYS[1], cjson.encode(current))
return cjson.encode(current)
`;

const SET_CLIENT_GRANT_SCRIPT = `
-- integration-oauth:set-client-grant
local raw = redis.call("GET", KEYS[1])
local current = raw and cjson.decode(raw) or nil

local grant = cjson.decode(ARGV[1])
local version = current and (current.version + 1) or 1

grant.uid = tonumber(ARGV[2])
grant.clientId = ARGV[3]
grant.enabled = true
grant.version = version
grant.updatedAt = tonumber(ARGV[4])

if not grant.createdAt then
    grant.createdAt = tonumber(ARGV[4])
end

redis.call("SET", KEYS[1], cjson.encode(grant))
redis.call("SADD", KEYS[2], ARGV[3])
return cjson.encode(grant)
`;

const REVOKE_CLIENT_GRANT_SCRIPT = `
-- integration-oauth:revoke-client-grant
local raw = redis.call("GET", KEYS[1])
if not raw then
    return false
end

local grant = cjson.decode(raw)

if grant.enabled then
    grant.enabled = false
    grant.version = grant.version + 1
    grant.updatedAt = tonumber(ARGV[1])
    redis.call("SET", KEYS[1], cjson.encode(grant))
end

return cjson.encode(grant)
`;

const CREATE_CONSENT_SCRIPT = `
-- integration-oauth:create-consent
local result = redis.call(
    "SET", KEYS[1], ARGV[1], "EX", ARGV[2], "NX"
)

if result then
    return 1
end

return 0
`;

const APPROVE_CONSENT_SCRIPT = `
-- integration-oauth:approve-consent
local raw = redis.call("GET", KEYS[1])
if not raw then
    return { "missing", false }
end

local transaction = cjson.decode(raw)
local expected = cjson.decode(ARGV[1])

if transaction.uid ~= expected.uid
    or transaction.sessionBindingHash ~= expected.sessionBindingHash
    or transaction.clientId ~= expected.clientId
    or transaction.metadataFingerprint ~= expected.metadataFingerprint then
    return { "mismatch", false }
end

local userRaw = redis.call("GET", KEYS[2])
local userAccess = userRaw and cjson.decode(userRaw) or {
    enabled = true,
    version = 1
}

if not userAccess.enabled then
    redis.call("DEL", KEYS[1])
    return { "disabled", false }
end

local existingRaw = redis.call("GET", KEYS[3])
local existing = existingRaw and cjson.decode(existingRaw) or nil
local grant = cjson.decode(ARGV[2])
local now = tonumber(ARGV[3])

grant.uid = tonumber(expected.uid)
grant.clientId = expected.clientId
grant.enabled = true
grant.version = existing and (existing.version + 1) or 1
grant.updatedAt = now

if not grant.createdAt then
    grant.createdAt = now
end

redis.call("SET", KEYS[3], cjson.encode(grant))
redis.call("SADD", KEYS[4], expected.clientId)
redis.call("DEL", KEYS[1])

return { "approved", cjson.encode(grant) }
`;

const CONSUME_CONSENT_SCRIPT = `
-- integration-oauth:consume-consent
local raw = redis.call("GET", KEYS[1])
if not raw then
    return 0
end

local transaction = cjson.decode(raw)
local expected = cjson.decode(ARGV[1])

if transaction.uid ~= expected.uid
    or transaction.sessionBindingHash ~= expected.sessionBindingHash
    or transaction.clientId ~= expected.clientId then
    return 0
end

redis.call("DEL", KEYS[1])
return 1
`;

function assertClient(client) {
    if (!client || typeof client.sendCommand !== "function") {
        throw new TypeError("Redis client must provide sendCommand()");
    }
}

function assertUid(uid) {
    if (!Number.isSafeInteger(uid) || uid <= 0) {
        throw new TypeError("uid must be a positive safe integer");
    }
}

function assertClientId(clientId) {
    if (
        typeof clientId !== "string" ||
        clientId.length < 1 ||
        clientId.length > 2048
    ) {
        throw new TypeError("clientId must be a non-empty string up to 2048 characters");
    }
}

function assertHash(value, name = "hash") {
    if (typeof value !== "string" || !/^[a-f0-9]{64}$/i.test(value)) {
        throw new TypeError(`${name} must be a 64-character hexadecimal SHA-256 hash`);
    }
}

function assertTtl(value) {
    if (!Number.isSafeInteger(value) || value < 1) {
        throw new TypeError("ttlSeconds must be a positive integer");
    }
}

function parseRecord(value) {
    if (value === null || value === undefined || value === false) {
        return null;
    }

    if (typeof value !== "string") {
        throw new TypeError("Redis returned an invalid OAuth grant record");
    }

    return JSON.parse(value);
}

function clientHash(clientId) {
    assertClientId(clientId);

    return crypto
        .createHash("sha256")
        .update(clientId, "utf8")
        .digest("hex");
}

function createRedisGrantAdapter(client) {
    assertClient(client);

    const userKey = uid => `${PREFIX}:user:${uid}`;
    const grantKey = (uid, clientId) =>
        `${PREFIX}:grant:${uid}:${clientHash(clientId)}`;
    const grantIndexKey = uid => `${PREFIX}:user:${uid}:grants`;
    const consentKey = hash => `${PREFIX}:consent:${hash}`;

    async function evalScript(script, keys, args = []) {
        return client.sendCommand([
            "EVAL",
            script,
            String(keys.length),
            ...keys,
            ...args.map(value =>
                typeof value === "string" ? value : JSON.stringify(value)
            )
        ]);
    }

    return Object.freeze({
        async getUserAccess(uid) {
            assertUid(uid);

            const raw = await client.sendCommand([
                "GET",
                userKey(uid)
            ]);

            return parseRecord(raw) || {
                enabled: true,
                version: 1
            };
        },

        async setUserAccess(uid, enabled) {
            assertUid(uid);

            if (typeof enabled !== "boolean") {
                throw new TypeError("enabled must be a boolean");
            }

            const raw = await evalScript(
                SET_USER_ACCESS_SCRIPT,
                [userKey(uid)],
                [enabled ? "1" : "0"]
            );

            return parseRecord(raw);
        },

        async getClientGrant(uid, clientId) {
            assertUid(uid);
            assertClientId(clientId);

            const raw = await client.sendCommand([
                "GET",
                grantKey(uid, clientId)
            ]);

            return parseRecord(raw);
        },

        async listClientGrants(uid) {
            assertUid(uid);

            const clientIds = await client.sendCommand([
                "SMEMBERS",
                grantIndexKey(uid)
            ]);

            if (!Array.isArray(clientIds) || clientIds.length === 0) {
                return [];
            }

            const grants = await Promise.all(clientIds.map(async clientId => {
                assertClientId(clientId);

                const raw = await client.sendCommand([
                    "GET",
                    grantKey(uid, clientId)
                ]);

                const grant = parseRecord(raw);

                if (!grant) {
                    return null;
                }

                if (grant.uid !== uid || grant.clientId !== clientId) {
                    throw new Error("OAuth grant index contains an inconsistent record");
                }

                return grant;
            }));

            return grants.filter(Boolean);
        },

        async setClientGrant(uid, clientId, data) {
            assertUid(uid);
            assertClientId(clientId);

            if (!data || typeof data !== "object" || Array.isArray(data)) {
                throw new TypeError("grant data must be an object");
            }

            const raw = await evalScript(
                SET_CLIENT_GRANT_SCRIPT,
                [grantKey(uid, clientId), grantIndexKey(uid)],
                [
                    JSON.stringify(data),
                    String(uid),
                    clientId,
                    String(Date.now())
                ]
            );

            return parseRecord(raw);
        },

        async revokeClientGrant(uid, clientId) {
            assertUid(uid);
            assertClientId(clientId);

            const raw = await evalScript(
                REVOKE_CLIENT_GRANT_SCRIPT,
                [grantKey(uid, clientId)],
                [String(Date.now())]
            );

            return parseRecord(raw);
        },

        async getConsentTransaction(id) {
            assertHash(id, "transaction hash");

            const raw = await client.sendCommand([
                "GET",
                consentKey(id)
            ]);

            return parseRecord(raw);
        },

        async createConsentTransaction(id, data, ttlSeconds) {
            assertHash(id, "transaction hash");
            assertTtl(ttlSeconds);

            if (!data || typeof data !== "object" || Array.isArray(data)) {
                throw new TypeError("consent transaction data must be an object");
            }

            assertUid(data.uid);
            assertClientId(data.clientId);
            assertHash(data.sessionBindingHash, "sessionBindingHash");

            const result = await evalScript(
                CREATE_CONSENT_SCRIPT,
                [consentKey(id)],
                [JSON.stringify(data), String(ttlSeconds)]
            );

            return Number(result) === 1;
        },

        async approveConsentTransaction(id, expected, grantData) {
            assertHash(id, "transaction hash");

            if (!expected || typeof expected !== "object") {
                throw new TypeError("expected transaction data must be an object");
            }

            assertUid(expected.uid);
            assertClientId(expected.clientId);
            assertHash(expected.sessionBindingHash, "sessionBindingHash");

            if (
                typeof expected.metadataFingerprint !== "string" ||
                !expected.metadataFingerprint
            ) {
                throw new TypeError("metadataFingerprint must be a non-empty string");
            }

            if (
                !grantData ||
                typeof grantData !== "object" ||
                Array.isArray(grantData)
            ) {
                throw new TypeError("grant data must be an object");
            }

            const raw = await evalScript(
                APPROVE_CONSENT_SCRIPT,
                [
                    consentKey(id),
                    userKey(expected.uid),
                    grantKey(expected.uid, expected.clientId),
                    grantIndexKey(expected.uid)
                ],
                [
                    JSON.stringify(expected),
                    JSON.stringify(grantData),
                    String(Date.now())
                ]
            );

            if (!Array.isArray(raw) || raw.length < 1) {
                throw new TypeError("Redis returned an invalid consent approval result");
            }

            return {
                status: raw[0],
                grant: parseRecord(raw[1])
            };
        },

        async consumeConsentTransaction(id, expected) {
            assertHash(id, "transaction hash");

            if (!expected || typeof expected !== "object") {
                throw new TypeError("expected transaction data must be an object");
            }

            assertUid(expected.uid);
            assertClientId(expected.clientId);
            assertHash(expected.sessionBindingHash, "sessionBindingHash");

            const result = await evalScript(
                CONSUME_CONSENT_SCRIPT,
                [consentKey(id)],
                [JSON.stringify(expected)]
            );

            return Number(result) === 1;
        }
    });
}

module.exports = {
    createRedisGrantAdapter,
    scripts: Object.freeze({
        setUserAccess: SET_USER_ACCESS_SCRIPT,
        setClientGrant: SET_CLIENT_GRANT_SCRIPT,
        revokeClientGrant: REVOKE_CLIENT_GRANT_SCRIPT,
        createConsent: CREATE_CONSENT_SCRIPT,
        approveConsent: APPROVE_CONSENT_SCRIPT,
        consumeConsent: CONSUME_CONSENT_SCRIPT
    })
};
