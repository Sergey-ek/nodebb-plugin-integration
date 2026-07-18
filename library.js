'use strict';

const routeHelpers = require.main.require('./src/routes/helpers');

const plugin = {};


/**
 * Plugin initialization
 */
plugin.init = async function (params) {

    const { router } = params;


    routeHelpers.setupAdminPageRoute(
        router,
        '/admin/plugins/nodebb-integration',
        [],
        async function (req, res) {

            res.render(
                'admin/plugins/integration',
                {
                    title: 'NodeBB Integration'
                }
            );

        }
    );


    console.log('[nodebb-plugin-integration] initialized');

};



/**
 * Add ACP menu item
 */
plugin.addAdminNavigation = async function (header) {


    if (!header) {
        return header;
    }


    if (!header.plugins) {
        header.plugins = [];
    }


    header.plugins.push({
        route: '/plugins/nodebb-integration',
        icon: 'fa-robot',
        name: 'NodeBB Integration'
    });


    return header;

};



module.exports = plugin;