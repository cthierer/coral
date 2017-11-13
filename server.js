/* eslint-disable no-console */

require('dotenv').config()

const { default: server } = require('./lib/server')

const port = process.env.PORT || 3000

server.listen(port, () => {
  console.log(`listening on port ${port}`)
})
