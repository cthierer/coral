/**
 * @module coral/server
 */

import Koa from 'koa'
import route from 'koa-route'
import logger from 'koa-pino-logger'
import { wrapLambda } from './middleware'
import * as handlers from './index'
import config from './config'
import zipParams from './utils/zipParams'
import wrapS3Event from './utils/wrapS3Event'

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
  wrapLambda(handlers.upload, zipParams(['repo'])),
))

// mount the publish handler
server.use(route.put(
  '/galleries/:name/images/:id/publish',
  wrapLambda(handlers.publish, zipParams(['repo', 'name'])),
))

// mount to trigger processing of published resources
server.use(route.post(
  '/process/:repo/:id',
  wrapLambda(handlers.process, wrapS3Event(config.get('cdn_bucket'))),
))

export default server
