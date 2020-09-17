var autoprefixer = require('autoprefixer');
var combineLoaders = require('webpack-combine-loaders');
var path = require('path');
var CopyWebpackPlugin = require('copy-webpack-plugin');
var HtmlWebpackPlugin = require('html-webpack-plugin');
var webpack = require('webpack');

module.exports = {
    devServer: {
        contentBase: path.resolve(__dirname, 'build'),
        host: '0.0.0.0',
        port: process.env.PORT || 8601
    },
    entry: {
        lib: ['react', 'react-dom'],
        gui: './src/index.jsx'
    },
    output: {
        path: path.resolve(__dirname, 'build'),
        filename: '[name].js'
    },
    module: {
        externals: {
            React: 'react',
            ReactDOM: 'react-dom'
        },
        loaders: [{
            test: /\.jsx?$/,
            loader: 'babel-loader',
            include: path.resolve(__dirname, 'src'),
            query: {
                plugins: ['transform-object-rest-spread'],
                presets: ['es2015', 'react']
            }
        },
        {
            test: /\.css$/,
            loader: combineLoaders([{
                loader: 'style'
            }, {
                loader: 'css',
                query: {
                    modules: true,
                    importLoaders: 1,
                    localIdentName: '[name]_[local]_[hash:base64:5]',
                    camelCase: true
                }
            }, {
                loader: 'postcss'
            }])
        },
        {
            test: /\.svg$/,
            loader: 'svg-url-loader?noquotes'
        },
        {
            test: /\.json$/,
            loader: 'json-loader'
        }]
    },
    postcss: [
        autoprefixer({
            browsers: ['last 3 versions', 'Safari >= 8', 'iOS >= 8']
        })
    ],
    plugins: [
        new webpack.DefinePlugin({
            'process.env.BASE_PATH': '"' + (process.env.BASE_PATH || '/') + '"',
            'process.env.DEBUG': Boolean(process.env.DEBUG)
        }),
        new webpack.optimize.CommonsChunkPlugin({
            name: 'lib',
            filename: 'lib.min.js'
        }),
        new HtmlWebpackPlugin({
            title: 'Scratch 3.0 GUI'
        }),
        new CopyWebpackPlugin([{
            from: 'node_modules/scratch-blocks/media',
            to: 'static/blocks-media'
        }])
    ].concat(process.env.NODE_ENV === 'production' ? [
        new webpack.optimize.UglifyJsPlugin({
            include: /\.min\.js$/,
            minimize: true,
            compress: {
                warnings: false
            }
        })
    ] : [])
};
