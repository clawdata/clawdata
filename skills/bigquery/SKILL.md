---
name: bigquery
description: >
  Query and manage Google BigQuery datasets — run SQL, load data,
  manage tables, and browse datasets.
metadata:
  openclaw:
    requires:
      bins: [clawdata]
    primaryEnv: GOOGLE_APPLICATION_CREDENTIALS
    tags: [database, bigquery, gcp, sql, cloud]
---

# BigQuery

Google BigQuery skill for querying, loading, and managing datasets.

## Commands

| Task | Command |
|------|---------|
| Connect | `clawdata connect add bq --type bigquery --connection-string <project-id>` |
| Query | `clawdata db query "SELECT ..." --profile bq` |
| List tables | `clawdata db tables --profile bq` |
| List datasets | `clawdata bq datasets --profile bq` |
| Load data | `clawdata bq load <dataset.table> data.csv --profile bq` |

## Authentication

```bash
# Service account (recommended for production)
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json

# Or use gcloud auth
gcloud auth application-default login
```

## When to use

- User asks to query BigQuery → use `--profile` flag with bigquery connection
- User wants to load local data into BigQuery → `clawdata bq load`
- User needs BigQuery cost estimates → `clawdata bq dry-run "SELECT ..."`
