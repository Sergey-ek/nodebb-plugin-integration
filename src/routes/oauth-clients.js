"use strict";

const OAuthStorage = require("../oauth/storage/runtime");

function getUid(req) {
    const uid = Number(req.uid);
    return Number.isSafeInteger(uid) && uid > 0 ? uid : 0;
}

async function ownsProfile(req, res) {
    const uid = getUid(req);
    const userslug = req.params && req.params.userslug;

    if (!uid || !userslug) {
        res.status(403).render("403", { title: "Forbidden" });
        return false;
    }

    const User = nodebb.require("./src/user");
    const currentSlug = await User.getUserField(uid, "userslug");

    if (!currentSlug || currentSlug !== userslug) {
        res.status(403).render("403", { title: "Forbidden" });
        return false;
    }

    return true;
}

exports.render = async function (req, res) {
    try {
        if (!await ownsProfile(req, res)) {
            return;
        }

        const storage = OAuthStorage.get();
        const uid = getUid(req);

        const [grants, userAccess] = await Promise.all([
            storage.listClientGrants(uid),
            storage.getUserAccess(uid)
        ]);

        return res.render("account/integration", {
            title: "Connected applications",
            userslug: req.params.userslug,
            userAccessEnabled: userAccess.enabled === true,
            grants: grants.map(grant => ({
                clientId: grant.clientId,
                clientName: grant.clientName || grant.clientId,
                enabled: grant.enabled === true
            }))
        });
    } catch (error) {
        console.error("[Integration] OAuth client list failed:", error);
        return res.status(500).render("500", {
            title: "Integration error"
        });
    }
};

exports.setAccess = async function (req, res) {
    try {
        if (!await ownsProfile(req, res)) {
            return;
        }

        const value = req.body && req.body.enabled;

        if (value !== "true" && value !== "false") {
            return res.status(400).send("Invalid access state");
        }

        await OAuthStorage.get().setUserAccess(
            getUid(req),
            value === "true"
        );

        const pageUrl = req.originalUrl.replace(/\/access(?:\?.*)?$/, "");
        return res.redirect(303, pageUrl);
    } catch (error) {
        console.error("[Integration] OAuth user access update failed:", error);
        return res.status(500).render("500", {
            title: "Integration error"
        });
    }
};

exports.revoke = async function (req, res) {
    try {
        if (!await ownsProfile(req, res)) {
            return;
        }

        const clientId = req.body && req.body.clientId;

        if (typeof clientId !== "string" || !clientId) {
            return res.status(400).send("Invalid client ID");
        }

        await OAuthStorage.get().revokeClientGrant(getUid(req), clientId);

        const pageUrl = req.originalUrl.replace(/\/revoke(?:\?.*)?$/, "");
        return res.redirect(303, pageUrl);
    } catch (error) {
        console.error("[Integration] OAuth client revocation failed:", error);
        return res.status(500).render("500", {
            title: "Integration error"
        });
    }
};
