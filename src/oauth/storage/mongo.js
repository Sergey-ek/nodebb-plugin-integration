"use strict";

const crypto = require("crypto");

const COLLECTIONS = Object.freeze({
    codes: "integration_oauth_codes",
    access: "integration_oauth_access",
    refresh: "integration_oauth_refresh",
    users: "integration_oauth_users"
});

function assertDatabase(database) {
    if (!database || typeof database.collection !== "function") {
        throw new TypeError("MongoDB database must provide collection()");
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

function duplicateKey(error) {
    return error && error.code === 11000;
}

function resultDocument(result) {
    if (!result) {
        return null;
    }

    // MongoDB Node.js Driver 6/7 normally returns the document directly.
    // Older configurations may return ModifyResult with a .value property.
    if (Object.prototype.hasOwnProperty.call(result, "value")) {
        return result.value || null;
    }

    return result;
}

function grantFromUser(user, hash, uid, clientId) {
    if (!user || !Array.isArray(user.grants)) {
        return null;
    }

    const grant = user.grants.find(item => item.clientHash === hash);

    if (!grant) {
        return null;
    }

    if (grant.uid !== uid || grant.clientId !== clientId) {
        throw new Error("OAuth grant record contains an inconsistent identity");
    }

    return grant;
}

function grantUpdatePipeline(uid, clientId, hash, data, now) {
    const existing = {
        $first: {
            $filter: {
                input: { $ifNull: ["$grants", []] },
                as: "grant",
                cond: { $eq: ["$$grant.clientHash", hash] }
            }
        }
    };

    const remaining = {
        $filter: {
            input: { $ifNull: ["$grants", []] },
            as: "grant",
            cond: { $ne: ["$$grant.clientHash", hash] }
        }
    };

    return [{
        $set: {
            grants: {
                $let: {
                    vars: { existing },
                    in: {
                        $concatArrays: [
                            remaining,
                            [{
                                $mergeObjects: [
                                    { $literal: data },
                                    {
                                        uid,
                                        clientId,
                                        clientHash: hash,
                                        enabled: true,
                                        version: {
                                            $add: [
                                                { $ifNull: ["$$existing.version", 0] },
                                                1
                                            ]
                                        },
                                        createdAt: {
                                            $cond: [
                                                {
                                                    $or: [
                                                        { $eq: ["$$existing.createdAt", null] },
                                                        { $eq: ["$$existing.createdAt", false] }
                                                    ]
                                                },
                                                now,
                                                "$$existing.createdAt"
                                            ]
                                        },
                                        updatedAt: now
                                    }
                                ]
                            }]
                        ]
                    }
                }
            }
        }
    }];
}

function createMongoAdapter(database) {
    assertDatabase(database);

    const codes = database.collection(COLLECTIONS.codes);
    const access = database.collection(COLLECTIONS.access);
    const refresh = database.collection(COLLECTIONS.refresh);
    const users = database.collection(COLLECTIONS.users);

    let indexesPromise = null;

    async function ensureIndexes() {
        if (!indexesPromise) {
            indexesPromise = Promise.all([
                codes.createIndex(
                    { expiresAt: 1 },
                    { expireAfterSeconds: 0, name: "oauth_codes_ttl" }
                ),
                access.createIndex(
                    { expiresAt: 1 },
                    { expireAfterSeconds: 0, name: "oauth_access_ttl" }
                ),
                refresh.createIndex(
                    { expiresAt: 1 },
                    { expireAfterSeconds: 0, name: "oauth_refresh_ttl" }
                ),
                users.createIndex(
                    { "consents.id": 1 },
                    { unique: true, sparse: true, name: "oauth_consent_id_unique" }
                )
            ]).catch(error => {
                indexesPromise = null;
                throw error;
            });
        }

        await indexesPromise;
    }

    async function insertExpiring(collection, id, data, ttlSeconds) {
        assertTtl(ttlSeconds);

        const now = new Date();

        // MongoDB TTL deletion is asynchronous. Remove an expired record
        // with the same ID before attempting the unique insert.
        await collection.deleteOne({
            _id: id,
            expiresAt: { $lte: now }
        });

        try {
            await collection.insertOne({
                _id: id,
                data,
                expiresAt: new Date(Date.now() + ttlSeconds * 1000)
            });

            return true;
        } catch (error) {
            if (duplicateKey(error)) {
                return false;
            }

            throw error;
        }
    }

    async function ensureUser(uid) {
        await users.updateOne(
            { _id: uid },
            {
                $setOnInsert: {
                    enabled: true,
                    version: 1,
                    grants: [],
                    consents: []
                }
            },
            { upsert: true }
        );
    }

    async function classifyConsent(id, expected) {
        const user = await users.findOne({
            _id: expected.uid,
            "consents.id": id
        });

        if (!user) {
            return "missing";
        }

        const transaction = (user.consents || []).find(item => item.id === id);

        if (!transaction || transaction.expiresAt <= new Date()) {
            return "missing";
        }

        if (
            transaction.uid !== expected.uid ||
            transaction.sessionBindingHash !== expected.sessionBindingHash ||
            transaction.clientId !== expected.clientId ||
            transaction.metadataFingerprint !== expected.metadataFingerprint
        ) {
            return "mismatch";
        }

        return user.enabled === false ? "disabled" : "retry";
    }

    return Object.freeze({
        async createAuthorizationCode(hash, data, ttlSeconds) {
            assertHash(hash);
            await ensureIndexes();
            return insertExpiring(codes, hash, data, ttlSeconds);
        },

        async consumeAuthorizationCode(hash) {
            assertHash(hash);
            await ensureIndexes();

            const result = await codes.findOneAndDelete({
                _id: hash,
                expiresAt: { $gt: new Date() }
            });

            const document = resultDocument(result);
            return document ? document.data : null;
        },

        async createAccessToken(hash, data, ttlSeconds) {
            assertHash(hash);
            await ensureIndexes();
            return insertExpiring(access, hash, data, ttlSeconds);
        },

        async getAccessToken(hash) {
            assertHash(hash);
            await ensureIndexes();

            const document = await access.findOne({
                _id: hash,
                expiresAt: { $gt: new Date() }
            });

            return document ? document.data : null;
        },

        async revokeAccessToken(hash) {
            assertHash(hash);
            await ensureIndexes();

            const result = await access.deleteOne({
                _id: hash,
                expiresAt: { $gt: new Date() }
            });
            return result.deletedCount > 0;
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
            await ensureIndexes();

            return insertExpiring(refresh, familyId, {
                ...data,
                usedTokenHashes: Array.isArray(data.usedTokenHashes)
                    ? data.usedTokenHashes
                    : [],
                revoked: false
            }, ttlSeconds);
        },

        async getRefreshFamily(familyId) {
            assertFamilyId(familyId);
            await ensureIndexes();

            const document = await refresh.findOne({
                _id: familyId,
                expiresAt: { $gt: new Date() }
            });

            return document ? document.data : null;
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
            await ensureIndexes();

            const filter = {
                _id: familyId,
                expiresAt: { $gt: new Date() },
                "data.revoked": { $ne: true },
                $or: [
                    { "data.currentTokenHash": presentedHash },
                    { "data.usedTokenHashes": presentedHash }
                ]
            };

            const pipeline = [{
                $set: {
                    "data.usedTokenHashes": {
                        $cond: [
                            { $eq: ["$data.currentTokenHash", presentedHash] },
                            {
                                $concatArrays: [
                                    { $ifNull: ["$data.usedTokenHashes", []] },
                                    [presentedHash]
                                ]
                            },
                            { $ifNull: ["$data.usedTokenHashes", []] }
                        ]
                    },
                    "data.currentTokenHash": {
                        $cond: [
                            { $eq: ["$data.currentTokenHash", presentedHash] },
                            nextHash,
                            "$data.currentTokenHash"
                        ]
                    },
                    "data.revoked": {
                        $cond: [
                            { $eq: ["$data.currentTokenHash", presentedHash] },
                            false,
                            true
                        ]
                    }
                }
            }];

            const result = await refresh.findOneAndUpdate(
                filter,
                pipeline,
                { returnDocument: "after" }
            );

            const document = resultDocument(result);

            if (!document) {
                return { status: "invalid", family: null };
            }

            const family = document.data;
            const status = family.revoked ? "reused" : "rotated";

            return { status, family };
        },

        async revokeRefreshFamily(familyId) {
            assertFamilyId(familyId);
            await ensureIndexes();

            const result = await refresh.updateOne(
                {
                    _id: familyId,
                    expiresAt: { $gt: new Date() }
                },
                { $set: { "data.revoked": true } }
            );

            return result.matchedCount > 0;
        },

        async getUserAccess(uid) {
            assertUid(uid);
            await ensureIndexes();

            const user = await users.findOne(
                { _id: uid },
                { projection: { enabled: 1, version: 1 } }
            );

            return {
                enabled: user ? user.enabled !== false : true,
                version: user && Number.isSafeInteger(user.version)
                    ? user.version
                    : 1
            };
        },

        async setUserAccess(uid, enabled) {
            assertUid(uid);

            if (typeof enabled !== "boolean") {
                throw new TypeError("enabled must be a boolean");
            }

            await ensureIndexes();

            const currentEnabled = { $ifNull: ["$enabled", true] };
            const currentVersion = { $ifNull: ["$version", 1] };

            const result = await users.findOneAndUpdate(
                { _id: uid },
                [{
                    $set: {
                        enabled,
                        version: {
                            $cond: [
                                { $eq: [currentEnabled, enabled] },
                                currentVersion,
                                { $add: [currentVersion, 1] }
                            ]
                        }
                    }
                }],
                { upsert: true, returnDocument: "after" }
            );

            const user = resultDocument(result);

            return {
                enabled: user.enabled,
                version: user.version
            };
        },

        async getClientGrant(uid, clientId) {
            assertUid(uid);
            const hash = clientHash(clientId);
            await ensureIndexes();

            const user = await users.findOne({ _id: uid });
            return grantFromUser(user, hash, uid, clientId);
        },

        async listClientGrants(uid) {
            assertUid(uid);
            await ensureIndexes();

            const user = await users.findOne({ _id: uid });
            const grants = user && Array.isArray(user.grants)
                ? user.grants
                : [];

            for (const grant of grants) {
                if (grant.uid !== uid ||
                    typeof grant.clientId !== "string" ||
                    grant.clientHash !== clientHash(grant.clientId)) {
                    throw new Error(
                        "OAuth grant collection contains an inconsistent record"
                    );
                }
            }

            return grants;
        },

        async setClientGrant(uid, clientId, data) {
            assertUid(uid);
            const hash = clientHash(clientId);
            assertObject(data, "grant data");
            await ensureIndexes();
            await ensureUser(uid);

            const result = await users.findOneAndUpdate(
                { _id: uid },
                grantUpdatePipeline(uid, clientId, hash, data, Date.now()),
                { returnDocument: "after" }
            );

            return grantFromUser(
                resultDocument(result),
                hash,
                uid,
                clientId
            );
        },

        async revokeClientGrant(uid, clientId) {
            assertUid(uid);
            const hash = clientHash(clientId);
            await ensureIndexes();

            const now = Date.now();

            const result = await users.findOneAndUpdate(
                {
                    _id: uid,
                    grants: {
                        $elemMatch: {
                            clientHash: hash,
                            clientId,
                            uid
                        }
                    }
                },
                [{
                    $set: {
                        grants: {
                            $map: {
                                input: "$grants",
                                as: "grant",
                                in: {
                                    $cond: [
                                        { $eq: ["$$grant.clientHash", hash] },
                                        {
                                            $mergeObjects: [
                                                "$$grant",
                                                {
                                                    enabled: false,
                                                    version: {
                                                        $add: [
                                                            "$$grant.version",
                                                            {
                                                                $cond: [
                                                                    "$$grant.enabled",
                                                                    1,
                                                                    0
                                                                ]
                                                            }
                                                        ]
                                                    },
                                                    updatedAt: {
                                                        $cond: [
                                                            "$$grant.enabled",
                                                            now,
                                                            "$$grant.updatedAt"
                                                        ]
                                                    }
                                                }
                                            ]
                                        },
                                        "$$grant"
                                    ]
                                }
                            }
                        }
                    }
                }],
                { returnDocument: "after" }
            );

            return grantFromUser(
                resultDocument(result),
                hash,
                uid,
                clientId
            );
        },

        async getConsentTransaction(id) {
            assertHash(id, "transaction hash");
            await ensureIndexes();

            const user = await users.findOne({ "consents.id": id });

            if (!user) {
                return null;
            }

            const transaction = (user.consents || []).find(
                item => item.id === id
            );

            if (!transaction || transaction.expiresAt <= new Date()) {
                return null;
            }

            const publicTransaction = { ...transaction };
            delete publicTransaction.id;
            delete publicTransaction.expiresAt;

            return publicTransaction;
        },

        async createConsentTransaction(id, data, ttlSeconds) {
            assertHash(id, "transaction hash");
            assertTtl(ttlSeconds);
            assertObject(data, "consent transaction data");
            assertUid(data.uid);
            assertClientId(data.clientId);
            assertHash(data.sessionBindingHash, "sessionBindingHash");
            await ensureIndexes();
            await ensureUser(data.uid);

            const now = new Date();

            // Consent IDs are globally unique. Remove an expired transaction
            // even if it belongs to a different user document.
            await users.updateMany(
                { "consents.id": id },
                {
                    $pull: {
                        consents: {
                            id,
                            expiresAt: { $lte: now }
                        }
                    }
                }
            );

            // Also clean up other expired transactions for this user.
            await users.updateOne(
                { _id: data.uid },
                { $pull: { consents: { expiresAt: { $lte: now } } } }
            );

            try {
                const result = await users.updateOne(
                    {
                        _id: data.uid,
                        "consents.id": { $ne: id }
                    },
                    {
                        $push: {
                            consents: {
                                ...data,
                                id,
                                expiresAt: new Date(
                                    Date.now() + ttlSeconds * 1000
                                )
                            }
                        }
                    }
                );

                return result.modifiedCount > 0;
            } catch (error) {
                if (duplicateKey(error)) {
                    return false;
                }

                throw error;
            }
        },

        async approveConsentTransaction(id, expected, grantData) {
            assertHash(id, "transaction hash");
            assertObject(expected, "expected transaction data");
            assertUid(expected.uid);
            assertClientId(expected.clientId);
            assertHash(expected.sessionBindingHash, "sessionBindingHash");

            if (typeof expected.metadataFingerprint !== "string" ||
                !expected.metadataFingerprint) {
                throw new TypeError(
                    "metadataFingerprint must be a non-empty string"
                );
            }

            assertObject(grantData, "grant data");
            await ensureIndexes();

            const now = new Date();

            const user = await users.findOne({
                _id: expected.uid,
                "consents.id": id
            });

            if (!user) {
                return { status: "missing", grant: null };
            }

            const transaction = (user.consents || []).find(
                item => item.id === id
            );

            if (!transaction || transaction.expiresAt <= now) {
                return { status: "missing", grant: null };
            }

            if (
                transaction.uid !== expected.uid ||
                transaction.sessionBindingHash !== expected.sessionBindingHash ||
                transaction.clientId !== expected.clientId ||
                transaction.metadataFingerprint !== expected.metadataFingerprint
            ) {
                return { status: "mismatch", grant: null };
            }

            if (user.enabled === false) {
                await users.updateOne(
                    { _id: expected.uid, enabled: false, "consents.id": id },
                    { $pull: { consents: { id } } }
                );

                return { status: "disabled", grant: null };
            }

            const hash = clientHash(expected.clientId);

            const filter = {
                _id: expected.uid,
                enabled: { $ne: false },
                consents: {
                    $elemMatch: {
                        id,
                        uid: expected.uid,
                        clientId: expected.clientId,
                        sessionBindingHash: expected.sessionBindingHash,
                        metadataFingerprint: expected.metadataFingerprint,
                        expiresAt: { $gt: now }
                    }
                }
            };

            const pipeline = grantUpdatePipeline(
                expected.uid,
                expected.clientId,
                hash,
                grantData,
                Date.now()
            );

            pipeline.push({
                $set: {
                    consents: {
                        $filter: {
                            input: { $ifNull: ["$consents", []] },
                            as: "consent",
                            cond: { $ne: ["$$consent.id", id] }
                        }
                    }
                }
            });

            const result = await users.findOneAndUpdate(
                filter,
                pipeline,
                { returnDocument: "after" }
            );

            const updatedUser = resultDocument(result);

            if (!updatedUser) {
                const status = await classifyConsent(id, expected);

                if (status === "disabled") {
                    await users.updateOne(
                        {
                            _id: expected.uid,
                            enabled: false,
                            "consents.id": id
                        },
                        { $pull: { consents: { id } } }
                    );
                }

                return {
                    status: status === "retry" ? "missing" : status,
                    grant: null
                };
            }

            return {
                status: "approved",
                grant: grantFromUser(
                    updatedUser,
                    hash,
                    expected.uid,
                    expected.clientId
                )
            };
        },

        async consumeConsentTransaction(id, expected) {
            assertHash(id, "transaction hash");
            assertObject(expected, "expected transaction data");
            assertUid(expected.uid);
            assertClientId(expected.clientId);
            assertHash(expected.sessionBindingHash, "sessionBindingHash");
            await ensureIndexes();

            const result = await users.updateOne(
                {
                    _id: expected.uid,
                    consents: {
                        $elemMatch: {
                            id,
                            uid: expected.uid,
                            sessionBindingHash: expected.sessionBindingHash,
                            clientId: expected.clientId,
                            expiresAt: { $gt: new Date() }
                        }
                    }
                },
                { $pull: { consents: { id } } }
            );

            return result.modifiedCount > 0;
        }
    });
}

module.exports = {
    createMongoAdapter,
    collections: COLLECTIONS
};
