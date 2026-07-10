"use strict";

define("admin/plugins/integration", [
    "settings",
    "alerts"
], function (Settings, Alerts) {

    const ACP = {};

    ACP.init = function () {

        Settings.load(
            "nodebb-plugin-integration",
            $(".acp-page-container"),
            function () {

                console.log(
                    "[NodeBB Integration] settings loaded"
                );

            }
        );

        $("#save").on("click", function () {

            Settings.save(
                "nodebb-plugin-integration",
                $(".acp-page-container"),
                function () {

                    Alerts.success({
                        title: "NodeBB Integration",
                        message: "Settings saved"
                    });

                }
            );

        });

    };

    return ACP;

});