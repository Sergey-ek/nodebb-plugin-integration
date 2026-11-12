"use strict";

const http = require("node:http");
const crypto = require("node:crypto");

const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const {
    StreamableHTTPServerTransport
} = require("@modelcontextprotocol/sdk/server/streamableHttp.js");

const Tools = require("./tools");

let httpServer = null;
let mcpServer = null;
let transport = null;
let messageQueue = Promise.resolve();
let shuttingDown = false;
let stopPromise = null;

function tokensMatch(expected, supplied) {
    if (typeof expected !== "string" || typeof supplied !== "string") {
        return false;
    }

    const expectedBuffer = Buffer.from(expected);
    const suppliedBuffer = Buffer.from(supplied);

    if (expectedBuffer.length !== suppliedBuffer.length) {
        return false;
    }

    return crypto.timingSafeEqual(expectedBuffer, suppliedBuffer);
}

function isAuthorized(authorization, expectedToken) {
    if (typeof authorization !== "string") {
        return false;
    }

    const match = authorization.match(/^Bearer\s+([^\s]+)$/i);

    return Boolean(match && tokensMatch(expectedToken, match[1]));
}

function createApiClient(config) {
    const baseUrl = config.nodebbUrl.replace(/\/+$/, "");

    return {
        async request(method, path, body) {
            const hasBody = body !== undefined &&
                !["GET", "HEAD"].includes(method.toUpperCase());

            const response = await fetch(`${baseUrl}${path}`, {
                method,
                headers: {
                    Authorization: `Bearer ${config.internalApiToken}`,
                    Accept: "application/json",
                    ...(hasBody ? { "Content-Type": "application/json" } : {})
                },
                ...(hasBody ? { body: JSON.stringify(body) } : {}),
                signal: AbortSignal.timeout(15000)
            });

            const responseText = await response.text();

            let result;

            try {
                result = responseText ? JSON.parse(responseText) : {};
            } catch {
                throw new Error(
                    `NodeBB returned an invalid JSON response (${response.status})`
                );
            }

            if (!response.ok) {
                const message = result.error || result.message ||
                    `NodeBB API request failed (${response.status})`;

                throw new Error(message);
            }

            return result;
        }
    };
}

function validateConfig(config) {
    if (!config || typeof config !== "object") {
        throw new Error("MCP configuration is missing");
    }

    if (typeof config.nodebbUrl !== "string") {
        throw new Error("A valid NodeBB HTTP URL is required");
    }

    let nodebbUrl;

    try {
        nodebbUrl = new URL(config.nodebbUrl);
    } catch {
        throw new Error("A valid NodeBB HTTP URL is required");
    }

    if (
        !["http:", "https:"].includes(nodebbUrl.protocol) ||
        !nodebbUrl.hostname ||
        nodebbUrl.username ||
        nodebbUrl.password ||
        nodebbUrl.search ||
        nodebbUrl.hash
    ) {
        throw new Error("A valid NodeBB HTTP URL is required");
    }

    if (
        typeof config.internalApiToken !== "string" ||
        !config.internalApiToken
    ) {
        throw new Error("NodeBB internal API token is missing");
    }

    if (
        typeof config.bearerToken !== "string" ||
        !config.bearerToken
    ) {
        throw new Error("MCP bearer token is missing");
    }

    if (typeof config.host !== "string" || !config.host.trim()) {
        throw new Error("MCP bind address is missing");
    }

    const port = Number(config.port);

    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error("MCP port is invalid");
    }

    return {
        nodebbUrl: config.nodebbUrl.replace(/\/+$/, ""),
        internalApiToken: config.internalApiToken,
        bearerToken: config.bearerToken,
        host: config.host.trim(),
        port
    };
}

function stop() {
    if (stopPromise) {
        return stopPromise;
    }

    stopPromise = (async () => {
        const previousHttpServer = httpServer;
        const previousTransport = transport;
        const previousMcpServer = mcpServer;

        httpServer = null;
        transport = null;
        mcpServer = null;

        if (previousHttpServer) {
            await new Promise((resolve) => {
                previousHttpServer.close(() => resolve());

                if (typeof previousHttpServer.closeAllConnections === "function") {
                    previousHttpServer.closeAllConnections();
                }
            });
        }

        if (previousTransport) {
            await previousTransport.close().catch(() => {});
        }

        if (previousMcpServer) {
            await previousMcpServer.close().catch(() => {});
        }
    })();

    return stopPromise.finally(() => {
        stopPromise = null;
    });
}

async function start(rawConfig) {
    const config = validateConfig(rawConfig);

    await stop();

    const api = createApiClient(config);
    let nextHttpServer = null;

    try {
        nextHttpServer = http.createServer(async (req, res) => {
            let pathname;

            try {
                pathname = new URL(
                    req.url || "/",
                    "http://localhost"
                ).pathname;
            } catch {
                res.writeHead(400, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: "Invalid request URL" }));
                return;
            }

            if (pathname !== "/mcp") {
                res.writeHead(404, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: "Not found" }));
                return;
            }

            const authorization = req.headers.authorization || "";

            if (!isAuthorized(authorization, config.bearerToken)) {
                res.writeHead(401, {
                    "Content-Type": "application/json",
                    "WWW-Authenticate": "Bearer"
                });
                res.end(JSON.stringify({ error: "Unauthorized" }));
                return;
            }

            let requestMcpServer = null;
            let requestTransport = null;

            try {
                requestMcpServer = new Server(
                    {
                        name: "nodebb-integration-mcp",
                        version: "0.6.1"
                    },
                    {
                        capabilities: {
                            tools: {}
                        }
                    }
                );

                requestTransport = new StreamableHTTPServerTransport({
                    sessionIdGenerator: undefined
                });

                Tools.register(requestMcpServer, api);

                await requestMcpServer.connect(requestTransport);
                await requestTransport.handleRequest(req, res);
            } catch (error) {
                console.error("[MCP] Request failed:", error.stack || error);

                if (!res.headersSent) {
                    res.writeHead(500, {
                        "Content-Type": "application/json"
                    });
                    res.end(JSON.stringify({ error: "MCP request failed" }));
                }
            } finally {
                if (requestTransport) {
                    await requestTransport.close().catch(() => {});
                }

                if (requestMcpServer) {
                    await requestMcpServer.close().catch(() => {});
                }
            }
        });

        await new Promise((resolve, reject) => {
            const onError = (error) => {
                nextHttpServer.removeListener("listening", onListening);
                reject(error);
            };

            const onListening = () => {
                nextHttpServer.removeListener("error", onError);
                resolve();
            };

            nextHttpServer.once("error", onError);
            nextHttpServer.once("listening", onListening);
            nextHttpServer.listen(config.port, config.host);
        });

        httpServer = nextHttpServer;

        console.log(
            `[MCP] Streamable HTTP listening on ${config.host}:${config.port}/mcp`
        );
    } catch (error) {
        if (nextHttpServer && nextHttpServer.listening) {
            await new Promise((resolve) => {
                nextHttpServer.close(() => resolve());
                nextHttpServer.closeAllConnections();
            });
        }

        throw error;
    }
}

async function sendShutdownComplete() {
    if (!process.send) {
        process.exit(0);
        return;
    }

    await new Promise((resolve) => {
        try {
            process.send({ type: "shutdown-complete" }, () => resolve());
        } catch (error) {
            console.error("[MCP] Failed to send shutdown confirmation:", error.message);
            resolve();
        }
    });

    process.exit(0);
}

async function handleMessage(message) {
    if (!message || typeof message !== "object") {
        return;
    }

    if (message.type === "configure") {
        if (shuttingDown) {
            return;
        }

        try {
            await start(message.config);

            if (process.send) {
                process.send({ type: "configured" });
            }
        } catch (error) {
            console.error("[MCP] Configuration failed:", error.message);

            if (process.send) {
                process.send({
                    type: "configuration-error",
                    message: error.message
                });
            }
        }

        return;
    }

    if (message.type === "shutdown") {
        shuttingDown = true;
        await stop();
        await sendShutdownComplete();
    }
}

function enqueueMessage(message) {
    messageQueue = messageQueue
        .then(() => handleMessage(message))
        .catch((error) => {
            console.error("[MCP] IPC error:", error.message);
        });

    return messageQueue;
}

if (require.main === module) {
    process.on("message", enqueueMessage);

    process.once("disconnect", async () => {
        if (shuttingDown) {
            return;
        }

        shuttingDown = true;
        await messageQueue;
        await stop();
        process.exit(0);
    });

    process.on("SIGTERM", async () => {
        shuttingDown = true;
        await messageQueue;
        await stop();
        process.exit(0);
    });

    process.on("SIGINT", async () => {
        shuttingDown = true;
        await messageQueue;
        await stop();
        process.exit(0);
    });
}

module.exports = {
    start,
    stop,
    createApiClient,
    validateConfig,
    tokensMatch,
    isAuthorized
};
