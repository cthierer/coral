/**
 * @module coral/server
 */

import Koa from 'koa'
import route from 'koa-route'
import logger from 'koa-pino-logger'
import { wrapLambda } from './middleware'
import * as handlers from './index'
import config from './config'

/**
 * A Koa2 server, used for running the application locally.
 * This is not intended to be used on production, which should use an AWS
 * serverless architecture (Lambda and API Gateway).
 * @type {Koa}
 */
const server = new Koa()

// enable logging of request and responses
server.use(logger({
  name: 'coral.server',
  level: config.get('logging.level'),
}))

// mount the upload handler
server.use(route.post(
  '/galleries/:name/images',
  wrapLambda(handlers.upload, ['repo']),
))

// mount the publish handler
server.use(route.put(
  '/galleries/:name/images/:id/publish',
  wrapLambda(handlers.publish, ['repo', 'name']),
))

export default server
