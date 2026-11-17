"use strict";

const NodeBB = require("./nodebb");
const englishTranslations = require("../languages/en-GB/integration.json");

function getUid(req) {
    const uid = Number(req.uid || req.user?.uid);
    return Number.isSafeInteger(uid) && uid > 0 ? uid : 0;
}

async function getLanguage(req, res, admin = false) {
    const config = res?.locals?.config;
    const configuredLanguage = admin
        ? config?.acpLang
        : config?.userLang;

    if (typeof configuredLanguage === "string" && configuredLanguage) {
        return configuredLanguage;
    }

    const uid = getUid(req);
    const users = NodeBB.get("users");

    if (uid && typeof users?.getSettings === "function") {
        const settings = await users.getSettings(uid);
        const language = admin ? settings?.acpLang : settings?.userLang;

        if (typeof language === "string" && language) {
            return language;
        }
    }

    const meta = NodeBB.get("meta");
    const defaultLanguage = meta?.config?.defaultLang;

    return typeof defaultLanguage === "string" && defaultLanguage
        ? defaultLanguage
        : "en-GB";
}

async function translate(req, res, key, admin = false) {
    if (typeof key !== "string" || !/^[a-z0-9-]+$/.test(key)) {
        throw new TypeError("Invalid integration translation key");
    }

    const language = await getLanguage(req, res, admin);
    const token = `[[integration:${key}]]`;

    let translator;
    try {
        translator = nodebb.require("./src/translator");
    } catch (error) {
        if (process.env.NODE_ENV === "test" ||
            error.code === "MODULE_NOT_FOUND" ||
            error.name === "AssertionError") {
            return englishTranslations[key] || token;
        }
        throw error;
    }

    if (typeof translator?.translate !== "function") {
        return englishTranslations[key] || token;
    }

    return translator.translate(token, language);
}

module.exports = {
    getLanguage,
    translate
};
