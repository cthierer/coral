/**
 * @module coral/publish
 */

import pino from 'pino'
import aws from 'aws-sdk'
import config from './config'
import { RequestError } from './errors'

const s3 = new aws.S3()

/**
 * Base pino logger for all publish requests.
 * @type {Pino}
 */
const baseLogger = pino({
  name: 'coral.publish',
  level: config.get('logging.level'),
})

/**
 * Check if a key exists in S3.
 * @param {string} key The Key for the object to check.
 * @param {string} [bucket] S3 bucket expected to contain the Key.
 * @returns {Promise<boolean>} True if the specified key exists.
 */
async function keyExists(
  key,
  bucket = config.get('staging_bucket'),
) {
  try {
    await s3.headObject({
      Bucket: bucket,
      Key: key,
    }).promise()
  } catch (err) {
    if (err.code === 'NoSuchKey' || err.code === 'NotFound') {
      return false
    }
    throw err
  }

  return true
}

/**
 * Move a file from one S3 bucket to another.
 * @param {string} key The key of the file to move.
 * @param {string} [sourceBucket] The bucket to move the resource from.
 * @param {string} [destinationBucket] The bucket to move the resource to.
 * @returns {Promise<string>} The key of the moved file in the new bucket.
 */
async function moveFile(
  key,
  sourceBucket = config.get('staging_bucket'),
  destinationBucket = config.get('cdn_bucket'),
) {
  const copySource = `/${sourceBucket}/${key}`

  await s3.copyObject({
    Bucket: destinationBucket,
    Key: key,
    CopySource: copySource,
  }).promise()

  await s3.deleteObject({
    Bucket: sourceBucket,
    Key: key,
  }).promise()

  return key
}

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

  logger.debug({ event }, 'processing publish event')

  const key = `${namespace}/${repo}/${name}`

  try {
    const exists = await keyExists(key)
    if (!exists) throw new RequestError(`file ${key} does not exist`, 404)
    logger.debug('verified that file "%s" exists', key)
  } catch (err) {
    logger.error({ err }, 'problem checking the file "%s" in s3', key)
    callback(err)
    return
  }

  try {
    await moveFile(key)
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
