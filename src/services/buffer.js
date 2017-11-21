/* eslint-disable import/prefer-default-export */

import fileType from 'file-type'
import uuid from 'uuid'
import { RequestError } from '../errors'

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
 * @throws {RequestError} If unable to determine the mime type of the upload.
 */
export function getFileMeta(buffer) {
  const { ext, mime } = fileType(buffer) || {}

  if (!ext || !mime) {
    throw new RequestError('unknown file type')
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
