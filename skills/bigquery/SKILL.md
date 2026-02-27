---
name: bigquery
description: "Query and manage Google BigQuery datasets — run SQL, list tables, inspect schemas, load data, and manage partitioning."
metadata: {"openclaw": {"emoji": "🔍", "requires": {"bins": ["bq"]}, "tags": ["database", "bigquery", "sql", "google", "cloud", "data"]}}
---

# BigQuery

You can query and manage Google BigQuery datasets using the **`bq`** CLI.
Use this when the user asks about BigQuery tables, wants to run SQL, or needs to manage datasets.

## Authentication

Ensure the user has authenticated with `gcloud auth application-default login` or has a service account key configured via `GOOGLE_APPLICATION_CREDENTIALS`.

## Commands

### List datasets

```bash
bq ls --project_id=<project_id>
```

### List tables in a dataset

```bash
bq ls <project_id>:<dataset>
```

### Inspect table schema

```bash
bq show --schema --format=prettyjson <project_id>:<dataset>.<table>
```

### Run a query

```bash
bq query --use_legacy_sql=false --format=prettyjson 'SELECT * FROM `<project>.<dataset>.<table>` LIMIT 10'
```

### Row count

```bash
bq query --use_legacy_sql=false 'SELECT COUNT(*) AS row_count FROM `<project>.<dataset>.<table>`'
```

### Load a CSV file

```bash
bq load --autodetect --source_format=CSV <project>:<dataset>.<table> <path/to/file.csv>
```

### Load a JSON file

```bash
bq load --autodetect --source_format=NEWLINE_DELIMITED_JSON <project>:<dataset>.<table> <path/to/file.json>
```

### Create a partitioned table

```bash
bq query --use_legacy_sql=false --destination_table=<project>:<dataset>.<table> --time_partitioning_field=<date_column> 'SELECT * FROM `<source_table>`'
```

### Table info (row count, size, partitioning)

```bash
bq show --format=prettyjson <project>:<dataset>.<table>
```

## Best Practices

- Always use standard SQL (`--use_legacy_sql=false`)
- Partition large tables by date columns
- Cluster tables by frequently filtered columns
- Use `LIMIT` for exploratory queries to control costs
- Prefer `bq query --dry_run` to estimate query cost before running
