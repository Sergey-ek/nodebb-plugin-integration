"use strict";

const assert = require("node:assert/strict");
const { describe, it } = require("mocha");
const proxyquire = require("proxyquire").noCallThru();

function createApi(overrides = {}) {
    const deps = {
        Config: { async get() {
            return { mcpEnabled: true, internalApiToken: "test-token",
                mcpServiceUid: 7 };
        } },
        OAuthStorage: {
            get() {
                return {
                    async getAccessToken() { return null; },
                    async getRefreshFamily() { return null; }
                };
            }
        },
        Tokens: { hashToken(token) { return `hash:${token}`; } },
        Permissions: {
            async getCurrentPermissionSnapshot() {
                return {
                    active: true,
                    userAccessVersion: 1,
                    grantVersion: 1,
                    metadataFingerprint: "a".repeat(64)
                };
            }
        },
        Search: { async searchText() { return []; } },
        Categories: {},
        Meta: { async getInfo() { return {}; } },
        Posts: {
            async getPostMeta() { return null; },
            async getPostContent() { return null; },
            async getUserPostIds() { return []; },
            async deletePost() { return {}; }
        },
        Topics: {
            async getTopic() { return null; },
            async createTopic(data) { return data; },
            async createReply(data) { return data; },
            async deleteTopic() { return {}; },
            async restoreTopic() { return {}; },
            async listTopics() { return { topicCount: 0, topics: [] }; },
            async getTopicPosts() { return []; }
        },
        Users: { async getUser() { return null; } },
        Privileges: {
            async canReadTopic() { return true; },
            async canReadPost() { return true; }
        },
        ...overrides
    };

    const API = proxyquire("../src/routes/api", {
        "../config": deps.Config,
        "../oauth/storage/runtime": deps.OAuthStorage,
        "../oauth/tokens": deps.Tokens,
        "../oauth/permissions": deps.Permissions,
        "../ai/search": deps.Search,
        "../nodebb/categories": deps.Categories,
        "../nodebb/meta": deps.Meta,
        "../nodebb/posts": deps.Posts,
        "../nodebb/topics": deps.Topics,
        "../nodebb/users": deps.Users,
        "../nodebb/privileges": deps.Privileges
    });

    return { API, deps };
}

function response() {
    return {
        statusCode: 200,
        body: undefined,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(data) {
            this.body = data;
            return this;
        }
    };
}

function request(body = {}) {
    return {
        body,
        headers: {},
        integrationSettings: { mcpServiceUid: 7 }
    };
}

async function runOAuthAuthentication({
    record,
    family,
    storageError = false,
    permissionSnapshot,
    permissionError = false
}) {
    const { API } = createApi({
        Config: { async get() {
            return { mcpEnabled: true, internalApiToken: "test-token", authMode: "oauth" };
        } },
        OAuthStorage: {
            get() {
                if (storageError) throw new Error("Redis unavailable");
                return {
                    async getAccessToken() { return record; },
                    async getRefreshFamily() { return family; }
                };
            }
        },
        Permissions: {
            async getCurrentPermissionSnapshot() {
                if (permissionError) {
                    throw new Error("Permission storage unavailable");
                }

                return permissionSnapshot || {
                    active: true,
                    userAccessVersion: 1,
                    grantVersion: 1,
                    metadataFingerprint: "a".repeat(64)
                };
            }
        }
    });

    const req = request();
    req.headers.authorization = "Bearer test-token";
    req.headers["x-mcp-user-token"] = "A".repeat(43);
    const res = response();
    let called = false;

    await API.internalAuth(req, res, () => { called = true; });

    return { req, res, called };
}

describe("Internal API authentication", () => {
    it("accepts a valid bearer token", async () => {
        const { API } = createApi();
        const req = request();
        req.headers.authorization = "Bearer test-token";
        const res = response();
        let called = false;

        await API.internalAuth(req, res, () => {
            called = true;
        });

        assert.equal(called, true);
        assert.equal(req.integrationSettings.mcpServiceUid, 7);
    });

    it("rejects an invalid token", async () => {
        const { API } = createApi();
        const req = request();
        req.headers.authorization = "Bearer wrong-token";
        const res = response();

        await API.internalAuth(req, res, () => {
            assert.fail("next must not be called");
        });

        assert.equal(res.statusCode, 401);
    });

    it("rejects requests when MCP is disabled", async () => {
        const { API } = createApi({
            Config: { async get() {
                return { mcpEnabled: false, internalApiToken: "test-token" };
            } }
        });
        const req = request();
        req.headers.authorization = "Bearer test-token";
        const res = response();

        await API.internalAuth(req, res, () => {
            assert.fail("next must not be called");
        });

        assert.equal(res.statusCode, 403);
    });

    it("authenticates an OAuth user and takes UID from the stored access token", async () => {
        const clientId = "https://client.example/metadata";
        const familyId = "a".repeat(32);
        const storage = {
            async getAccessToken(hash) {
                assert.equal(hash, "hash:" + "A".repeat(43));
                return {
                    uid: 42,
                    clientId,
                    scopes: ["mcp"],
                    familyId,
                    userAccessVersion: 1,
                    grantVersion: 1,
                    metadataFingerprint: "a".repeat(64)
                };
            },
            async getRefreshFamily(id) {
                assert.equal(id, familyId);
                return {
                    uid: 42,
                    clientId,
                    scopes: ["mcp"],
                    revoked: false,
                    userAccessVersion: 1,
                    grantVersion: 1,
                    metadataFingerprint: "a".repeat(64)
                };
            }
        };
        const { API } = createApi({
            Config: { async get() {
                return { mcpEnabled: true, internalApiToken: "test-token", authMode: "oauth" };
            } },
            OAuthStorage: { get() { return storage; } }
        });
        const req = request();
        req.headers.authorization = "Bearer test-token";
        req.headers["x-mcp-user-token"] = "A".repeat(43);
        const res = response();
        let called = false;

        await API.internalAuth(req, res, () => { called = true; });

        assert.equal(called, true);
        assert.equal(req.integrationUserUid, 42);
        assert.equal(req.integrationSettings.authMode, "oauth");
    });

    it("rejects OAuth requests without a user access token", async () => {
        const { API } = createApi({
            Config: { async get() {
                return { mcpEnabled: true, internalApiToken: "test-token", authMode: "oauth" };
            } }
        });
        const req = request();
        req.headers.authorization = "Bearer test-token";
        const res = response();

        await API.internalAuth(req, res, () => assert.fail("next must not be called"));

        assert.equal(res.statusCode, 401);
    });

    it("rejects an unknown or expired OAuth access token", async () => {
        const { API } = createApi({
            Config: { async get() {
                return { mcpEnabled: true, internalApiToken: "test-token", authMode: "oauth" };
            } }
        });
        const req = request();
        req.headers.authorization = "Bearer test-token";
        req.headers["x-mcp-user-token"] = "B".repeat(43);
        const res = response();

        await API.internalAuth(req, res, () => assert.fail("next must not be called"));

        assert.equal(res.statusCode, 401);
    });

    it("rejects an OAuth token whose refresh family has been revoked", async () => {
        const clientId = "https://client.example/metadata";
        const familyId = "b".repeat(32);
        const { API } = createApi({
            Config: { async get() {
                return { mcpEnabled: true, internalApiToken: "test-token", authMode: "oauth" };
            } },
            OAuthStorage: { get() {
                return {
                    async getAccessToken() {
                        return { uid: 42, clientId, scopes: ["mcp"], familyId };
                    },
                    async getRefreshFamily() {
                        return { uid: 42, clientId, scopes: ["mcp"], revoked: true };
                    }
                };
            } }
        });
        const req = request();
        req.headers.authorization = "Bearer test-token";
        req.headers["x-mcp-user-token"] = "C".repeat(43);
        const res = response();

        await API.internalAuth(req, res, () => assert.fail("next must not be called"));

        assert.equal(res.statusCode, 401);
    });

    it("rejects an OAuth token when its UID differs from the refresh family", async () => {
        const clientId = "https://client.example/metadata";
        const familyId = "c".repeat(32);
        const { API } = createApi({
            Config: { async get() {
                return { mcpEnabled: true, internalApiToken: "test-token", authMode: "oauth" };
            } },
            OAuthStorage: { get() {
                return {
                    async getAccessToken() {
                        return { uid: 42, clientId, scopes: ["mcp"], familyId };
                    },
                    async getRefreshFamily() {
                        return { uid: 99, clientId, scopes: ["mcp"], revoked: false };
                    }
                };
            } }
        });
        const req = request();
        req.headers.authorization = "Bearer test-token";
        req.headers["x-mcp-user-token"] = "D".repeat(43);
        const res = response();

        await API.internalAuth(req, res, () => assert.fail("next must not be called"));

        assert.equal(res.statusCode, 401);
    });

    it("rejects an OAuth access token without the mcp scope", async () => {
        const clientId = "https://client.example/metadata";
        const familyId = "d".repeat(32);
        const result = await runOAuthAuthentication({
            record: { uid: 42, clientId, scopes: [], familyId },
            family: { uid: 42, clientId, scopes: [], revoked: false }
        });

        assert.equal(result.called, false);
        assert.equal(result.res.statusCode, 401);
    });

    it("rejects additional scopes outside the fixed mcp scope", async () => {
        const clientId = "https://client.example/metadata";
        const familyId = "e".repeat(32);
        const result = await runOAuthAuthentication({
            record: { uid: 42, clientId, scopes: ["mcp", "admin"], familyId },
            family: { uid: 42, clientId, scopes: ["mcp", "admin"], revoked: false }
        });

        assert.equal(result.called, false);
        assert.equal(result.res.statusCode, 401);
    });

    it("rejects different scopes in the access token and refresh family", async () => {
        const clientId = "https://client.example/metadata";
        const familyId = "f".repeat(32);
        const result = await runOAuthAuthentication({
            record: { uid: 42, clientId, scopes: ["mcp"], familyId },
            family: { uid: 42, clientId, scopes: ["mcp", "admin"], revoked: false }
        });

        assert.equal(result.called, false);
        assert.equal(result.res.statusCode, 401);
    });

    it("rejects an access token with an empty client ID", async () => {
        const familyId = "1".repeat(32);
        const result = await runOAuthAuthentication({
            record: { uid: 42, clientId: "", scopes: ["mcp"], familyId },
            family: { uid: 42, clientId: "", scopes: ["mcp"], revoked: false }
        });

        assert.equal(result.called, false);
        assert.equal(result.res.statusCode, 401);
    });

    it("rejects an access token with an invalid refresh family ID", async () => {
        const clientId = "https://client.example/metadata";
        const result = await runOAuthAuthentication({
            record: { uid: 42, clientId, scopes: ["mcp"], familyId: "invalid" },
            family: { uid: 42, clientId, scopes: ["mcp"], revoked: false }
        });

        assert.equal(result.called, false);
        assert.equal(result.res.statusCode, 401);
    });

    it("rejects an OAuth token after global MCP access is disabled", async () => {
        const clientId = "https://client.example/metadata";
        const familyId = "2".repeat(32);
        const result = await runOAuthAuthentication({
            record: {
                uid: 42, clientId, scopes: ["mcp"], familyId,
                userAccessVersion: 1, grantVersion: 1,
                metadataFingerprint: "a".repeat(64)
            },
            family: {
                uid: 42, clientId, scopes: ["mcp"], revoked: false,
                userAccessVersion: 1, grantVersion: 1,
                metadataFingerprint: "a".repeat(64)
            },
            permissionSnapshot: {
                active: false,
                reason: "user_access_disabled"
            }
        });

        assert.equal(result.called, false);
        assert.equal(result.res.statusCode, 401);
    });

    it("rejects an OAuth token after its client grant is revoked", async () => {
        const clientId = "https://client.example/metadata";
        const familyId = "3".repeat(32);
        const result = await runOAuthAuthentication({
            record: {
                uid: 42, clientId, scopes: ["mcp"], familyId,
                userAccessVersion: 1, grantVersion: 1,
                metadataFingerprint: "a".repeat(64)
            },
            family: {
                uid: 42, clientId, scopes: ["mcp"], revoked: false,
                userAccessVersion: 1, grantVersion: 1,
                metadataFingerprint: "a".repeat(64)
            },
            permissionSnapshot: {
                active: false,
                reason: "grant_disabled"
            }
        });

        assert.equal(result.called, false);
        assert.equal(result.res.statusCode, 401);
    });

    it("rejects an OAuth token with an outdated permission version", async () => {
        const clientId = "https://client.example/metadata";
        const familyId = "4".repeat(32);
        const result = await runOAuthAuthentication({
            record: {
                uid: 42, clientId, scopes: ["mcp"], familyId,
                userAccessVersion: 1, grantVersion: 1,
                metadataFingerprint: "a".repeat(64)
            },
            family: {
                uid: 42, clientId, scopes: ["mcp"], revoked: false,
                userAccessVersion: 1, grantVersion: 1,
                metadataFingerprint: "a".repeat(64)
            },
            permissionSnapshot: {
                active: true,
                userAccessVersion: 2,
                grantVersion: 1,
                metadataFingerprint: "a".repeat(64)
            }
        });

        assert.equal(result.called, false);
        assert.equal(result.res.statusCode, 401);
    });

    it("rejects an OAuth token when CIMD metadata fingerprint changes", async () => {
        const clientId = "https://client.example/metadata";
        const familyId = "5".repeat(32);
        const result = await runOAuthAuthentication({
            record: {
                uid: 42, clientId, scopes: ["mcp"], familyId,
                userAccessVersion: 1, grantVersion: 1,
                metadataFingerprint: "a".repeat(64)
            },
            family: {
                uid: 42, clientId, scopes: ["mcp"], revoked: false,
                userAccessVersion: 1, grantVersion: 1,
                metadataFingerprint: "a".repeat(64)
            },
            permissionSnapshot: {
                active: true,
                userAccessVersion: 1,
                grantVersion: 1,
                metadataFingerprint: "b".repeat(64)
            }
        });

        assert.equal(result.called, false);
        assert.equal(result.res.statusCode, 401);
    });

    it("returns 503 when the current permission snapshot cannot be read", async () => {
        const clientId = "https://client.example/metadata";
        const familyId = "6".repeat(32);
        const result = await runOAuthAuthentication({
            record: {
                uid: 42, clientId, scopes: ["mcp"], familyId,
                userAccessVersion: 1, grantVersion: 1,
                metadataFingerprint: "a".repeat(64)
            },
            family: {
                uid: 42, clientId, scopes: ["mcp"], revoked: false,
                userAccessVersion: 1, grantVersion: 1,
                metadataFingerprint: "a".repeat(64)
            },
            permissionError: true
        });

        assert.equal(result.called, false);
        assert.equal(result.res.statusCode, 503);
    });

    it("returns 503 when OAuth storage is unavailable", async () => {
        const { API } = createApi({
            Config: { async get() {
                return { mcpEnabled: true, internalApiToken: "test-token", authMode: "oauth" };
            } },
            OAuthStorage: { get() { throw new Error("Redis unavailable"); } }
        });
        const req = request();
        req.headers.authorization = "Bearer test-token";
        req.headers["x-mcp-user-token"] = "E".repeat(43);
        const res = response();

        await API.internalAuth(req, res, () => assert.fail("next must not be called"));

        assert.equal(res.statusCode, 503);
    });
});

describe("Internal API operations", () => {
    it("uses the authenticated OAuth UID instead of a UID supplied in the request body", async () => {
        let received;
        const { API } = createApi({
            Topics: {
                async createTopic(data) {
                    received = data;
                    return { tid: 15 };
                }
            }
        });
        const req = request({
            uid: 999,
            cid: 3,
            title: "OAuth topic",
            content: "Topic body"
        });
        req.integrationSettings = { authMode: "oauth", mcpServiceUid: 7 };
        req.integrationUserUid = 42;
        const res = response();

        await API.internalCreateTopic(req, res);

        assert.equal(res.statusCode, 200);
        assert.equal(received.uid, 42);
        assert.notEqual(received.uid, 999);
    });

    it("rejects invalid OAuth UIDs before calling NodeBB", async () => {
        for (const invalidUid of [0, -1, "invalid", Number.MAX_SAFE_INTEGER + 1]) {
            let called = false;
            const { API } = createApi({
                Topics: {
                    async createTopic() {
                        called = true;
                        return { tid: 15 };
                    }
                }
            });
            const req = request({
                cid: 3,
                title: "OAuth topic",
                content: "Topic body"
            });
            req.integrationSettings = { authMode: "oauth", mcpServiceUid: 7 };
            req.integrationUserUid = invalidUid;
            const res = response();

            await API.internalCreateTopic(req, res);

            assert.equal(res.statusCode, 400, `UID ${String(invalidUid)} must be rejected`);
            assert.equal(called, false, `NodeBB must not be called for UID ${String(invalidUid)}`);
        }
    });

    it("continues using the configured service UID in legacy mode", async () => {
        let received;
        const { API } = createApi({
            Topics: {
                async createTopic(data) {
                    received = data;
                    return { tid: 15 };
                }
            }
        });
        const req = request({
            uid: 999,
            cid: 3,
            title: "Legacy topic",
            content: "Topic body"
        });
        req.integrationSettings = { authMode: "legacy", mcpServiceUid: 7 };
        req.integrationUserUid = 42;
        const res = response();

        await API.internalCreateTopic(req, res);

        assert.equal(res.statusCode, 200);
        assert.equal(received.uid, 7);
    });

    it("creates a topic using the configured service user", async () => {
        let received;
        const { API } = createApi({
            Topics: {
                async createTopic(data) {
                    received = data;
                    return { tid: 15 };
                }
            }
        });
        const req = request({
            cid: 3,
            title: "  Test topic  ",
            content: "Topic body",
            tags: ["test"]
        });
        const res = response();

        await API.internalCreateTopic(req, res);

        assert.deepEqual(received, {
            uid: 7,
            cid: 3,
            title: "Test topic",
            content: "Topic body",
            tags: ["test"]
        });
        assert.deepEqual(res.body, { tid: 15 });
    });

    it("rejects invalid topic data without calling NodeBB", async () => {
        let called = false;
        const { API } = createApi({
            Topics: {
                async createTopic() {
                    called = true;
                }
            }
        });
        const res = response();

        await API.internalCreateTopic(request({
            cid: 0,
            title: "",
            content: "body"
        }), res);

        assert.equal(res.statusCode, 400);
        assert.equal(called, false);
    });

    it("calculates topic pagination", async () => {
        let received;
        const { API } = createApi({
            Topics: {
                async listTopics(params) {
                    received = params;
                    return { topicCount: 45, topics: [{ tid: 1 }] };
                }
            }
        });
        const res = response();

        await API.internalListTopics(request({
            start: 20,
            limit: 10,
            sort: "recent",
            cid: 4
        }), res);

        assert.deepEqual(received, {
            uid: 7,
            start: 20,
            stop: 29,
            sort: "recent",
            cid: 4
        });
        assert.equal(res.body.nextStart, 30);
        assert.equal(res.body.hasMore, true);
    });

    it("checks topic read permission before listing posts", async () => {
        let called = false;
        const { API } = createApi({
            Privileges: {
                async canReadTopic() { return false; }
            },
            Topics: {
                async getTopicPosts() {
                    called = true;
                    return [];
                }
            }
        });
        const res = response();

        await API.internalListPosts(request({ tid: 12 }), res);

        assert.equal(res.statusCode, 404);
        assert.equal(called, false);
    });

    it("returns post pagination metadata", async () => {
        let received;
        const { API } = createApi({
            Topics: {
                async getTopic() {
                    return { tid: 12, postcount: 55, deleted: 0 };
                },
                async getTopicPosts(...args) {
                    received = args;
                    return [{ pid: 100 }];
                }
            }
        });
        const res = response();

        await API.internalListPosts(request({
            tid: 12,
            start: 20,
            limit: 10,
            reverse: true
        }), res);

        assert.deepEqual(received, [12, 7, 20, 10, true]);
        assert.equal(res.body.total, 55);
        assert.equal(res.body.nextStart, 30);
        assert.equal(res.body.hasMore, true);
    });

    it("deletes replies but skips topic main posts and adjusts nextStart", async () => {
        const deleted = [];
        const { API } = createApi({
            Posts: {
                async getUserPostIds() {
                    return [101, 102, 103];
                },
                async getPostMeta(pid) {
                    return { pid, uid: 20, tid: pid === 102 ? 2 : 1 };
                },
                async deletePost(pid, uid) {
                    deleted.push({ pid, uid });
                }
            },
            Topics: {
                async getTopic(tid) {
                    return { tid, mainPid: tid === 2 ? 102 : 999 };
                }
            }
        });
        const res = response();

        await API.internalDeleteUserPosts(request({
            uid: 20,
            start: 0,
            limit: 3
        }), res);

        assert.deepEqual(deleted, [
            { pid: 101, uid: 7 },
            { pid: 103, uid: 7 }
        ]);
        assert.equal(res.body.scanned, 3);
        assert.equal(res.body.deleted, 2);
        assert.equal(res.body.skipped, 1);
        assert.equal(res.body.nextStart, 1);
    });

    it("rejects invalid bulk deletion parameters", async () => {
        let called = false;
        const { API } = createApi({
            Posts: {
                async getUserPostIds() {
                    called = true;
                    return [];
                }
            }
        });
        const res = response();

        await API.internalDeleteUserPosts(request({
            uid: -1
        }), res);

        assert.equal(res.statusCode, 400);
        assert.equal(called, false);
    });


    it("creates a reply using the configured service user", async () => {
        let received;
        const { API } = createApi({
            Topics: {
                async createReply(data) {
                    received = data;
                    return { pid: 201, tid: data.tid };
                }
            }
        });
        const res = response();

        await API.internalCreatePost(request({
            tid: 15,
            content: "Reply body"
        }), res);

        assert.deepEqual(received, {
            uid: 7,
            tid: 15,
            content: "Reply body"
        });
        assert.deepEqual(res.body, { pid: 201, tid: 15 });
    });

    it("rejects invalid reply data without calling NodeBB", async () => {
        let called = false;
        const { API } = createApi({
            Topics: {
                async createReply() {
                    called = true;
                }
            }
        });
        const res = response();

        await API.internalCreatePost(request({
            tid: 15,
            content: "   "
        }), res);

        assert.equal(res.statusCode, 400);
        assert.equal(called, false);
    });

    it("edits a post using the configured service user", async () => {
        let received;
        const { API } = createApi({
            Posts: {
                async editPost(...args) {
                    received = args;
                    return { pid: 201, edited: true };
                }
            }
        });
        const res = response();

        await API.internalEditPost(request({
            pid: 201,
            content: "Updated body"
        }), res);

        assert.deepEqual(received, [201, 7, "Updated body"]);
        assert.deepEqual(res.body, { pid: 201, edited: true });
    });

    it("deletes a post using the configured service user", async () => {
        let received;
        const { API } = createApi({
            Posts: {
                async deletePost(...args) {
                    received = args;
                    return { pid: 201, deleted: true };
                }
            }
        });
        const res = response();

        await API.internalDeletePost(request({ pid: 201 }), res);

        assert.deepEqual(received, [201, 7]);
        assert.deepEqual(res.body, { pid: 201, deleted: true });
    });

    it("restores a post using the configured service user", async () => {
        let received;
        const { API } = createApi({
            Posts: {
                async restorePost(...args) {
                    received = args;
                    return { pid: 201, restored: true };
                }
            }
        });
        const res = response();

        await API.internalRestorePost(request({ pid: 201 }), res);

        assert.deepEqual(received, [201, 7]);
        assert.deepEqual(res.body, { pid: 201, restored: true });
    });

    it("deletes a topic using the configured service user", async () => {
        let received;
        const { API } = createApi({
            Topics: {
                async deleteTopic(...args) {
                    received = args;
                    return { tid: 15, isDelete: true };
                }
            }
        });
        const res = response();

        await API.internalDeleteTopic(request({ tid: 15 }), res);

        assert.deepEqual(received, [15, 7]);
        assert.deepEqual(res.body, { tid: 15, isDelete: true });
    });

    it("restores a topic using the configured service user", async () => {
        let received;
        const { API } = createApi({
            Topics: {
                async restoreTopic(...args) {
                    received = args;
                    return { tid: 15, isDelete: false };
                }
            }
        });
        const res = response();

        await API.internalRestoreTopic(request({ tid: 15 }), res);

        assert.deepEqual(received, [15, 7]);
        assert.deepEqual(res.body, { tid: 15, isDelete: false });
    });



    it("continues bulk deletion after individual failures and skips invalid posts", async () => {
        const deleted = [];
        const { API } = createApi({
            Posts: {
                async getUserPostIds() {
                    return [201, 202, 203, 204, "invalid"];
                },
                async getPostMeta(pid) {
                    if (pid === 201) return { pid, uid: 20, tid: 1, deleted: 1 };
                    if (pid === 202) return { pid, uid: 99, tid: 1, deleted: 0 };
                    return { pid, uid: 20, tid: 1, deleted: 0 };
                },
                async deletePost(pid, uid) {
                    if (pid === 203) throw new Error("Permission denied");
                    deleted.push({ pid, uid });
                }
            },
            Topics: {
                async getTopic(tid) {
                    return { tid, mainPid: 999 };
                }
            }
        });
        const res = response();

        await API.internalDeleteUserPosts(request({
            uid: 20,
            start: 0,
            limit: 5
        }), res);

        assert.deepEqual(deleted, [{ pid: 204, uid: 7 }]);
        assert.equal(res.body.scanned, 5);
        assert.equal(res.body.deleted, 1);
        assert.equal(res.body.skipped, 3);
        assert.deepEqual(res.body.failed, [{
            pid: 203,
            error: "Permission denied"
        }]);
        assert.equal(res.body.nextStart, 4);
    });

    it("returns an API error when bulk post enumeration fails", async () => {
        const { API } = createApi({
            Posts: {
                async getUserPostIds() {
                    throw new Error("Database unavailable");
                }
            }
        });
        const res = response();

        await API.internalDeleteUserPosts(request({ uid: 20 }), res);

        assert.equal(res.statusCode, 400);
        assert.equal(typeof res.body.error, "string");
    });

});
