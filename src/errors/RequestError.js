/**
 * @module coral/errors/RequestError
 */

import { STATUS_CODES } from 'http'

/**
 * Represent a problem with a user's request.
 * @class
 */
export default class RequestError extends Error {
  /**
   * @constructor
   * @param {string} message A human-readable error message.
   * @param {number} [code=400] An HTTP 400-class error code for the request.
   */
  constructor(message, code = 400) {
    super(`${STATUS_CODES[code]}: ${message}`)
    this.code = code
  }
}
