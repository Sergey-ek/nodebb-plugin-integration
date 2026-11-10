"use strict";

const assert = require("node:assert/strict");
const { describe, it } = require("mocha");
const proxyquire = require("proxyquire").noCallThru();

describe("MCP manager", () => {
    it("does not initialize on a worker process", () => {
        let forkCalls = 0;
        let timerCalls = 0;

        const manager = proxyquire("../src/mcp/manager", {
            "node:child_process": {
                fork() {
                    forkCalls++;
                    throw new Error("fork must not be called");
                }
            },
            "../config": {
                async get() {
                    return { mcpEnabled: true };
                }
            }
        });

        const originalNodebb = global.nodebb;
        const originalSetInterval = global.setInterval;

        try {
            global.nodebb = { require: (id) => {
                if (id === "nconf") {
                    return {
                        get(key) {
                            return key === "isPrimary" ? false : undefined;
                        }
                    };
                }
                throw new Error(`Unexpected NodeBB module: ${id}`);
            } };

            global.setInterval = () => {
                timerCalls++;
                throw new Error("setInterval must not be called");
            };

            assert.equal(manager.isPrimaryWorker(), false);
            manager.init();

            assert.equal(forkCalls, 0);
            assert.equal(timerCalls, 0);
        } finally {
            if (originalNodebb === undefined) delete global.nodebb;
            else global.nodebb = originalNodebb;
            global.setInterval = originalSetInterval;
        }
    });

    it("initializes on the primary process", async () => {
        let forkCalls = 0;
        let timerDelay = null;
        let timerUnref = false;
        let configCalls = 0;
        const signals = [];

        const manager = proxyquire("../src/mcp/manager", {
            "node:child_process": {
                fork() {
                    forkCalls++;
                    throw new Error("fork must not be called");
                }
            },
            "../config": {
                async get() {
                    configCalls++;
                    throw new Error("isolated test");
                }
            }
        });

        const originalNodebb = global.nodebb;
        const originalSetInterval = global.setInterval;
        const originalProcessOnce = process.once;

        try {
            global.nodebb = { require: (id) => {
                if (id === "nconf") {
                    return {
                        get(key) {
                            return key === "isPrimary" ? true : undefined;
                        }
                    };
                }
                throw new Error(`Unexpected NodeBB module: ${id}`);
            } };

            global.setInterval = (callback, delay) => {
                timerDelay = delay;
                return {
                    unref() {
                        timerUnref = true;
                    }
                };
            };

            process.once = (signal, handler) => {
                signals.push(signal);
                return process;
            };

            assert.equal(manager.isPrimaryWorker(), true);

            manager.init();
            await manager.refresh();

            assert.equal(configCalls > 0, true);
            assert.equal(timerDelay, 3000);
            assert.equal(timerUnref, true);
            assert.deepEqual(signals, []);
            assert.equal(forkCalls, 0);

            await manager.shutdown();
        } finally {
            if (originalNodebb === undefined) delete global.nodebb;
            else global.nodebb = originalNodebb;
            global.setInterval = originalSetInterval;
            process.once = originalProcessOnce;
        }
    });


    it("gracefully stops the child process", async () => {
        const { EventEmitter } = require("node:events");
        const messages = [];
        let forkCalls = 0;

        class FakeChild extends EventEmitter {
            constructor() {
                super();
                this.connected = true;
                this.exitCode = null;
                this.signalCode = null;
            }

            send(message, callback) {
                messages.push(message);

                if (message.type === "shutdown") {
                    if (callback) {
                        callback(null);
                    }

                    this.emit("message", {
                        type: "shutdown-complete"
                    });

                    this.connected = false;
                    this.exitCode = 0;
                    this.emit("exit", 0, null);
                }
            }

            kill(signal) {
                this.signalCode = signal;
                this.connected = false;
                this.emit("exit", null, signal);
            }
        }

        const fakeChild = new FakeChild();

        const manager = proxyquire("../src/mcp/manager", {
            "node:child_process": {
                fork() {
                    forkCalls++;
                    return fakeChild;
                }
            },
            "../config": {
                async get() {
                    return {
                        mcpEnabled: true,
                        mcpNodebbUrl: "http://localhost:4567",
                        internalApiToken: "i".repeat(32),
                        mcpBearerToken: "b".repeat(32),
                        mcpHost: "127.0.0.1",
                        mcpPort: 3000
                    };
                }
            }
        });

        const originalNodebb = global.nodebb;

        try {
            global.nodebb = { require: (id) => {
                if (id === "nconf") {
                    return {
                        get(key) {
                            return key === "isPrimary" ? true : undefined;
                        }
                    };
                }
                throw new Error(`Unexpected NodeBB module: ${id}`);
            } };

            await manager.refresh();
            assert.equal(forkCalls, 1);
            assert.equal(messages[0].type, "configure");

            await manager.shutdown();

            assert.equal(messages[1].type, "shutdown");
            assert.equal(fakeChild.exitCode, 0);
            assert.equal(fakeChild.signalCode, null);
        } finally {
            if (originalNodebb === undefined) delete global.nodebb;
            else global.nodebb = originalNodebb;
            await manager.shutdown();
        }
    });

});
