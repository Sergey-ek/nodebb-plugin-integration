"use strict";

define("admin/plugins/integration", ["alerts"], function (Alerts) {
    const ACP = {};

    ACP.init = function () {
        const container = $(".acp-page-container");
        const form = container.find("form");
        const saveButton = $("#save");
        const tokenField = form.find('[name="mcpBearerToken"]');

        function showStatus(message, success) {
            container.find(".integration-save-status").remove();

            $("<div>", {
                class: "alert " + (
                    success ? "alert-success" : "alert-danger"
                ) + " integration-save-status",
                text: message
            }).insertBefore(form);
        }

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

            if (!values.openaiApiKey || !values.openaiApiKey.trim()) {
                delete values.openaiApiKey;
            }

            saveButton.prop("disabled", true);

            socket.emit("plugins.integration.save", values, function (error, result) {
                saveButton.prop("disabled", false);

                if (error) {
                    Alerts.error(error.message || "Failed to save settings");
                    return;
                }

                if (result && result.mcpBearerToken) {
                    tokenField.val(result.mcpBearerToken);
                }

                form.find('[name="openaiApiKey"]').val("");
                showStatus("Settings saved successfully", true);
            });
        });

        $("#copyMcpBearerToken").on("click", async function () {
            const token = tokenField.val();

            if (!token) {
                Alerts.error("There is no Bearer token to copy");
                return;
            }

            try {
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    await navigator.clipboard.writeText(token);
                } else {
                    tokenField.trigger("focus").trigger("select");
                    if (!document.execCommand("copy")) {
                        throw new Error("Clipboard copy failed");
                    }
                }

                showStatus("Bearer token copied", true);
            } catch (error) {
                Alerts.error("Could not copy the token: " + error.message);
            }
        });

        $("#regenerateMcpBearerToken").on("click", function () {
            if (!window.confirm(
                "Regenerate the MCP Bearer token? The previous token will stop working immediately."
            )) {
                return;
            }

            const button = $(this);
            button.prop("disabled", true);

            socket.emit(
                "plugins.integration.regenerateBearerToken",
                {},
                function (error, result) {
                    button.prop("disabled", false);

                    if (error) {
                        Alerts.error(
                            error.message || "Failed to regenerate Bearer token"
                        );
                        return;
                    }

                    if (result && result.mcpBearerToken) {
                        tokenField.val(result.mcpBearerToken);
                        showStatus("New Bearer token generated", true);
                    } else {
                        Alerts.error("Server did not return the new token");
                    }
                }
            );
        });
    };

    return ACP;
});
