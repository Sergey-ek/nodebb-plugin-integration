"use strict";

const PREFIX = "{integration:oauth}";

const CONSUME_SCRIPT = `
-- integration-oauth:consume
local value = redis.call("GET", KEYS[1])
if not value then
    return false
end
redis.call("DEL", KEYS[1])
return value
`;

const ROTATE_SCRIPT = `
-- integration-oauth:rotate
local raw = redis.call("GET", KEYS[1])
if not raw then
    return { "invalid", false }
end

local family = cjson.decode(raw)

if family.revoked then
    return { "invalid", false }
end

if family.currentTokenHash == ARGV[1] then
    local ttl = redis.call("PTTL", KEYS[1])

    if ttl <= 0 then
        redis.call("DEL", KEYS[1])
        return { "invalid", false }
    end

    family.usedTokenHashes = family.usedTokenHashes or {}
    table.insert(family.usedTokenHashes, ARGV[1])
    family.currentTokenHash = ARGV[2]

    redis.call("SET", KEYS[1], cjson.encode(family), "PX", ttl)
    return { "rotated", cjson.encode(family) }
end

for _, usedHash in ipairs(family.usedTokenHashes or {}) do
    if usedHash == ARGV[1] then
        family.revoked = true

        local ttl = redis.call("PTTL", KEYS[1])
        if ttl > 0 then
            redis.call("SET", KEYS[1], cjson.encode(family), "PX", ttl)
        else
            redis.call("DEL", KEYS[1])
        end

        return { "reused", cjson.encode(family) }
    end
end

return { "invalid", false }
`;

const REVOKE_FAMILY_SCRIPT = `
-- integration-oauth:revoke-family
local raw = redis.call("GET", KEYS[1])
if not raw then
    return 0
end

local family = cjson.decode(raw)
family.revoked = true

local ttl = redis.call("PTTL", KEYS[1])
if ttl > 0 then
    redis.call("SET", KEYS[1], cjson.encode(family), "PX", ttl)
else
    redis.call("DEL", KEYS[1])
end

return 1
`;

function assertClient(client) {
    if (!client || typeof client.sendCommand !== "function") {
        throw new TypeError("Redis client must provide sendCommand()");
    }
}

function assertHash(value, name = "hash") {
    if (typeof value !== "string" || !/^[a-f0-9]{64}$/i.test(value)) {
        throw new TypeError(`${name} must be a 64-character hexadecimal SHA-256 hash`);
    }
}

function assertFamilyId(value) {
    if (typeof value !== "string" || !/^[a-f0-9]{32,64}$/i.test(value)) {
        throw new TypeError("familyId must be a 32-64 character hexadecimal ID");
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
        throw new TypeError("Redis returned an invalid OAuth record");
    }

    return JSON.parse(value);
}

function createRedisAdapter(client) {
    assertClient(client);

    const codeKey = hash => `${PREFIX}:code:${hash}`;
    const accessKey = hash => `${PREFIX}:access:${hash}`;
    const familyKey = id => `${PREFIX}:refresh:${id}`;

    async function setRecord(key, data, ttlSeconds) {
        assertTtl(ttlSeconds);

        const result = await client.sendCommand([
            "SET",
            key,
            JSON.stringify(data),
            "EX",
            String(ttlSeconds),
            "NX"
        ]);

        return result === "OK";
    }

    async function evalScript(script, keys, args = []) {
        return client.sendCommand([
            "EVAL",
            script,
            String(keys.length),
            ...keys,
            ...args.map(String)
        ]);
    }

    return Object.freeze({
        createAuthorizationCode(hash, data, ttlSeconds) {
            assertHash(hash);
            return setRecord(codeKey(hash), data, ttlSeconds);
        },

        async consumeAuthorizationCode(hash) {
            assertHash(hash);
            const value = await evalScript(
                CONSUME_SCRIPT,
                [codeKey(hash)]
            );
            return parseRecord(value);
        },

        createAccessToken(hash, data, ttlSeconds) {
            assertHash(hash);
            return setRecord(accessKey(hash), data, ttlSeconds);
        },

        async getAccessToken(hash) {
            assertHash(hash);
            const value = await client.sendCommand([
                "GET",
                accessKey(hash)
            ]);
            return parseRecord(value);
        },

        async revokeAccessToken(hash) {
            assertHash(hash);
            const result = await client.sendCommand([
                "DEL",
                accessKey(hash)
            ]);
            return Number(result) > 0;
        },

        async createRefreshFamily(familyId, data, ttlSeconds) {
            assertFamilyId(familyId);
            assertTtl(ttlSeconds);

            if (!data || typeof data !== "object" ||
                typeof data.currentTokenHash !== "string") {
                throw new TypeError("Refresh family must contain currentTokenHash");
            }

            assertHash(data.currentTokenHash, "currentTokenHash");

            return setRecord(familyKey(familyId), {
                ...data,
                usedTokenHashes: Array.isArray(data.usedTokenHashes)
                    ? data.usedTokenHashes
                    : [],
                revoked: false
            }, ttlSeconds);
        },

        async getRefreshFamily(familyId) {
            assertFamilyId(familyId);
            const value = await client.sendCommand([
                "GET",
                familyKey(familyId)
            ]);
            return parseRecord(value);
        },

        async rotateRefreshToken(
            familyId,
            presentedHash,
            nextHash,
            ttlSeconds
        ) {
            assertFamilyId(familyId);
            assertHash(presentedHash, "presentedHash");
            assertHash(nextHash, "nextHash");
            assertTtl(ttlSeconds);

            const result = await evalScript(
                ROTATE_SCRIPT,
                [familyKey(familyId)],
                [presentedHash, nextHash, ttlSeconds]
            );

            if (!Array.isArray(result) || result.length < 1) {
                throw new TypeError("Redis returned an invalid refresh rotation result");
            }

            return {
                status: result[0],
                family: parseRecord(result[1])
            };
        },

        async revokeRefreshFamily(familyId) {
            assertFamilyId(familyId);

            const result = await evalScript(
                REVOKE_FAMILY_SCRIPT,
                [familyKey(familyId)]
            );

            return Number(result) === 1;
        }
    });
}

module.exports = {
    createRedisAdapter,
    scripts: Object.freeze({
        consume: CONSUME_SCRIPT,
        rotate: ROTATE_SCRIPT,
        revokeFamily: REVOKE_FAMILY_SCRIPT
    })
};
