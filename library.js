'use strict';

const routeHelpers = require.main.require('./src/routes/helpers');
const apiRoutes = require('./routes/api');

const Plugin = {};

Plugin.init = async ({ router }) => {

    // ACP page
    routeHelpers.setupAdminPageRoute(
        router,
        '/admin/plugins/nodebb-integration',
        (req, res) => {
            res.render('admin/plugins/nodebb-integration', {});
        }
    );

    // API
    apiRoutes(router);

    console.log('[nodebb-plugin-integration] loaded');

};


module.exports = Plugin;