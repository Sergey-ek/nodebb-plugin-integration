"use strict";

define("admin/plugins/integration", ["alerts"], function (Alerts) {
    const ACP = {};

    ACP.init = function () {
        const container = $(".acp-page-container");
        const form = container.find("form");
        const saveButton = $("#save");

        saveButton.on("click", function () {
            const values = {};

            form.find("[name]").each(function () {
                const field = $(this);
                const name = field.attr("name");

                if (field.is("select[multiple]")) {
                    values[name] = field.val() || [];
                } else if (field.is(":checkbox")) {
                    values[name] = field.is(":checked");
                } else if (field.attr("type") === "number") {
                    values[name] = Number(field.val());
                } else {
                    values[name] = field.val();
                }
            });

            for (const name of ["openaiApiKey", "mcpBearerToken"]) {
                if (typeof values[name] !== "string" || !values[name].trim()) {
                    delete values[name];
                }
            }

            saveButton.prop("disabled", true);

            socket.emit("plugins.integration.save", values, function (error, result) {
                saveButton.prop("disabled", false);

                if (error) {
                    Alerts.error(error.message || "Failed to save settings");
                    return;
                }

                form.find('[name="openaiApiKey"], [name="mcpBearerToken"]').val("");

                container.find(".integration-save-status").remove();

                $("<div>", {
                    class: "alert alert-success integration-save-status",
                    text: result ? "Settings saved successfully" : "Settings saved"
                }).insertBefore(form);
            });
        });
    };

    return ACP;
});
