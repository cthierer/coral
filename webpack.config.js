
const path = require('path')
const { version } = require('./package.json')

module.exports = ({ prod = true }) => ({
  mode: prod ? 'production' : 'development',
  entry: {
    latest: './src/client',
    [`${version.replace(/\./g, '/')}`]: './src/client',
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name]/coral-client.js',
    publicPath: '/scripts/',
    library: 'coral',
    libraryTarget: 'var',
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        include: [
          path.resolve(__dirname, 'src'),
        ],
        loader: 'babel-loader',
        options: {
          presets: ['babel-preset-env'],
          plugins: [
            ['babel-plugin-transform-object-rest-spread', { useBuiltIns: true }],
            ['babel-plugin-transform-builtin-extend', { globals: ['Error'] }],
          ],
        },
      },
    ],
  },
  devtool: 'source-map',
  context: __dirname,
  target: 'web',
  stats: 'errors-only',
})
