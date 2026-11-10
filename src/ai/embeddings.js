"use strict";

const OpenAI = require("./openai");

const MAX_TEXT_LENGTH = 30000;

function normalizeText(value) {
    if (typeof value !== "string") {
        return "";
    }

    return value
        .replace(/<[^>]*>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/\s+/g, " ")
        .trim();
}

function preparePost(post) {
    if (!post || typeof post !== "object") {
        throw new TypeError("Post is required");
    }

    const content = normalizeText(post.content);

    if (!content) {
        return "";
    }

    return content.slice(0, MAX_TEXT_LENGTH);
}

async function create(text) {
    return OpenAI.createEmbedding(text);
}

module.exports = {
    normalizeText,
    preparePost,
    create,
    MAX_TEXT_LENGTH
};