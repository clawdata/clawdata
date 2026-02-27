---
name: s3
description: "Manage AWS S3 storage — list buckets, upload/download files, sync directories, and manage object lifecycle."
metadata: {"openclaw": {"emoji": "🪣", "requires": {"bins": ["aws"]}, "tags": ["storage", "s3", "aws", "cloud", "data", "files"]}}
---

# S3

You help manage AWS S3 storage using the **`aws`** CLI.
Use this when the user asks about S3 buckets, file uploads/downloads, or data lake storage.

## Authentication

Ensure AWS CLI is configured:

```bash
aws configure
```

Or set environment variables: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_DEFAULT_REGION`.

## Commands

### Buckets

#### List buckets

```bash
aws s3 ls
```

#### Create a bucket

```bash
aws s3 mb s3://<bucket-name> --region <region>
```

#### Delete an empty bucket

```bash
aws s3 rb s3://<bucket-name>
```

### Listing Objects

#### List objects in a bucket

```bash
aws s3 ls s3://<bucket>/<prefix>/ --recursive --human-readable --summarize
```

#### List only top-level prefixes

```bash
aws s3 ls s3://<bucket>/<prefix>/
```

### Uploading

#### Upload a file

```bash
aws s3 cp <local_path> s3://<bucket>/<key>
```

#### Upload a directory

```bash
aws s3 sync <local_dir> s3://<bucket>/<prefix>/
```

#### Upload with storage class

```bash
aws s3 cp <local_path> s3://<bucket>/<key> --storage-class INTELLIGENT_TIERING
```

### Downloading

#### Download a file

```bash
aws s3 cp s3://<bucket>/<key> <local_path>
```

#### Download a directory

```bash
aws s3 sync s3://<bucket>/<prefix>/ <local_dir>
```

### Copying and Moving

#### Copy between buckets

```bash
aws s3 cp s3://<source-bucket>/<key> s3://<dest-bucket>/<key>
```

#### Move (rename) an object

```bash
aws s3 mv s3://<bucket>/<old-key> s3://<bucket>/<new-key>
```

### Deleting

#### Delete a file

```bash
aws s3 rm s3://<bucket>/<key>
```

#### Delete all objects with a prefix

```bash
aws s3 rm s3://<bucket>/<prefix>/ --recursive
```

### Object Info

#### Get object metadata

```bash
aws s3api head-object --bucket <bucket> --key <key>
```

#### Get bucket size

```bash
aws s3 ls s3://<bucket> --recursive --summarize | tail -2
```

### Presigned URLs

#### Generate a presigned download URL (expires in 1 hour)

```bash
aws s3 presign s3://<bucket>/<key> --expires-in 3600
```

## Data Lake Conventions

- Use partitioned paths: `s3://<bucket>/raw/<source>/<table>/year=YYYY/month=MM/day=DD/`
- Store raw data in Parquet or Delta format when possible
- Use consistent naming: lowercase, hyphens for buckets, slashes for hierarchy
- Apply lifecycle policies to transition old data to cheaper storage classes

## Best Practices

- Enable versioning on important buckets
- Use `--dryrun` flag before bulk operations
- Set up lifecycle rules for cost management
- Use server-side encryption (`--sse AES256`)
- Prefer `aws s3 sync` over `cp --recursive` for incremental transfers
