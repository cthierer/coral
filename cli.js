/*
 * CLI for interacting with the deployed services.
 *
 * Invocation:
 *
 *    node ./cli.js <operation> ...args
 *
 * Where `<operation>` is either "upload" or "publish", and args are the
 * expected arguments for the invoked command.
 *
 * Allows the API host to be set via CORAL_HOST environment parameter.
 */

/* eslint-disable no-console */

const fs = require('fs')
const { promisify } = require('util')
const { client } = require('./index')

const DEFAULT_HOST = 'https://api.stage5clingan.com'
const HOST = process.env.CORAL_HOST || DEFAULT_HOST

const cliArgs = process.argv.slice(2)
const [operation, ...args] = cliArgs

let task

switch (operation.toLowerCase()) {
  /*
   * upload a file via the CLI.
   * expected args: path to image to upload, and gallery to upload to.
   */
  case 'upload': {
    const [imageFile, gallery] = args
    const readFile = promisify(fs.readFile)

    task = readFile(imageFile)
      .then(imageBuffer => client.upload(imageBuffer, gallery, { host: HOST }))
      .then(({ name }) => `uploaded image: ${name}`)

    break
  }
  /*
   * publish a file to the CDN.
   * expected args: name of the image to publish, and gallery to publish to.
   */
  case 'publish': {
    const [image, gallery] = args

    task = client.publish(image, gallery, { host: HOST })
      .then(({ href }) => `image published to ${href}`)

    break
  }
  /*
   * unknown command.
   */
  default: {
    task = Promise.reject(new Error(`unrecognized command: ${operation}`))
  }
}

task
  .then(console.log)
  .catch(console.trace)
  .then(() => console.log('done!'))
