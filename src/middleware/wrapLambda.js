/**
 * @module coral/middleware/wrapLambda
 */

import { promisify } from 'bluebird'
import uuid from 'uuid'
import { RequestError } from '../errors'

/**
 * Read a request stream into an encoded string.
 * @param {ReadableStream} req Stream to read.
 * @returns {Promise<string>} String representation of the stream, once the
 *  stream has ended.
 * @todo Support specifying encoding as an input parameter.
 */
function getBody(req) {
  return new Promise((resolve, reject) => {
    let body

    req.on('data', (chunk) => {
      body = body ? Buffer.concat([body, chunk]) : chunk
    })

    req.on('end', () => {
      resolve(body ? body.toString('base64') : undefined)
    })

    req.on('error', (err) => {
      reject(err)
    })
  })
}

/**
 * Wrap an AWS Lambda handler as a Koa2 middleware function. This allows
 * Lambda handlers to be executed as part of a Koa application.
 * @param {Function} lambdaFn The lambda function to wrap.
 * @param {Function} getParams Function to generate parameters to pass to lambda.
 * @returns {Function} A Koa2 middleware function.
 * @todo Pass query parameters onto the lambda function.
 * @todo Pass headers onto the labmda function.
 * @todo Support dynamically mapping body into event object.
 */
export default function wrapLambda(lambdaFn, getParams = () => undefined) {
  const lambdaFnAsync = promisify(lambdaFn)

  return async (ctx, ...paramValues) => {
    const { requestId = uuid.v4() } = ctx.state || {}
    const params = getParams(paramValues.slice(0, -1)) || {}

    const file = await getBody(ctx.req)
    const event = { ...params, file }
    const context = { awsRequestId: requestId }

    ctx.log.debug('processing lambda request')

    try {
      const { status, result } = await lambdaFnAsync(event, context)
      ctx.log.debug({ status, result }, 'successfully processed lambda')
      ctx.status = status
      ctx.body = result
    } catch (err) {
      ctx.log.error(err, 'problem processing lambda')

      if (err instanceof RequestError) {
        ctx.throw(err.code || 400)
        return
      }

      ctx.throw(500)
    }
  }
}
