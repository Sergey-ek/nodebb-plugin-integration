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
});

describe("Internal API operations", () => {
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
