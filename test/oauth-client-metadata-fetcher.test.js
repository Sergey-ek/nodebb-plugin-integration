"use strict";

const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { describe, it } = require("mocha");

const Fetcher = require("../src/oauth/client-metadata-fetcher");

const CLIENT_ID = "https://example.com/oauth/client.json";

const metadata = {
    client_id: CLIENT_ID,
    client_name: "Test MCP Client",
    redirect_uris: ["http://127.0.0.1:3000/callback"],
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none"
};

function mockRequest(statusCode, body, headers = {}) {
    let capturedOptions;

    const request = (url, options, callback) => {
        capturedOptions = options;

        const req = new EventEmitter();
        req.end = () => {
            process.nextTick(() => {
                const response = new EventEmitter();

                response.statusCode = statusCode;
                response.headers = {
                    "content-type": "application/json",
                    ...headers
                };
                response.resume = () => {};
                response.destroy = () => {};

                callback(response);

                if (body !== null) {
                    response.emit("data", Buffer.from(body));
                }

                response.emit("end");
            });
        };

        req.destroy = () => {};
        return req;
    };

    return {
        request,
        getOptions: () => capturedOptions
    };
}

function publicLookup() {
    return async () => [
        { address: "8.8.8.8", family: 4 }
    ];
}

describe("OAuth client metadata fetcher", function () {
    it("accepts public IP addresses", function () {
        assert.equal(Fetcher.isPublicAddress("8.8.8.8"), true);
        assert.equal(
            Fetcher.isPublicAddress("2606:4700:4700::1111"),
            true
        );
    });

    it("rejects private and special IP addresses", function () {
        for (const address of [
            "127.0.0.1",
            "10.0.0.1",
            "172.16.0.1",
            "192.168.1.1",
            "169.254.1.1",
            "100.64.0.1",
            "::1",
            "fc00::1",
            "fe80::1",
            "::ffff:127.0.0.1"
        ]) {
            assert.equal(
                Fetcher.isPublicAddress(address),
                false,
                address
            );
        }
    });

    it("rejects DNS results containing private addresses", async function () {
        await assert.rejects(
            Fetcher.resolvePublicAddresses("example.com", async () => [
                { address: "8.8.8.8", family: 4 },
                { address: "192.168.1.1", family: 4 }
            ]),
            /non-public/
        );
    });

    it("rejects empty DNS results", async function () {
        await assert.rejects(
            Fetcher.resolvePublicAddresses("example.com", async () => []),
            /no DNS addresses/
        );
    });

    it("rejects invalid DNS address families", async function () {
        await assert.rejects(
            Fetcher.resolvePublicAddresses("example.com", async () => [
                { address: "8.8.8.8", family: 6 }
            ]),
            /family/
        );
    });

    it("pins HTTPS lookup to validated addresses", function () {
        const lookup = Fetcher.createPinnedLookup([
            { address: "8.8.8.8", family: 4 },
            { address: "2606:4700:4700::1111", family: 6 }
        ]);

        lookup("example.com", {}, (error, address, family) => {
            assert.ifError(error);
            assert.equal(address, "8.8.8.8");
            assert.equal(family, 4);
        });

        lookup("example.com", { all: true }, (error, addresses) => {
            assert.ifError(error);
            assert.equal(addresses.length, 2);
        });

        lookup("example.com", { family: 6 }, (error, address, family) => {
            assert.ifError(error);
            assert.equal(address, "2606:4700:4700::1111");
            assert.equal(family, 6);
        });
    });

    it("fetches and validates client metadata", async function () {
        const mock = mockRequest(200, JSON.stringify(metadata));
        const fetcher = Fetcher.createFetcher({
            lookup: publicLookup(),
            request: mock.request
        });

        const result = await fetcher.fetchClientMetadata(CLIENT_ID);

        assert.equal(result.clientId, CLIENT_ID);
        assert.equal(result.clientName, "Test MCP Client");
        assert.equal(result.redirectUris.length, 1);

        const options = mock.getOptions();

        assert.equal(options.protocol, "https:");
        assert.equal(options.hostname, "example.com");
        assert.equal(options.port, 443);
        assert.equal(options.rejectUnauthorized, true);
        assert.equal(options.agent, false);
        assert.equal(typeof options.lookup, "function");
    });

    it("does not request metadata when DNS resolves privately", async function () {
        let requested = false;

        const fetcher = Fetcher.createFetcher({
            lookup: async () => [
                { address: "127.0.0.1", family: 4 }
            ],
            request: () => {
                requested = true;
                throw new Error("Must not make request");
            }
        });

        await assert.rejects(
            fetcher.fetchClientMetadata(CLIENT_ID),
            /non-public/
        );

        assert.equal(requested, false);
    });

    it("rejects redirects", async function () {
        const mock = mockRequest(302, "");

        const fetcher = Fetcher.createFetcher({
            lookup: publicLookup(),
            request: mock.request
        });

        await assert.rejects(
            fetcher.fetchClientMetadata(CLIENT_ID),
            /HTTP 302/
        );
    });

    it("rejects non-JSON responses", async function () {
        const mock = mockRequest(
            200,
            JSON.stringify(metadata),
            { "content-type": "text/html" }
        );

        const fetcher = Fetcher.createFetcher({
            lookup: publicLookup(),
            request: mock.request
        });

        await assert.rejects(
            fetcher.fetchClientMetadata(CLIENT_ID),
            /not JSON/
        );
    });

    it("rejects compressed responses", async function () {
        const mock = mockRequest(
            200,
            JSON.stringify(metadata),
            { "content-encoding": "gzip" }
        );

        const fetcher = Fetcher.createFetcher({
            lookup: publicLookup(),
            request: mock.request
        });

        await assert.rejects(
            fetcher.fetchClientMetadata(CLIENT_ID),
            /Compressed/
        );
    });

    it("rejects oversized responses", async function () {
        const mock = mockRequest(
            200,
            JSON.stringify(metadata),
            { "content-length": "100000" }
        );

        const fetcher = Fetcher.createFetcher({
            lookup: publicLookup(),
            request: mock.request,
            maxBytes: 1024
        });

        await assert.rejects(
            fetcher.fetchClientMetadata(CLIENT_ID),
            /too large/
        );
    });

    it("rejects malformed JSON", async function () {
        const mock = mockRequest(200, "{invalid json");

        const fetcher = Fetcher.createFetcher({
            lookup: publicLookup(),
            request: mock.request
        });

        await assert.rejects(
            fetcher.fetchClientMetadata(CLIENT_ID),
            /Invalid OAuth metadata JSON/
        );
    });

    it("rejects metadata belonging to another client", async function () {
        const mock = mockRequest(
            200,
            JSON.stringify({
                ...metadata,
                client_id: "https://other.example/client.json"
            })
        );

        const fetcher = Fetcher.createFetcher({
            lookup: publicLookup(),
            request: mock.request
        });

        await assert.rejects(
            fetcher.fetchClientMetadata(CLIENT_ID),
            /does not match/
        );
    });

    it("rejects IP-literal client ID hosts", async function () {
        const fetcher = Fetcher.createFetcher({
            lookup: publicLookup(),
            request: () => {
                throw new Error("Must not make request");
            }
        });

        await assert.rejects(
            fetcher.fetchClientMetadata(
                "https://8.8.8.8/oauth/client.json"
            ),
            /DNS hostname/
        );
    });

    it("validates timeout and size configuration", function () {
        assert.throws(
            () => Fetcher.createFetcher({ timeoutMs: 0 }),
            /timeout/
        );

        assert.throws(
            () => Fetcher.createFetcher({ maxBytes: -1 }),
            /size limit/
        );
    });
});
