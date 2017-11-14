/**
 * @module coral/publish
 */

import pino from 'pino'
import aws from 'aws-sdk'
import config from './config'
import { RequestError } from './errors'

const s3 = new aws.S3()
const sqs = new aws.SQS()

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
async function keyExists(key, bucket = config.get('staging_bucket')) {
  return new Promise((resolve, reject) => {
    s3.headObject({
      Bucket: bucket,
      Key: key,
    }, (err) => {
      if (err) {
        if (err.code === 'NoSuchKey') {
          resolve(false)
        } else {
          reject(err)
        }
        return
      }

      resolve(true)
    })
  })
}

/**
 * Push a publish request into the queue.
 * This request is queued until a back-end service can process it.
 * @param {string} key The S3 object to publish.
 * @param {string} bucket The S3 bucket containing the object.
 * @param {string} [queue] The URL for the queue to send a message to.
 * @returns {Promise<string>} The ID for the message in the queue.
 */
async function pushToQueue(key, bucket, queue = config.get('publish_queue')) {
  const payload = { key, bucket }
  const payloadStr = JSON.stringify(payload)

  return new Promise((resolve, reject) => {
    sqs.sendMessage({
      QueueUrl: queue,
      MessageBody: payloadStr,
    }, (err, data) => {
      if (err) {
        reject(err)
        return
      }
      const { MessageId: id } = data || {}
      resolve(id)
    })
  })
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

  logger.debug({ event }, 'processing publish event')

  const key = `${repo}/${name}`
  const bucket = config.get('staging_bucket')

  try {
    const exists = await keyExists(key, bucket)
    if (!exists) throw new RequestError(`file ${key} does not exist`, 404)
    logger.debug('verified that file "%s" exists', key)
  } catch (err) {
    logger.error({ err }, 'problem checking the file "%s" in s3', key)
    callback(err)
    return
  }

  let messageId

  try {
    messageId = await pushToQueue(key, bucket)
  } catch (err) {
    logger.error({ err }, 'problem pushing file "%s" into the sqs queue')
    callback(err)
    return
  }

  logger.info({ messageId }, 'successfully pushed "%s" into publish queue: %s', key, messageId)

  callback(null, {
    status: 202,
    result: {
      id: messageId,
    },
  })
}
