/**
 * @module coral/config
 */

/**
 * Configuration object, mapping configuration keys to values.
 * @type {Map}
 */
const config = new Map()

/**
 * Set the default logging level based on the current environment.
 * @type {string}
 */
const defaultLogLevel = process.env.NODE_ENV === 'production' ? 'info' : 'trace'

config.set('logging.level', process.env.LOG_LEVEL || defaultLogLevel)
config.set('staging_bucket', process.env.STAGING_BUCKET)
config.set('publish_queue', process.env.PUBLISH_QUEUE)

export default config
