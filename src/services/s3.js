
import aws from 'aws-sdk'
import fileType from 'file-type'

const s3 = new aws.S3()

/**
 * Read the contents of a file from S3.
 * @param {string} key The key to read.
 * @param {string} bucket The bucket to read from.
 * @returns {Promise<Buffer>} The file contents.
 */
export async function getFileBody(key, bucket) {
  const { Body: body } = await s3.getObject({
    Key: key,
    Bucket: bucket,
  }).promise()

  return body
}

/**
 * Check if a key exists in S3.
 * @param {string} key The Key for the object to check.
 * @param {string} bucket S3 bucket expected to contain the Key.
 * @returns {Promise<boolean>} True if the specified key exists.
 */
export async function keyExists(key, bucket) {
  try {
    await s3.headObject({
      Bucket: bucket,
      Key: key,
    }).promise()
  } catch (err) {
    if (err.code === 'NoSuchKey' || err.code === 'NotFound') {
      return false
    }
    throw err
  }

  return true
}

/**
 * List all contents in a directory in S3.
 * @param {string} directory The key prefix (directory) to list.
 * @param {string} bucket The bucket to query.
 * @param {number} [limit=100] The maximum number of results to return.
 * @returns {Object[]} Description of S3 objects.
 */
export async function listContents(directory, bucket, limit = 100) {
  const { Contents: contents } = await s3.listObjects({
    Bucket: bucket,
    Prefix: directory,
    MaxKeys: limit,
  }).promise()

  return contents
}

/**
 * Move a file from one S3 bucket to another.
 * @param {string} key The key of the file to move.
 * @param {string} sourceBucket The bucket to move the resource from.
 * @param {string} destinationBucket The bucket to move the resource to.
 * @returns {Promise<string>} The key of the moved file in the new bucket.
 */
export async function moveFile(
  key,
  sourceBucket,
  destinationBucket,
) {
  const copySource = `/${sourceBucket}/${key}`

  await s3.copyObject({
    Bucket: destinationBucket,
    Key: key,
    CopySource: copySource,
  }).promise()

  await s3.deleteObject({
    Bucket: sourceBucket,
    Key: key,
  }).promise()

  return key
}

/**
 * Add an object to S3.
 * @param {string} key The key for the new S3 resource.
 * @param {Buffer} buffer The contents of the key.
 * @param {string} bucket The bucket to write to.
 * @returns {Promise<string>} The key of the written file.
 */
export async function putObject(key, buffer, bucket) {
  const { mime } = fileType(buffer) || {}

  await s3.putObject({
    Bucket: bucket,
    Key: key,
    Body: buffer,
    ContentType: mime,
  }).promise()

  return key
}
