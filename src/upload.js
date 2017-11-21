/**
 * @module coral/upload
 */

import pino from 'pino'
import config from './config'
import { RequestError } from './errors'
import { putObject } from './services/s3'
import { getFileMeta } from './services/buffer'

/**
 * Base pino logger for all upload requests.
 * @type {Pino}
 */
const baseLogger = pino({
  name: 'coral.upload',
  level: config.get('logging.level'),
  serializers: {
    // define a serializer for event parameters - suppress the buffer
    event: (event) => {
      const { file } = event
      const byteLength = Buffer.byteLength(file, 'base64')
      return { ...event, file: `[${byteLength} byte file]` }
    },
  },
})

/**
 * @typedef {Object} UploadEvent
 * @property {string} file A base64 encoded string of a file to upload.
 * @property {string} repo The repository to upload the file to.
 */

/**
 * @typedef {Object} Context
 * @property {string} awsRequestId Unique request ID for this invocation.
 */

/**
 * Upload a file to S3.
 * @param {UploadEvent} event Trigger for this invocation.
 * @param {Context} context AWS Context for this invocation.
 * @param {Function} callback Standard node-style callback for signaling when
 *  this function has finished.
 * @todo Make file encoding configurable via the event parameter.
 */
export default async function (event, { awsRequestId: reqId }, callback) {
  const logger = baseLogger.child({ reqId })
  const { file, repo } = event
  const namespace = config.get('namespace')
  const stagingBucket = config.get('staging_bucket')

  logger.debug({ event }, 'processing upload event')

  if (!file || !repo) {
    const msg = `missing required parameter: ${file ? 'repo' : 'file'}`
    logger.error(msg)
    callback(new RequestError(msg))
    return
  }

  const fileBuffer = Buffer.from(file, 'base64')

  logger.debug('recieved request to upload file to %s', repo)

  try {
    const fileMeta = getFileMeta(fileBuffer)
    const filePath = `${namespace}/${repo}/${fileMeta.name}`

    logger.info({ fileMeta, filePath }, 'uploading file to s3')

    await putObject(filePath, fileBuffer, stagingBucket)

    callback(null, {
      status: 201,
      result: {
        path: filePath,
        ...fileMeta,
      },
    })
  } catch (err) {
    logger.error({ err }, 'problem uploading file to s3')
    callback(err)
  }
}
