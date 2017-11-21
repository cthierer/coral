/**
 * @module coral/process
 */

import { basename, extname, dirname } from 'path'
import pino from 'pino'
import sharp from 'sharp'
import config from './config'
import { getFileBody, putObject } from './services/s3'

/**
 * Image breakpoints to resize to.
 * @type {Array<number>}
 */
const BREAKPOINTS = [576, 768, 992, 1200]

/**
 * Base pino logger for all publish requests.
 * @type {Pino}
 */
const baseLogger = pino({
  name: 'coral.process',
  level: config.get('logging.level'),
})

function parseFileParts(file) {
  const directory = dirname(file)
  const extension = extname(file)
  const filename = basename(file, extension)

  return { directory, extension, filename }
}

/**
 * @typedef ResizedImage
 * @property {number} size The size if the image.
 * @property {string} img The key to the image in S3.
 */

/**
 * Resize the image based on the provided breakpoints.
 * @param {Sharp} image A Sharp object, initialized with the image to resize.
 * @param {FileDescriptor} file A description of the original file, which will
 *  be used to build the filename of the resized file.
 * @param {boolean} isPortrait Whether or not the image is portrait or not.
 *  This determines how the image is resized.
 * @param {string} bucket The S3 bucket to save the file to.
 * @param {number[]} [breakpoints] Screen widths to resize the image for.
 * @returns {ResizedImage[]} The images that were resized and written to S3.
 */
async function resizeImages(
  image,
  { directory, filename, extension },
  isPortrait,
  bucket,
  breakpoints = BREAKPOINTS,
) {
  const resized = await Promise.all(breakpoints.map(async (desired) => {
    const desiredWidth = isPortrait ? null : desired
    const desiredHeight = isPortrait ? desired : null
    const destKey = `${directory}/${filename}_${desired}${extension}`

    try {
      // perform the resize  using sharp
      const resizedBody = await image
        .resize(desiredWidth, desiredHeight)
        .toBuffer()

      // store the resized image on S3
      await putObject(destKey, resizedBody, bucket)
    } catch (err) {
      baseLogger.error({
        err,
        desiredWidth,
        desiredHeight,
        destKey,
      }, 'unable to resize image')

      // eat the error, continue processing
      return null
    }

    return { size: desired, img: destKey }
  }))

  // filter out any failed images
  return resized.filter(resizedImage => !!resizedImage)
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
 * @property {string} filename An unique ID for this image.
 * @property {string} directory The base path to this image.
 * @property {string} bucket The s3 bucket storing this image.
 * @property {Gallery} payload Description of the gallery image.
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
  const fileDescriptor = parseFileParts(key)

  // determine the full size of the image
  const image = sharp(body)
  const { width, height } = await image.metadata()

  // resize the image into several images based on the breakpoints
  const resized = await resizeImages(
    image,
    fileDescriptor,
    (height >= width),
    bucket,
  )

  // build metadata about the processed image
  const [{ img: thumbnail }] = resized
  const payload = {
    src: `${prefix}/${thumbnail}`,
    srcSet: resized.map(({ size, img }) => `${prefix}/${img} ${size}w`),
    linkTo: `${prefix}/${key}`,
    width,
    height,
  }

  // build the result
  return {
    ...fileDescriptor,
    bucket,
    payload,
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
      filename,
      directory,
      bucket,
      payload,
    }) => {
      const key = `_meta/${directory}/${filename}.json`
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
