"use strict";

const path = require("node:path");
const { fork } = require("node:child_process");
const Config = require("../config");

const SERVER_PATH = path.join(__dirname, "server.js");
const CHECK_INTERVAL = 3000;
const SHUTDOWN_TIMEOUT = 3000;
const STOP_TIMEOUT = 5000;

let child = null;
let timer = null;
let lastSignature = null;
let initialized = false;
let refreshRequested = false;
let refreshPromise = null;
let stopPromise = null;
let shuttingDown = false;

function isPrimaryWorker() {
    try {
        const nconf = nodebb.require("nconf");
        const value = nconf.get("isPrimary");

        if (value !== undefined && value !== null) {
            return value === true || value === "true";
        }
    } catch (error) {
        // Fall back to the worker environment.
    }

    const value = process.env.isPrimary;

    return value === undefined || value === "true";
}

function isExited(processRef) {
    return processRef.exitCode !== null || processRef.signalCode !== null;
}

function waitForExit(processRef, timeout = STOP_TIMEOUT) {
    if (isExited(processRef)) {
        return Promise.resolve();
    }

    return new Promise((resolve) => {
        let settled = false;

        const finish = () => {
            if (settled) {
                return;
            }

            settled = true;
            clearTimeout(timerRef);
            processRef.removeListener("exit", finish);
            processRef.removeListener("close", finish);
            resolve();
        };

        const timerRef = setTimeout(() => {
            if (!isExited(processRef)) {
                console.warn("[NodeBB Integration] MCP process did not exit; sending SIGKILL");

                try {
                    processRef.kill("SIGKILL");
                } catch (error) {
                    console.error(
                        "[NodeBB Integration] Failed to kill MCP process:",
                        error.message
                    );
                }
            }

            if (isExited(processRef)) {
                finish();
            }
        }, timeout);

        timerRef.unref();
        processRef.once("exit", finish);
        processRef.once("close", finish);
    });
}
function requestShutdown(processRef) {
    return new Promise((resolve) => {
        let settled = false;

        const finish = () => {
            if (settled) {
                return;
            }

            settled = true;
            clearTimeout(timerRef);
            processRef.removeListener("message", onMessage);
            processRef.removeListener("exit", finish);
            resolve();
        };

        const onMessage = (message) => {
            if (message?.type === "shutdown-complete") {
                finish();
            }
        };

        const timerRef = setTimeout(() => {
            console.warn("[NodeBB Integration] MCP shutdown handshake timed out");

            if (!isExited(processRef)) {
                try {
                    processRef.kill("SIGTERM");
                } catch (error) {
                    console.error(
                        "[NodeBB Integration] Failed to terminate MCP process:",
                        error.message
                    );
                }
            }

            finish();
        }, SHUTDOWN_TIMEOUT);

        timerRef.unref();

        processRef.once("message", onMessage);
        processRef.once("exit", finish);

        if (!processRef.connected || isExited(processRef)) {
            finish();
            return;
        }

        try {
            processRef.send({ type: "shutdown" }, (error) => {
                if (error) {
                    console.error(
                        "[NodeBB Integration] Failed to send MCP shutdown:",
                        error.message
                    );

                    if (!isExited(processRef)) {
                        processRef.kill("SIGTERM");
                    }

                    finish();
                }
            });
        } catch (error) {
            console.error(
                "[NodeBB Integration] MCP shutdown IPC error:",
                error.message
            );

            if (!isExited(processRef)) {
                processRef.kill("SIGTERM");
            }

            finish();
        }
    });
}

async function stopChild() {
    if (stopPromise) {
        return stopPromise;
    }

    if (!child) {
        lastSignature = null;
        return;
    }

    const previous = child;

    child = null;
    lastSignature = null;

    stopPromise = (async () => {
        if (!isExited(previous)) {
            await requestShutdown(previous);
        }

        if (!isExited(previous)) {
            try {
                previous.kill("SIGTERM");
            } catch (error) {
                console.error(
                    "[NodeBB Integration] Failed to stop MCP process:",
                    error.message
                );
            }
        }

        await waitForExit(previous);
    })();

    try {
        await stopPromise;
    } finally {
        stopPromise = null;
    }
}

function startChild(config, signature) {
    const nextChild = fork(SERVER_PATH, [], {
        stdio: ["ignore", "inherit", "inherit", "ipc"]
    });

    child = nextChild;
    lastSignature = signature;

    nextChild.on("message", (message) => {
        if (child !== nextChild || !message) {
            return;
        }

        if (message.type === "configured") {
            console.log("[NodeBB Integration] MCP process configured");
        } else if (message.type === "configuration-error") {
            console.error(
                "[NodeBB Integration] MCP configuration failed:",
                message.message
            );

            lastSignature = null;
            nextChild.kill("SIGTERM");
        }
    });

    nextChild.on("error", (error) => {
        console.error(
            "[NodeBB Integration] MCP process error:",
            error.message
        );
    });

    nextChild.on("exit", (code, signal) => {
        if (child === nextChild) {
            child = null;
            lastSignature = null;
        }

        console.log(
            `[NodeBB Integration] MCP process exited (code=${code}, signal=${signal})`
        );
    });

    try {
        nextChild.send({
            type: "configure",
            config: {
                nodebbUrl: config.mcpNodebbUrl,
                internalApiToken: config.internalApiToken,
                bearerToken: config.mcpBearerToken,
                host: config.mcpHost,
                port: config.mcpPort
            }
        });
    } catch (error) {
        console.error(
            "[NodeBB Integration] Failed to configure MCP process:",
            error.message
        );

        lastSignature = null;
        nextChild.kill("SIGTERM");
    }
}

async function syncConfiguration() {
    const config = await Config.get();

    if (!config.mcpEnabled) {
        if (child) {
            console.log("[NodeBB Integration] MCP disabled");
            await stopChild();
        }

        return;
    }

    if (!config.mcpBearerToken || !config.internalApiToken) {
        console.error(
            "[NodeBB Integration] MCP is enabled but required secrets are missing"
        );

        await stopChild();
        return;
    }

    const signature = JSON.stringify({
        nodebbUrl: config.mcpNodebbUrl,
        internalApiToken: config.internalApiToken,
        bearerToken: config.mcpBearerToken,
        host: config.mcpHost,
        port: config.mcpPort
    });

    if (child && child.connected && signature === lastSignature) {
        return;
    }

    if (child) {
        console.log("[NodeBB Integration] MCP configuration changed");
        await stopChild();
    }

    console.log("[NodeBB Integration] Starting MCP process");
    startChild(config, signature);
}

function refresh() {
    if (shuttingDown || !isPrimaryWorker()) {
        return Promise.resolve();
    }

    refreshRequested = true;

    if (refreshPromise) {
        return refreshPromise;
    }

    refreshPromise = (async () => {
        try {
            while (refreshRequested && !shuttingDown) {
                refreshRequested = false;
                await syncConfiguration().catch((error) => {
                    console.error(
                        "[NodeBB Integration] MCP manager error:",
                        error.message
                    );
                });
            }
        } finally {
            refreshPromise = null;

            if (refreshRequested && !shuttingDown) {
                refresh().catch((error) => {
                    console.error(
                        "[NodeBB Integration] MCP refresh failed:",
                        error.message
                    );
                });
            }
        }
    })();

    return refreshPromise;
}

function init() {
    if (initialized || !isPrimaryWorker()) {
        return;
    }

    initialized = true;
    shuttingDown = false;

    refresh().catch((error) => {
        console.error(
            "[NodeBB Integration] MCP startup failed:",
            error.message
        );
    });

    timer = setInterval(refresh, CHECK_INTERVAL);
    timer.unref();

}

async function shutdown() {
    shuttingDown = true;
    refreshRequested = false;

    if (timer) {
        clearInterval(timer);
        timer = null;
    }

    if (refreshPromise) {
        await refreshPromise;
    }

    await stopChild();

    initialized = false;
}

module.exports = {
    init,
    refresh,
    shutdown,
    isPrimaryWorker
};
