
export default function wrapS3Event(bucket) {
  return ([repo, key]) => {
    const records = [{
      eventVersion: '2.0',
      eventSource: 'aws:s3',
      awsRegion: 'us-east-1',
      eventTime: (new Date()).toISOString(),
      s3: {
        s3SchemaVersion: '1.0',
        bucket: {
          name: bucket,
        },
        object: {
          key: `${repo}/${key}`,
        },
      },
    }]
    return { Records: records }
  }
}
