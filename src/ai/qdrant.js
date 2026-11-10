"use strict";

const { QdrantClient } = require("@qdrant/js-client-rest");
const Config = require("../config");

let client = null;
let clientUrl = null;

async function getClient() {
    const settings = await Config.get();

    if (settings.aiProvider !== "openai") {
        const error = new Error(
            "Qdrant is disabled because AI provider is set to fake"
        );
        error.code = "AI_DISABLED";
        throw error;
    }

    if (!settings.qdrantUrl) {
        throw new Error("Qdrant URL is not configured");
    }

    if (client && clientUrl === settings.qdrantUrl) {
        return client;
    }

    client = new QdrantClient({
        url: settings.qdrantUrl,
        timeout: 30000
    });

    clientUrl = settings.qdrantUrl;

    return client;
}

async function collectionExists(qdrant, collection) {
    const result = await qdrant.collectionExists(collection);
    return result.exists === true;
}

async function ensureCollection() {
    const settings = await Config.get();
    const qdrant = await getClient();

    if (!(await collectionExists(qdrant, settings.collection))) {
        await qdrant.createCollection(settings.collection, {
            vectors: {
                size: settings.embeddingSize,
                distance: "Cosine"
            }
        });

        return;
    }

    const info = await qdrant.getCollection(settings.collection);
    const vectors = info.config?.params?.vectors;

    if (
        !vectors ||
        typeof vectors.size !== "number" ||
        vectors.size !== settings.embeddingSize ||
        vectors.distance !== "Cosine"
    ) {
        throw new Error(
            "Qdrant collection has an incompatible vector configuration"
        );
    }
}

async function upsert(points) {
    if (!Array.isArray(points) || !points.length) {
        return;
    }

    const settings = await Config.get();
    const qdrant = await getClient();

    await qdrant.upsert(settings.collection, {
        wait: true,
        points
    });
}

async function search(vector, limit = 20) {
    if (!Array.isArray(vector)) {
        throw new TypeError("Search vector must be an array");
    }

    const settings = await Config.get();

    if (vector.length !== settings.embeddingSize) {
        throw new Error("Search vector dimension mismatch");
    }

    const qdrant = await getClient();

    if (!(await collectionExists(qdrant, settings.collection))) {
        return [];
    }

    const result = await qdrant.query(settings.collection, {
        query: vector,
        limit,
        with_payload: true,
        with_vector: false
    });

    return Array.isArray(result.points) ? result.points : [];
}

async function deletePoints(ids) {
    if (!Array.isArray(ids) || !ids.length) {
        return;
    }

    const settings = await Config.get();
    const qdrant = await getClient();

    if (!(await collectionExists(qdrant, settings.collection))) {
        return;
    }

    await qdrant.delete(settings.collection, {
        wait: true,
        points: ids
    });
}

async function deleteByFilter(filter) {
    if (
        !filter ||
        typeof filter !== "object" ||
        Array.isArray(filter)
    ) {
        throw new TypeError("Qdrant filter is required");
    }

    const settings = await Config.get();
    const qdrant = await getClient();

    if (!(await collectionExists(qdrant, settings.collection))) {
        return;
    }

    await qdrant.delete(settings.collection, {
        wait: true,
        filter
    });
}

module.exports = {
    getClient,
    ensureCollection,
    upsert,
    search,
    deletePoints,
    deleteByFilter
};
