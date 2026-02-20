---
name: s3
description: >
  Manage files in Amazon S3, Google Cloud Storage, or Azure Blob Storage.
  List, upload, download, and preview objects from cloud storage buckets.
metadata:
  openclaw:
    requires:
      bins: [clawdata]
    primaryEnv: AWS_DEFAULT_REGION
    tags: [cloud, storage, s3, gcs, azure, blob, files]
---

# S3 / GCS / Azure Blob

Cloud storage skill for managing objects across AWS S3, Google Cloud Storage,
and Azure Blob Storage.

## Commands

| Task | Command |
|------|---------|
| List buckets | `clawdata s3 ls` |
| List objects | `clawdata s3 ls s3://bucket/prefix/` |
| Upload file | `clawdata s3 cp local.csv s3://bucket/data/` |
| Download file | `clawdata s3 cp s3://bucket/data/file.csv ./local/` |
| Preview file | `clawdata s3 head s3://bucket/data/file.csv` |
| Remove object | `clawdata s3 rm s3://bucket/data/file.csv` |
| Sync directory | `clawdata s3 sync ./data/ s3://bucket/data/` |

## Supported Providers

| Provider | URI Scheme | Auth Env Vars |
|----------|-----------|---------------|
| AWS S3 | `s3://` | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` |
| Google GCS | `gs://` | `GOOGLE_APPLICATION_CREDENTIALS` |
| Azure Blob | `az://` | `AZURE_STORAGE_CONNECTION_STRING` |

## When to use

- User wants to load data from a cloud bucket → `clawdata s3 cp` then `clawdata data ingest`
- User wants to export query results to S3 → `clawdata db export` then `clawdata s3 cp`
- User asks about files in a bucket → `clawdata s3 ls`

## DuckDB Integration

DuckDB's httpfs extension supports S3 natively:

```sql
-- Load directly from S3
SELECT * FROM read_parquet('s3://my-bucket/data/*.parquet');
```

Use `clawdata db query` with S3 paths when httpfs is loaded.
