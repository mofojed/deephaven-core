var path = require("path");

module.exports = {
    entry: './src/index.js',
    experiments: {
        outputModule: true,
    },
    output: {
        filename: 'index.js',
        library: {
            type: 'module',
        },
    },
    resolve: {
        alias: {
            JsApi: path.resolve(__dirname, '../../docker/web/build/docker/static/jsapi'),
        },
    },
}