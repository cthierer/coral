/**
 * @module coral/upload
 */

import pino from 'pino'
import aws from 'aws-sdk'
import fileType from 'file-type'
import uuid from 'uuid'
import config from './config'
import { RequestError } from './errors'

const s3 = new aws.S3()

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
 * @typedef {Object} FileMeta
 * @property {number} size Total size (in bytes) of the file.
 * @property {string} type MIME type of the file.
 * @property {string} name File name for the buffer.
 */

/**
 * Generate file metadata from a file buffer.
 * @param {Buffer} buffer The buffer to extract metadata from.
 * @returns {FileMeta} Extracted file metadata for the provided buffer.
 */
function getFileMeta(buffer) {
  const { ext, mime } = fileType(buffer) || {}

  if (!ext || !mime) {
    throw new Error('unknown file type')
  }

  const id = uuid.v4()
  const fileName = `${id}.${ext}`

  return {
    id,
    size: Buffer.byteLength(buffer),
    type: mime,
    name: fileName,
  }
}

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
export default function (event, { awsRequestId: reqId }, callback) {
  const logger = baseLogger.child({ reqId })
  const { file, repo } = event
  const namespace = config.get('namespace')
  let fileMeta

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
    fileMeta = getFileMeta(fileBuffer)
  } catch (err) {
    const msg = 'unable to determine file metadata'
    logger.error({ err }, msg)
    callback(new RequestError(msg))
    return
  }

  logger.debug({ repo, namespace, ...fileMeta }, 'uploading file to s3')

  const filePath = `${namespace}/${repo}/${fileMeta.name}`

  s3.putObject({
    Bucket: config.get('staging_bucket'),
    Key: filePath,
    Body: fileBuffer,
    ContentType: fileMeta.type,
  }, (err) => {
    if (err) {
      logger.error({ err }, 'problem uploading file to s3')
      callback(err)
      return
    }

    logger.info({ repo, ...fileMeta }, 'successfully uploaded file to s3')

    callback(null, {
      status: 201,
      result: {
        path: filePath,
        ...fileMeta,
      },
    })
  })
}
