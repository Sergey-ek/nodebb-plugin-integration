'use strict';

module.exports = function(router) {

    router.get(
        '/api/admin/plugins/nodebb-integration/status',
        (req, res) => {

            res.json({
                status: 'ok',
                nodebb: require.main.require('./package.json').version,
                time: new Date()
            });

        }
    );

};