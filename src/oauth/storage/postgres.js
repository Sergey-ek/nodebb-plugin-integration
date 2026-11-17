"use strict";

const crypto = require("crypto");

function assertPool(pool) {
    if (!pool || typeof pool.query !== "function" ||
        typeof pool.connect !== "function") {
        throw new TypeError("PostgreSQL pool must provide query() and connect()");
    }
}

function assertUid(uid) {
    if (!Number.isSafeInteger(uid) || uid <= 0) {
        throw new TypeError("uid must be a positive safe integer");
    }
}

function assertClientId(clientId) {
    if (typeof clientId !== "string" ||
        clientId.length < 1 || clientId.length > 2048) {
        throw new TypeError(
            "clientId must be a non-empty string up to 2048 characters"
        );
    }
}

function assertHash(value, name = "hash") {
    if (typeof value !== "string" || !/^[a-f0-9]{64}$/i.test(value)) {
        throw new TypeError(
            `${name} must be a 64-character hexadecimal SHA-256 hash`
        );
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

function assertObject(value, name) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new TypeError(`${name} must be an object`);
    }
}

function clientHash(clientId) {
    assertClientId(clientId);

    return crypto.createHash("sha256")
        .update(clientId, "utf8")
        .digest("hex");
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS integration_oauth_codes (
    token_hash TEXT PRIMARY KEY,
    data JSONB NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS oauth_codes_expires_idx
    ON integration_oauth_codes (expires_at);

CREATE TABLE IF NOT EXISTS integration_oauth_access (
    token_hash TEXT PRIMARY KEY,
    data JSONB NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS oauth_access_expires_idx
    ON integration_oauth_access (expires_at);

CREATE TABLE IF NOT EXISTS integration_oauth_refresh (
    family_id TEXT PRIMARY KEY,
    data JSONB NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS oauth_refresh_expires_idx
    ON integration_oauth_refresh (expires_at);

CREATE TABLE IF NOT EXISTS integration_oauth_users (
    uid BIGINT PRIMARY KEY,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    version BIGINT NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS integration_oauth_grants (
    uid BIGINT NOT NULL,
    client_hash TEXT NOT NULL,
    client_id TEXT NOT NULL,
    data JSONB NOT NULL,
    PRIMARY KEY (uid, client_hash),
    UNIQUE (uid, client_id)
);

CREATE INDEX IF NOT EXISTS oauth_grants_uid_idx
    ON integration_oauth_grants (uid);

CREATE TABLE IF NOT EXISTS integration_oauth_consents (
    id TEXT PRIMARY KEY,
    uid BIGINT NOT NULL,
    client_id TEXT NOT NULL,
    session_binding_hash TEXT NOT NULL,
    metadata_fingerprint TEXT,
    data JSONB NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS oauth_consents_expires_idx
    ON integration_oauth_consents (expires_at);

CREATE INDEX IF NOT EXISTS oauth_consents_uid_idx
    ON integration_oauth_consents (uid);
`;

function createPostgresAdapter(pool) {
    assertPool(pool);

    let schemaPromise = null;

    async function ensureSchema() {
        if (!schemaPromise) {
            schemaPromise = pool.query(SCHEMA).catch(error => {
                schemaPromise = null;
                throw error;
            });
        }

        await schemaPromise;
    }

    async function transaction(callback) {
        const connection = await pool.connect();

        try {
            await connection.query("BEGIN");
            const result = await callback(connection);
            await connection.query("COMMIT");
            return result;
        } catch (error) {
            try {
                await connection.query("ROLLBACK");
            } catch (_) {
                // Preserve the original transaction error.
            }

            throw error;
        } finally {
            connection.release();
        }
    }

    async function insertExpiring(table, column, id, data, ttlSeconds) {
        assertTtl(ttlSeconds);

        await ensureSchema();

        // PostgreSQL has no TTL index. Remove an expired conflicting
        // record before attempting the unique insert.
        await pool.query(
            `DELETE FROM ${table} WHERE ${column} = $1 AND expires_at <= NOW()`,
            [id]
        );

        const result = await pool.query(
            `INSERT INTO ${table} (${column}, data, expires_at)
             VALUES ($1, $2::jsonb, NOW() + ($3 * INTERVAL '1 second'))
             ON CONFLICT (${column}) DO NOTHING
             RETURNING ${column}`,
            [id, JSON.stringify(data), ttlSeconds]
        );

        return result.rowCount > 0;
    }

    async function upsertGrant(connection, uid, clientId, data, now) {
        const hash = clientHash(clientId);

        const grant = {
            ...data,
            uid,
            clientId,
            enabled: true,
            version: 1,
            createdAt: Object.prototype.hasOwnProperty.call(data, "createdAt")
                ? data.createdAt
                : now,
            updatedAt: now
        };

        const result = await connection.query(
            `INSERT INTO integration_oauth_grants
                (uid, client_hash, client_id, data)
             VALUES ($1, $2, $3, $4::jsonb)
             ON CONFLICT (uid, client_hash)
             DO UPDATE SET
                client_id = EXCLUDED.client_id,
                data = EXCLUDED.data ||
                    jsonb_build_object(
                        'version',
                        COALESCE(
                            (integration_oauth_grants.data->>'version')::BIGINT,
                            0
                        ) + 1,
                        'createdAt',
                        COALESCE(
                            integration_oauth_grants.data->'createdAt',
                            EXCLUDED.data->'createdAt'
                        )
                    )
             RETURNING data`,
            [uid, hash, clientId, JSON.stringify(grant)]
        );

        return result.rows[0].data;
    }

    return Object.freeze({
        async createAuthorizationCode(hash, data, ttlSeconds) {
            assertHash(hash);
            return insertExpiring(
                "integration_oauth_codes",
                "token_hash",
                hash,
                data,
                ttlSeconds
            );
        },

        async consumeAuthorizationCode(hash) {
            assertHash(hash);
            await ensureSchema();

            const result = await pool.query(
                `DELETE FROM integration_oauth_codes
                 WHERE token_hash = $1 AND expires_at > NOW()
                 RETURNING data`,
                [hash]
            );

            return result.rows[0] ? result.rows[0].data : null;
        },

        async createAccessToken(hash, data, ttlSeconds) {
            assertHash(hash);
            return insertExpiring(
                "integration_oauth_access",
                "token_hash",
                hash,
                data,
                ttlSeconds
            );
        },

        async getAccessToken(hash) {
            assertHash(hash);
            await ensureSchema();

            const result = await pool.query(
                `SELECT data FROM integration_oauth_access
                 WHERE token_hash = $1 AND expires_at > NOW()`,
                [hash]
            );

            return result.rows[0] ? result.rows[0].data : null;
        },

        async revokeAccessToken(hash) {
            assertHash(hash);
            await ensureSchema();

            const result = await pool.query(
                `DELETE FROM integration_oauth_access
                 WHERE token_hash = $1 AND expires_at > NOW()`,
                [hash]
            );

            return result.rowCount > 0;
        },

        async createRefreshFamily(familyId, data, ttlSeconds) {
            assertFamilyId(familyId);
            assertTtl(ttlSeconds);
            assertObject(data, "refresh family");

            if (typeof data.currentTokenHash !== "string") {
                throw new TypeError(
                    "Refresh family must contain currentTokenHash"
                );
            }

            assertHash(data.currentTokenHash, "currentTokenHash");

            return insertExpiring(
                "integration_oauth_refresh",
                "family_id",
                familyId,
                {
                    ...data,
                    usedTokenHashes: Array.isArray(data.usedTokenHashes)
                        ? data.usedTokenHashes
                        : [],
                    revoked: false
                },
                ttlSeconds
            );
        },

        async getRefreshFamily(familyId) {
            assertFamilyId(familyId);
            await ensureSchema();

            const result = await pool.query(
                `SELECT data FROM integration_oauth_refresh
                 WHERE family_id = $1 AND expires_at > NOW()`,
                [familyId]
            );

            return result.rows[0] ? result.rows[0].data : null;
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
            await ensureSchema();

            return transaction(async connection => {
                const result = await connection.query(
                    `SELECT data FROM integration_oauth_refresh
                     WHERE family_id = $1 AND expires_at > NOW()
                     FOR UPDATE`,
                    [familyId]
                );

                if (!result.rows.length) {
                    return { status: "invalid", family: null };
                }

                const family = result.rows[0].data;

                if (family.revoked) {
                    return { status: "invalid", family: null };
                }

                if (family.currentTokenHash === presentedHash) {
                    family.usedTokenHashes =
                        Array.isArray(family.usedTokenHashes)
                            ? family.usedTokenHashes
                            : [];

                    family.usedTokenHashes.push(presentedHash);
                    family.currentTokenHash = nextHash;

                    await connection.query(
                        `UPDATE integration_oauth_refresh
                         SET data = $2::jsonb
                         WHERE family_id = $1`,
                        [familyId, JSON.stringify(family)]
                    );

                    return { status: "rotated", family };
                }

                if (family.usedTokenHashes.includes(presentedHash)) {
                    family.revoked = true;

                    await connection.query(
                        `UPDATE integration_oauth_refresh
                         SET data = $2::jsonb
                         WHERE family_id = $1`,
                        [familyId, JSON.stringify(family)]
                    );

                    return { status: "reused", family };
                }

                return { status: "invalid", family: null };
            });
        },

        async revokeRefreshFamily(familyId) {
            assertFamilyId(familyId);
            await ensureSchema();

            const result = await pool.query(
                `UPDATE integration_oauth_refresh
                 SET data = jsonb_set(data, '{revoked}', 'true'::jsonb, true)
                 WHERE family_id = $1 AND expires_at > NOW()`,
                [familyId]
            );

            return result.rowCount > 0;
        },

        async getUserAccess(uid) {
            assertUid(uid);
            await ensureSchema();

            const result = await pool.query(
                `SELECT enabled, version
                 FROM integration_oauth_users
                 WHERE uid = $1`,
                [uid]
            );

            if (!result.rows.length) {
                return { enabled: true, version: 1 };
            }

            return {
                enabled: result.rows[0].enabled,
                version: Number(result.rows[0].version)
            };
        },

        async setUserAccess(uid, enabled) {
            assertUid(uid);

            if (typeof enabled !== "boolean") {
                throw new TypeError("enabled must be a boolean");
            }

            await ensureSchema();

            const result = await pool.query(
                `INSERT INTO integration_oauth_users (uid, enabled, version)
                 VALUES ($1, $2, 1)
                 ON CONFLICT (uid)
                 DO UPDATE SET
                    version = CASE
                        WHEN integration_oauth_users.enabled
                            IS DISTINCT FROM EXCLUDED.enabled
                        THEN integration_oauth_users.version + 1
                        ELSE integration_oauth_users.version
                    END,
                    enabled = EXCLUDED.enabled
                 RETURNING enabled, version`,
                [uid, enabled]
            );

            return {
                enabled: result.rows[0].enabled,
                version: Number(result.rows[0].version)
            };
        },

        async getClientGrant(uid, clientId) {
            assertUid(uid);
            const hash = clientHash(clientId);
            await ensureSchema();

            const result = await pool.query(
                `SELECT data FROM integration_oauth_grants
                 WHERE uid = $1 AND client_hash = $2`,
                [uid, hash]
            );

            if (!result.rows.length) {
                return null;
            }

            const grant = result.rows[0].data;

            if (grant.uid !== uid || grant.clientId !== clientId) {
                throw new Error(
                    "OAuth grant record contains an inconsistent identity"
                );
            }

            return grant;
        },

        async listClientGrants(uid) {
            assertUid(uid);
            await ensureSchema();

            const result = await pool.query(
                `SELECT client_hash, client_id, data
                 FROM integration_oauth_grants
                 WHERE uid = $1`,
                [uid]
            );

            return result.rows.map(row => {
                const grant = row.data;

                if (
                    grant.uid !== uid ||
                    grant.clientId !== row.client_id ||
                    row.client_hash !== clientHash(row.client_id)
                ) {
                    throw new Error(
                        "OAuth grant collection contains an inconsistent record"
                    );
                }

                return grant;
            });
        },

        async setClientGrant(uid, clientId, data) {
            assertUid(uid);
            assertClientId(clientId);
            assertObject(data, "grant data");
            await ensureSchema();

            return transaction(async connection => {
                return upsertGrant(
                    connection,
                    uid,
                    clientId,
                    data,
                    Date.now()
                );
            });
        },

        async revokeClientGrant(uid, clientId) {
            assertUid(uid);
            const hash = clientHash(clientId);
            await ensureSchema();

            const result = await pool.query(
                `UPDATE integration_oauth_grants
                 SET data = CASE
                    WHEN COALESCE((data->>'enabled')::boolean, TRUE)
                    THEN jsonb_set(
                        data,
                        '{enabled}',
                        'false'::jsonb,
                        true
                    ) ||
                    jsonb_build_object(
                        'version',
                        COALESCE((data->>'version')::BIGINT, 1) + 1,
                        'updatedAt',
                        $3::BIGINT
                    )
                    ELSE data
                 END
                 WHERE uid = $1 AND client_hash = $2
                 RETURNING data`,
                [uid, hash, Date.now()]
            );

            return result.rows[0] ? result.rows[0].data : null;
        },

        async getConsentTransaction(id) {
            assertHash(id, "transaction hash");
            await ensureSchema();

            const result = await pool.query(
                `SELECT data FROM integration_oauth_consents
                 WHERE id = $1 AND expires_at > NOW()`,
                [id]
            );

            return result.rows[0] ? result.rows[0].data : null;
        },

        async createConsentTransaction(id, data, ttlSeconds) {
            assertHash(id, "transaction hash");
            assertTtl(ttlSeconds);
            assertObject(data, "consent transaction data");
            assertUid(data.uid);
            assertClientId(data.clientId);
            assertHash(data.sessionBindingHash, "sessionBindingHash");
            await ensureSchema();

            await pool.query(
                `DELETE FROM integration_oauth_consents
                 WHERE id = $1 AND expires_at <= NOW()`,
                [id]
            );

            const stored = data;

            const result = await pool.query(
                `INSERT INTO integration_oauth_consents
                    (id, uid, client_id, session_binding_hash,
                     metadata_fingerprint, data, expires_at)
                 VALUES (
                    $1, $2, $3, $4, $5, $6::jsonb,
                    NOW() + ($7 * INTERVAL '1 second')
                 )
                 ON CONFLICT (id) DO NOTHING
                 RETURNING id`,
                [
                    id,
                    data.uid,
                    data.clientId,
                    data.sessionBindingHash,
                    data.metadataFingerprint ?? null,
                    JSON.stringify(stored),
                    ttlSeconds
                ]
            );

            return result.rowCount > 0;
        },

        async approveConsentTransaction(id, expected, grantData) {
            assertHash(id, "transaction hash");
            assertObject(expected, "expected transaction data");
            assertUid(expected.uid);
            assertClientId(expected.clientId);
            assertHash(expected.sessionBindingHash, "sessionBindingHash");

            if (
                typeof expected.metadataFingerprint !== "string" ||
                !expected.metadataFingerprint
            ) {
                throw new TypeError(
                    "metadataFingerprint must be a non-empty string"
                );
            }

            assertObject(grantData, "grant data");
            await ensureSchema();

            return transaction(async connection => {
                const consentResult = await connection.query(
                    `SELECT * FROM integration_oauth_consents
                     WHERE id = $1 AND expires_at > NOW()
                     FOR UPDATE`,
                    [id]
                );

                if (!consentResult.rows.length) {
                    return { status: "missing", grant: null };
                }

                const consent = consentResult.rows[0];

                if (
                    Number(consent.uid) !== expected.uid ||
                    consent.session_binding_hash !==
                        expected.sessionBindingHash ||
                    consent.client_id !== expected.clientId ||
                    consent.metadata_fingerprint !==
                        expected.metadataFingerprint
                ) {
                    return { status: "mismatch", grant: null };
                }

                // Create the default user row first so that the lock also
                // serializes approval against concurrent access changes.
                await connection.query(
                    `INSERT INTO integration_oauth_users (uid, enabled, version)
                     VALUES ($1, TRUE, 1)
                     ON CONFLICT (uid) DO NOTHING`,
                    [expected.uid]
                );

                const userResult = await connection.query(
                    `SELECT enabled FROM integration_oauth_users
                     WHERE uid = $1 FOR UPDATE`,
                    [expected.uid]
                );

                if (!userResult.rows[0].enabled) {
                    await connection.query(
                        `DELETE FROM integration_oauth_consents WHERE id = $1`,
                        [id]
                    );

                    return { status: "disabled", grant: null };
                }

                const grant = await upsertGrant(
                    connection,
                    expected.uid,
                    expected.clientId,
                    grantData,
                    Date.now()
                );

                await connection.query(
                    `DELETE FROM integration_oauth_consents WHERE id = $1`,
                    [id]
                );

                return { status: "approved", grant };
            });
        },

        async consumeConsentTransaction(id, expected) {
            assertHash(id, "transaction hash");
            assertObject(expected, "expected transaction data");
            assertUid(expected.uid);
            assertClientId(expected.clientId);
            assertHash(expected.sessionBindingHash, "sessionBindingHash");
            await ensureSchema();

            const result = await pool.query(
                `DELETE FROM integration_oauth_consents
                 WHERE id = $1
                   AND uid = $2
                   AND session_binding_hash = $3
                   AND client_id = $4
                   AND expires_at > NOW()`,
                [
                    id,
                    expected.uid,
                    expected.sessionBindingHash,
                    expected.clientId
                ]
            );

            return result.rowCount > 0;
        }
    });
}

module.exports = {
    createPostgresAdapter,
    schema: SCHEMA
};
