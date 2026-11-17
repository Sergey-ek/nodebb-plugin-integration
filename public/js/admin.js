"use strict";

define(
    "admin/plugins/integration",
    ["alerts", "translator"],
    function (Alerts, translator) {
        const ACP = {};

        function tx(key) {
            return translator.translate(
                `[[integration:${key}]]`
            );
        }

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

                socket.emit(
                    "plugins.integration.save",
                    values,
                    async function (error, result) {
                        saveButton.prop("disabled", false);

                        if (error) {
                            Alerts.error(
                                error.message || await tx("admin-error-save")
                            );
                            return;
                        }

                        if (result && result.mcpBearerToken) {
                            tokenField.val(result.mcpBearerToken);
                        }

                        form.find('[name="openaiApiKey"]').val("");
                        showStatus(await tx("admin-saved"), true);
                    }
                );
            });

            $("#copyMcpBearerToken").on("click", async function () {
                const token = tokenField.val();

                if (!token) {
                    Alerts.error(await tx("admin-no-token"));
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

                    showStatus(await tx("admin-token-copied"), true);
                } catch (error) {
                    Alerts.error(await tx("admin-copy-error"));
                }
            });

            $("#regenerateMcpBearerToken").on(
                "click",
                async function () {
                    const confirmed = window.confirm(
                        await tx("admin-confirm-regenerate")
                    );

                    if (!confirmed) {
                        return;
                    }

                    const button = $(this);
                    button.prop("disabled", true);

                    socket.emit(
                        "plugins.integration.regenerateBearerToken",
                        {},
                        async function (error, result) {
                            button.prop("disabled", false);

                            if (error) {
                                Alerts.error(
                                    error.message ||
                                    await tx("admin-error-regenerate")
                                );
                                return;
                            }

                            if (result && result.mcpBearerToken) {
                                tokenField.val(result.mcpBearerToken);
                                showStatus(
                                    await tx("admin-token-generated"),
                                    true
                                );
                            } else {
                                Alerts.error(
                                    await tx("admin-token-missing")
                                );
                            }
                        }
                    );
                }
            );
        };

        return ACP;
    }
);
