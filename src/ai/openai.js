"use strict";

const OpenAI = require("openai");
const Config = require("../config");

let client = null;
let clientKey = null;

async function getClient() {
    const settings = await Config.get();

    if (settings.aiProvider !== "openai") {
        const error = new Error(
            "OpenAI is disabled because AI provider is set to fake"
        );
        error.code = "AI_DISABLED";
        throw error;
    }

    if (!settings.openaiApiKey) {
        throw new Error("OpenAI API key is not configured");
    }

    if (client && clientKey === settings.openaiApiKey) {
        return client;
    }

    client = new OpenAI({
        apiKey: settings.openaiApiKey,
        timeout: 60000,
        maxRetries: 2
    });

    clientKey = settings.openaiApiKey;

    return client;
}

async function createEmbedding(input) {
    if (typeof input !== "string" || !input.trim()) {
        throw new TypeError("Embedding input must be a non-empty string");
    }

    const settings = await Config.get();
    const openai = await getClient();

    const response = await openai.embeddings.create({
        model: settings.openaiModel,
        input: input.trim(),
        dimensions: settings.embeddingSize,
        encoding_format: "float"
    });

    const embedding = response.data?.[0]?.embedding;

    if (!Array.isArray(embedding)) {
        throw new Error("OpenAI returned an invalid embedding");
    }

    if (embedding.length !== settings.embeddingSize) {
        throw new Error(
            `Embedding dimension mismatch: expected ${settings.embeddingSize}, received ${embedding.length}`
        );
    }

    if (!embedding.every(Number.isFinite)) {
        throw new Error("OpenAI returned non-finite embedding values");
    }

    return embedding;
}

module.exports = {
    createEmbedding
};