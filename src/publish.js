/**
 * @module coral/publish
 */

import pino from 'pino'
import config from './config'
import { RequestError } from './errors'
import { keyExists, moveFile } from './services/s3'

/**
 * Base pino logger for all publish requests.
 * @type {Pino}
 */
const baseLogger = pino({
  name: 'coral.publish',
  level: config.get('logging.level'),
})

/**
 * @typedef {Object} PublishEvent
 * @property {string} name The name of the file to publish.
 * @property {string} repo The repository containing the file.
 */

/**
 * @typedef {Object} Context
 * @property {string} awsRequestId Unique request ID for this invocation.
 */

/**
 * Mark a file as ready for publication.
 * @param {PublishEvent} event Trigger for this invocation.
 * @param {Context} context AWS Context for this invocation.
 * @param {Funtion} callback Standard node-style callback for signaling when
 *  this function has finished.
 */
export default async function (event, { awsRequestId: reqId }, callback) {
  const logger = baseLogger.child({ reqId })
  const { name, repo } = event
  const namespace = config.get('namespace')
  const stagingBucket = config.get('staging_bucket')
  const destinationBucket = config.get('cdn_bucket')

  logger.debug({ event }, 'processing publish event')

  const key = `${namespace}/${repo}/${name}`

  try {
    const exists = await keyExists(key, stagingBucket)
    if (!exists) throw new RequestError(`file ${key} does not exist`, 404)
    logger.debug('verified that file "%s" exists', key)
  } catch (err) {
    logger.error({ err }, 'problem checking the file "%s" in s3', key)
    callback(err)
    return
  }

  try {
    await moveFile(key, stagingBucket, destinationBucket)
  } catch (err) {
    logger.error({ err }, 'problem moving file to CDN bucket')
    callback(err)
    return
  }

  logger.info('successfully published "%s', key)

  const [, id] = /([a-z0-9-]+)\.[a-z]{3,}$/i.exec(key)
  const href = `${config.get('cdn_host')}/${key}`

  callback(null, {
    status: 202,
    result: {
      id,
      href,
    },
  })
}
