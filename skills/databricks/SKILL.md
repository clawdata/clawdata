---
name: databricks
description: >
  Query Databricks SQL warehouses, browse Unity Catalog, and trigger jobs.
metadata:
  openclaw:
    requires:
      bins: [clawdata]
      env: [DATABRICKS_HOST, DATABRICKS_TOKEN]
    primaryEnv: DATABRICKS_HOST
    tags: [database, databricks, spark, sql, unity-catalog]
---

# Databricks

Query Databricks SQL warehouses, browse Unity Catalog, and trigger jobs.

## Commands

| Task | Command |
|------|---------|
| Query SQL warehouse | `clawdata databricks query "SELECT ..." --warehouse <id>` |
| List catalogs | `clawdata databricks catalogs` |
| List schemas | `clawdata databricks schemas <catalog>` |
| List tables | `clawdata databricks tables <catalog>.<schema>` |
| Trigger job | `clawdata databricks job run <job-id>` |
| Job status | `clawdata databricks job status <run-id>` |

## Authentication

```bash
export DATABRICKS_HOST=https://my-workspace.cloud.databricks.com
export DATABRICKS_TOKEN=dapi...
```

## When to use

- User asks to query Databricks → `clawdata databricks query`
- User wants to browse the data catalog → `clawdata databricks catalogs`
- User needs to trigger a Databricks job → `clawdata databricks job run`
