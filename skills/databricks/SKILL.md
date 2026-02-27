---
name: databricks
description: "Work with Databricks — manage clusters, run notebooks, execute SQL queries, and interact with Unity Catalog."
metadata: {"openclaw": {"emoji": "🧱", "requires": {"bins": ["databricks"]}, "tags": ["databricks", "spark", "sql", "cloud", "data", "lakehouse"]}}
---

# Databricks

You help manage Databricks workspaces using the **`databricks`** CLI.
Use this when the user asks about Databricks clusters, notebooks, SQL, or Unity Catalog.

## Authentication

Ensure the user has configured the Databricks CLI:

```bash
databricks configure --token
```

Or set environment variables: `DATABRICKS_HOST` and `DATABRICKS_TOKEN`.

## Commands

### Workspace

#### List workspace contents

```bash
databricks workspace ls /Users/<user>
```

#### Import a notebook

```bash
databricks workspace import <local_path> <remote_path> --language PYTHON
```

#### Export a notebook

```bash
databricks workspace export <remote_path> <local_path>
```

### Clusters

#### List clusters

```bash
databricks clusters list --output JSON
```

#### Start a cluster

```bash
databricks clusters start --cluster-id <cluster_id>
```

#### Get cluster status

```bash
databricks clusters get --cluster-id <cluster_id>
```

### SQL (Databricks SQL)

#### Execute a SQL query

```bash
databricks sql execute --sql "SELECT * FROM <catalog>.<schema>.<table> LIMIT 10"
```

#### List SQL warehouses

```bash
databricks sql warehouses list
```

### Unity Catalog

#### List catalogs

```bash
databricks unity-catalog catalogs list
```

#### List schemas

```bash
databricks unity-catalog schemas list --catalog-name <catalog>
```

#### List tables

```bash
databricks unity-catalog tables list --catalog-name <catalog> --schema-name <schema>
```

#### Describe a table

```bash
databricks unity-catalog tables get --full-name <catalog>.<schema>.<table>
```

### Jobs

#### List jobs

```bash
databricks jobs list --output JSON
```

#### Run a job

```bash
databricks jobs run-now --job-id <job_id>
```

## Best Practices

- Use Unity Catalog for data governance and access control
- Prefer SQL warehouses for analytical queries (cost-effective)
- Use Delta Lake format for all tables
- Apply liquid clustering instead of manual partitioning
- Use job clusters instead of all-purpose clusters for production
- Follow the medallion architecture (bronze → silver → gold)
