"use strict";

const dns = require("node:dns").promises;
const https = require("node:https");
const net = require("node:net");
const ipaddr = require("ipaddr.js");

const ClientMetadata = require("./client-metadata");

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_MAX_BYTES = 64 * 1024;

function isPublicAddress(address) {
    try {
        const parsed = ipaddr.process(address);
        return parsed.range() === "unicast";
    } catch {
        return false;
    }
}

async function resolvePublicAddresses(hostname, lookup = dns.lookup) {
    const records = await lookup(hostname, {
        all: true,
        verbatim: true
    });

    if (!Array.isArray(records) || records.length === 0) {
        throw new Error("OAuth client hostname has no DNS addresses");
    }

    const validated = [];

    for (const record of records) {
        if (
            !record ||
            typeof record.address !== "string" ||
            ![4, 6].includes(record.family) ||
            !isPublicAddress(record.address)
        ) {
            throw new Error(
                "OAuth client hostname resolves to a non-public IP address"
            );
        }

        const actualFamily = net.isIP(record.address);

        if (actualFamily !== record.family) {
            throw new Error("Invalid OAuth client DNS address family");
        }

        validated.push({
            address: record.address,
            family: record.family
        });
    }

    return validated;
}

function createPinnedLookup(records) {
    if (!Array.isArray(records) || records.length === 0) {
        throw new TypeError("At least one validated DNS address is required");
    }

    return function pinnedLookup(hostname, options, callback) {
        if (typeof options === "function") {
            callback = options;
            options = {};
        }

        const requestedFamily = options && options.family
            ? options.family
            : 0;

        const candidates = records.filter(record =>
            !requestedFamily || record.family === requestedFamily
        );

        if (!candidates.length) {
            const error = new Error("No validated address for requested family");
            error.code = "EAI_ADDRFAMILY";
            callback(error);
            return;
        }

        if (options && options.all) {
            callback(null, candidates.map(record => ({ ...record })));
            return;
        }

        callback(
            null,
            candidates[0].address,
            candidates[0].family
        );
    };
}

function createFetcher(options = {}) {
    const lookup = options.lookup || dns.lookup;
    const request = options.request || https.request;
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;

    if (!Number.isInteger(timeoutMs) || timeoutMs < 1) {
        throw new TypeError("Invalid OAuth metadata timeout");
    }

    if (!Number.isInteger(maxBytes) || maxBytes < 1) {
        throw new TypeError("Invalid OAuth metadata size limit");
    }

    async function fetchClientMetadata(clientId) {
        ClientMetadata.validateClientId(clientId);

        const url = new URL(clientId);
        const hostname = url.hostname.replace(/^\[|\]$/g, "");

        if (net.isIP(hostname)) {
            throw new Error("OAuth CIMD hostname must be a DNS hostname");
        }

        const addresses = await resolvePublicAddresses(hostname, lookup);
        const pinnedLookup = createPinnedLookup(addresses);

        const metadata = await new Promise((resolve, reject) => {
            let settled = false;

            function finish(error, value) {
                if (settled) return;
                settled = true;

                if (error) reject(error);
                else resolve(value);
            }

            const requestOptions = {
                protocol: "https:",
                hostname,
                port: 443,
                method: "GET",
                path: `${url.pathname}${url.search}`,
                headers: {
                    Accept: "application/json",
                    "Accept-Encoding": "identity",
                    "User-Agent": "NodeBB-Integration-OAuth/1.0"
                },
                lookup: pinnedLookup,
                servername: hostname,
                rejectUnauthorized: true,
                agent: false,
                signal: AbortSignal.timeout(timeoutMs)
            };

            let req;

            try {
                req = request(url, requestOptions, response => {
                    const status = response.statusCode;

                    if (status !== 200) {
                        response.resume();
                        finish(
                            new Error(
                                `OAuth metadata server returned HTTP ${status}`
                            )
                        );
                        return;
                    }

                    const contentType = String(
                        response.headers["content-type"] || ""
                    ).split(";")[0].trim().toLowerCase();

                    if (contentType !== "application/json") {
                        response.resume();
                        finish(
                            new Error("OAuth metadata response is not JSON")
                        );
                        return;
                    }

                    const encoding = String(
                        response.headers["content-encoding"] || "identity"
                    ).toLowerCase();

                    if (encoding !== "identity") {
                        response.resume();
                        finish(
                            new Error("Compressed OAuth metadata is not supported")
                        );
                        return;
                    }

                    const contentLength = response.headers["content-length"];

                    if (
                        contentLength !== undefined &&
                        (!/^\d+$/.test(String(contentLength)) ||
                            Number(contentLength) > maxBytes)
                    ) {
                        response.resume();
                        finish(
                            new Error("OAuth metadata response is too large")
                        );
                        return;
                    }

                    const chunks = [];
                    let totalBytes = 0;

                    response.on("data", chunk => {
                        if (settled) return;

                        const buffer = Buffer.isBuffer(chunk)
                            ? chunk
                            : Buffer.from(chunk);

                        totalBytes += buffer.length;

                        if (totalBytes > maxBytes) {
                            response.destroy();
                            finish(
                                new Error("OAuth metadata response is too large")
                            );
                            return;
                        }

                        chunks.push(buffer);
                    });

                    response.on("end", () => {
                        if (settled) return;

                        try {
                            const body = Buffer.concat(chunks);
                            const text = new TextDecoder(
                                "utf-8",
                                { fatal: true }
                            ).decode(body);

                            finish(null, JSON.parse(text));
                        } catch {
                            finish(
                                new Error("Invalid OAuth metadata JSON")
                            );
                        }
                    });

                    response.on("error", error => finish(error));
                });
            } catch (error) {
                finish(error);
                return;
            }

            req.on("error", error => finish(error));
            req.end();
        });

        return ClientMetadata.validateClientMetadata(clientId, metadata);
    }

    return Object.freeze({ fetchClientMetadata });
}

const defaultFetcher = createFetcher();

module.exports = {
    DEFAULT_TIMEOUT_MS,
    DEFAULT_MAX_BYTES,
    isPublicAddress,
    resolvePublicAddresses,
    createPinnedLookup,
    createFetcher,
    fetchClientMetadata: defaultFetcher.fetchClientMetadata
};
