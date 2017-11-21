coral
=====

Build a cloud formation stack:

```
$ make env=develop build-stack
```

Update an existing stack:

```
$ make env=develop update-stack
```

Deploy the application:

```
$ make env=develop deploy
```

## Manual configuration

The destination S3 bucket (the `cdn_bucket` in the source code) is _not_
managed by this cloud formation script - it must be manually configured.

This bucket also needs to be configured to trigger the `ProcessLambda` on
copy events:

```yaml
Event: "s3:ObjectCreated:Copy"
Filter:
  S3Key:
    Rules:
      - Name: "Prefix"
        Value: "galleries/"
    Function: !GetAtt ProcessLambda.Arn
```

And, to fire the `BuildIndexLambda` on create and delete events:

```yaml
Event: "s3:ObjectCreated:*"
Filter:
  S3Key:
    Rules:
      - Name: "Prefix"
        Value: "_meta/"
      - Name: "Suffix"
        Value: "json"
    Function: !GetAtt BuildIndexLambda.Arn
Event: "s3:ObjectRemoved:*"
Filter:
  S3Key:
    Rules:
      - Name: "Prefix"
        Value: "_meta/"
      - Name: "Suffix"
        Value: "json"
    Function: !GetAtt BuildIndexLambda.Arn
```
