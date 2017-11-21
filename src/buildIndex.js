
import { dirname } from 'path'
import pino from 'pino'
import config from './config'
import { RequestError } from './errors'
import { getFileBody, listContents, putObject } from './services/s3'

/**
 * Base pino logger for all publish requests.
 * @type {Pino}
 */
const baseLogger = pino({
  name: 'coral.buildIndex',
  level: config.get('logging.level'),
})

/**
 * Read JSON files from S3.
 * @param {string[]} keys Keys of JSON files to parse.
 * @param {string} bucket Bucket to read JSON from.
 * @returns {object[]} Parsed JSON.
 */
async function getJSON(keys, bucket) {
  const files = await Promise.all(keys.map(async (key) => {
    if (!/\.json$/i.test(key)) {
      return null
    }

    try {
      const bodyBuffer = await getFileBody(key, bucket)
      return JSON.parse(bodyBuffer.toString('utf8'))
    } catch (err) {
      baseLogger.error({ err, key, bucket }, 'unable to read file body: %s', key)
      return null
    }
  }))

  return files.filter(file => !!file)
}

/**
 * @typedef FileEvent
 * @property {object} Records
 * @property {Array<Object>} records S3 objects that were modified.
 * @see http://docs.aws.amazon.com/AmazonS3/latest/dev/notification-content-structure.html
 */

/**
 * @typedef {Object} Context
 * @property {string} awsRequestId Unique request ID for this invocation.
 */

/**
 * Build an index using the metadata files for images stored in S3.
 * @param {FileEvent} event S3 event that triggered this function/
 * @param {Context} context AWS context cfor this convocation.
 * @param {Function} callback Standard node-style callback for signaling when
 *  this function has finished.
 */
export default async function buildIndex(
  { Records: records = [] },
  { awsRequestId: reqId },
  callback,
) {
  const logger = baseLogger.child({ reqId })
  const [{
    s3: {
      bucket: { name: bucket } = {},
      object: { key } = {},
    } = {},
  }] = records

  if (!key || !bucket) {
    const err = new RequestError(`missing required parameter: ${bucket ? 'key' : 'bucket'}`)
    callback(err)
    return
  }

  const directory = dirname(key)

  logger.debug({
    key,
    bucket,
    directory,
  }, 'building index based on event')

  try {
    const files = (await listContents(directory, bucket)).map(({ Key }) => Key)
    const contents = await getJSON(files, bucket)
    const path = directory.replace(/^_meta\//i, '')
    const indexKey = `${path}/index.json`

    logger.info({
      contents,
      indexKey,
      directory,
    }, 'built index based on metadata; writing back to s3')

    await putObject(indexKey, Buffer.from(JSON.stringify(contents)), bucket)

    callback(null, {
      status: 201,
      result: contents,
    })
  } catch (err) {
    logger.error({ err }, 'problem buidling index manifest')
    callback(err)
  }
}
