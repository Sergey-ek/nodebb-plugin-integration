"use strict";

const assert = require("node:assert/strict");
const { describe, it, afterEach } = require("mocha");
const proxyquire = require("proxyquire").noCallThru();

const previousNodebb = global.nodebb;

afterEach(() => {
    if (previousNodebb === undefined) {
        delete global.nodebb;
    } else {
        global.nodebb = previousNodebb;
    }
});

function createHarness(options = {}) {
    const captured = {
        uid: null,
        enabled: null
    };

    const User = {
        async getUserField(uid, field) {
            assert.equal(field, "userslug");
            return options.userslug || (uid === 42 ? "akant" : "other");
        }
    };

    global.nodebb = {
        require: () => User
    };

    const route = proxyquire("../src/routes/oauth-clients", {
        "../oauth/storage/runtime": {
            get: () => ({
                async setUserAccess(uid, enabled) {
                    captured.uid = uid;
                    captured.enabled = enabled;
                }
            })
        }
    });

    const response = {
        statusCode: 200,
        redirectCode: null,
        redirectUrl: null,
        renderedView: null,
        body: null,

        status(code) {
            this.statusCode = code;
            return this;
        },

        render(view) {
            this.renderedView = view;
            return this;
        },

        send(body) {
            this.body = body;
            return this;
        },

        redirect(code, url) {
            this.redirectCode = code;
            this.redirectUrl = url;
            return this;
        }
    };

    const request = {
        uid: 42,
        params: { userslug: "akant" },
        body: { enabled: "false" },
        originalUrl: "/user/akant/integration/access"
    };

    return { route, captured, request, response };
}

describe("OAuth connected applications access route", () => {
    it("allows the profile owner to disable MCP access", async () => {
        const { route, captured, request, response } = createHarness();

        await route.setAccess(request, response);

        assert.equal(captured.uid, 42);
        assert.equal(captured.enabled, false);
        assert.equal(response.redirectCode, 303);
        assert.equal(response.redirectUrl, "/user/akant/integration");
    });

    it("allows the profile owner to enable MCP access", async () => {
        const { route, captured, request, response } = createHarness();

        request.body.enabled = "true";

        await route.setAccess(request, response);

        assert.equal(captured.uid, 42);
        assert.equal(captured.enabled, true);
        assert.equal(response.redirectCode, 303);
    });

    it("rejects attempts to change another user's access", async () => {
        const { route, captured, request, response } = createHarness();

        request.params.userslug = "other";

        await route.setAccess(request, response);

        assert.equal(response.statusCode, 403);
        assert.equal(response.renderedView, "403");
        assert.equal(captured.uid, null);
    });

    it("rejects invalid access values", async () => {
        const { route, captured, request, response } = createHarness();

        request.body.enabled = "yes";

        await route.setAccess(request, response);

        assert.equal(response.statusCode, 400);
        assert.equal(response.body, "Invalid access state");
        assert.equal(captured.uid, null);
    });

    it("rejects requests without an authenticated user", async () => {
        const { route, captured, request, response } = createHarness();

        request.uid = 0;

        await route.setAccess(request, response);

        assert.equal(response.statusCode, 403);
        assert.equal(response.renderedView, "403");
        assert.equal(captured.uid, null);
    });
});
