
import { basename, extname, dirname } from 'path'
import pino from 'pino'
import aws from 'aws-sdk'
import fileType from 'file-type'
import sharp from 'sharp'
import config from './config'

/**
 * Image breakpoints to resize to.
 * @type {Array<number>}
 */
const BREAKPOINTS = [576, 768, 992, 1200]

const s3 = new aws.S3()

/**
 * Base pino logger for all publish requests.
 * @type {Pino}
 */
const baseLogger = pino({
  name: 'coral.process',
  level: config.get('logging.level'),
})

/**
 * Read the contents of a file from S3.
 * @param {string} key The key to read.
 * @param {string} bucket The bucket to read from.
 * @returns {Promise<Buffer>} The file contents.
 */
async function getFileBody(key, bucket) {
  const { Body: body } = await s3.getObject({
    Key: key,
    Bucket: bucket,
  }).promise()

  return body
}

/**
 * Add an object to S3.
 * @param {string} key The key for the new S3 resource.
 * @param {Buffer} buffer The contents of the key.
 * @param {string} bucket The bucket to write to.
 * @returns {Promise<string>} The key of the written file.
 */
async function putObject(key, buffer, bucket) {
  const { mime } = fileType(buffer) || {}

  await s3.putObject({
    Bucket: bucket,
    Key: key,
    Body: buffer,
    ContentType: mime,
  }).promise()

  return key
}

/**
 * @typedef FileRef
 * @property {string} key Unique identifier for a S3 resource.
 * @property {string} bucket Bucket where the resource exists.
 */

/**
 * @typedef GalleryImage
 * @property {string} src Path to the image to display in the gallery.
 * @property {Array<string>} srcset Collection of srcset attributes to use at
 *  various breakpoints, depending on how the gallery is rendered.
 * @property {number} width The width of the image.
 * @property {number} height The height of the image.
 * @property {string} linkTo A full URL to the image to download.
 * @see https://github.com/neptunian/react-photo-gallery#photos-array-item-properties-passed-into-gallerys-photos-property
 */

/**
 * @typedef ProcessedImage
 * @property {string} id An unique ID for this image.
 * @property {string} keyBase The base path to this image.
 * @property {string} bucket The s3 bucket storing this image.
 * @property {GallyerImage} payload Description of the gallery image.
 */

/**
 * Process an image file by resizing it into different files, based on the
 * specified breakpoints.
 * @param {FileRef} image The image file to process.
 * @param {string} [prefix] Prefix this value when determining the public
 *  href URL for this processed image.
 * @returns {ProcessedImage} The result of processing the image.
 */
async function processImage({ key, bucket }, prefix = config.get('cdn_host')) {
  let body

  try {
    body = await getFileBody(key, bucket)
  } catch (err) {
    if (err.code !== 'NoSuchKey' && err.code !== 'NotFound') throw err
  }

  if (!body) {
    // nothing to do here
    return null
  }

  // parse out the path of the image
  const directory = dirname(key)
  const extension = extname(key)
  const filename = basename(key, extension)

  // determine the full size of the image
  const image = sharp(body)
  const { width, height } = await image.metadata()
  const isPortrait = height >= width

  // resize the image into several images based on the breakpoints
  const resized = await Promise.all(BREAKPOINTS.map(async (desired) => {
    const desiredWidth = isPortrait ? null : desired
    const desiredHeight = isPortrait ? desired : null
    const destKey = `${directory}/${filename}_${desired}${extension}`

    const resizedBody = await image
      .resize(desiredWidth, desiredHeight)
      .toBuffer()

    // store the resized image on S3
    await putObject(destKey, resizedBody, bucket)

    return { size: desired, img: destKey }
  }))

  // build metadata about the processed image
  const [{ img: thumbnail }] = resized
  const srcSet = resized.map(({ size, img }) => `${prefix}/${img} ${size}w`)
  const src = `${prefix}/${thumbnail}`
  const linkTo = `${prefix}/${key}`

  // build the result
  return {
    id: filename,
    keyBase: directory,
    bucket,
    payload: {
      src,
      srcSet,
      width,
      height,
      linkTo,
    },
  }
}

/**
 * @typedef CopyEvent
 * @property {object} Records
 * @property {Array<Object>} records S3 objects that were copied.
 * @see http://docs.aws.amazon.com/AmazonS3/latest/dev/notification-content-structure.html
 */

/**
 * @typedef {Object} Context
 * @property {string} awsRequestId Unique request ID for this invocation.
 */

/**
 * Process an image by resizing it for several breakpoints.
 * @param {CopyEvent} event The event triggering this process.
 * @param {Context} context AWS Context for this invocation.
 * @param {Funtion} callback Standard node-style callback for signaling when
 *  this function has finished.
 */
export default async function process(
  { Records: records = [] },
  { awsRequestId: reqId },
  callback,
) {
  const logger = baseLogger.child({ reqId })
  // pull images from the copy event
  const images = records.map(({
    s3: {
      bucket: { name: bucket },
      object: { key },
    },
  }) => ({ bucket, key }))

  logger.debug({ images }, 'processing %d images', images.length)

  try {
    // process each image
    const processed = (
      await Promise.all(images.map(message => processImage(message)))
    ).filter(file => !!file)

    logger.debug({ processed }, 'processed %d images', processed.length)

    // save meta about the image to s3
    await processed.map(async ({
      id,
      keyBase,
      bucket,
      payload,
    }) => {
      const key = `_meta/${keyBase}/${id}.json`
      const body = JSON.stringify(payload)
      return putObject(key, Buffer.from(body, 'utf8'), bucket)
    })

    // done
    callback(null, {
      status: 200,
      result: processed,
    })
  } catch (err) {
    logger.error({ err }, 'problem processing images')
    callback(err)
  }
}
