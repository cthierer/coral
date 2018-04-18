/**
 * @module coral/client
 */

import 'isomorphic-fetch'
import { getFileMeta } from './services/buffer'

/* global fetch */

const JSON = 'application/json'

/**
 * @typedef Image
 * @property {string} path
 * @property {number} size
 * @property {string} type
 * @property {string} name
 */

/**
 * @typedef ImageRef
 * @property {string} id
 * @property {string} href
 */

/**
 * Verify that the provided value is a Buffer.
 * @param {any} val The value to inspect.
 * @param {string} [name]
 * @throws {TypeError} If the val is not a Buffer.
 */
function assertBuffer(val, name = 'value') {
  if (!val || !Buffer.isBuffer(val)) {
    throw new TypeError(`${name} must be a Buffer`)
  }
}

/**
 * Verify that the provided value is a non-empty string.
 * @param {any} val The value to inspect.
 * @param {string} [name]
 * @throws {TypeError} If the val is not a string, or is an empty string.
 */
function assertNonEmptyString(val, name = 'value') {
  if (!val || typeof val !== 'string' || val.trim().length < 1) {
    throw new TypeError(`${name} must be a non-empty string`)
  }
}

/**
 * Upload an image buffer to a gallery.
 * @param {Buffer} imageBuffer
 * @param {string} gallery
 * @param {Object} [options]
 * @param {string} [options.host]
 * @returns {Promise<Image>}
 */
export async function upload(imageBuffer, gallery, {
  host = 'https://api.stage5clingan.com',
} = {}) {
  assertBuffer(imageBuffer, 'imageBuffer')
  assertNonEmptyString(gallery, 'gallery')

  const { type: contentType } = getFileMeta(imageBuffer)
  const galleryKey = encodeURIComponent(gallery)
  const uploadRes = await fetch(`${host}/galleries/${galleryKey}/images`, {
    method: 'POST',
    headers: {
      accept: JSON,
      'content-type': contentType,
    },
    body: imageBuffer,
  })

  if (uploadRes.status !== 201) {
    const { message = 'unknown error' } = await uploadRes.json()
    throw new Error(`#upload-${uploadRes.status}: ${message}`)
  }

  return uploadRes.json()
}

/**
 * Publish an image into the gallery.
 * @param {string} image
 * @param {string} gallery
 * @param {Object} [options]
 * @param {string} [options.host]
 * @returns {Promise<ImageRef>}
 */
export async function publish(image, gallery, {
  host = 'https://api.stage5clingan.com',
}) {
  assertNonEmptyString(image, 'image')
  assertNonEmptyString(gallery, 'gallery')

  const galleryKey = encodeURIComponent(gallery)
  const imageKey = encodeURIComponent(image)
  const publishRes = await fetch(`${host}/galleries/${galleryKey}/images/${imageKey}/publish`, {
    method: 'PUT',
    headers: {
      accept: JSON,
      'content-type': JSON,
    },
  })

  if (publishRes.status !== 202) {
    const { message = 'unknown error' } = await publishRes.json()
    throw new Error(`#publish-${publishRes.status}: ${message}`)
  }

  return publishRes.json()
}
