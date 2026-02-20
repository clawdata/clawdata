---
name: dagster
description: >
  Asset-based orchestration with Dagster — define data assets, sensors,
  and schedules for pipeline management.
metadata:
  openclaw:
    requires:
      bins: [dagster, dagit, clawdata]
    primaryEnv: DAGSTER_HOME
    tags: [orchestration, dagster, assets, pipeline, scheduler]
---

# Dagster

Alternative orchestrator skill using [Dagster](https://dagster.io/) for
asset-based pipeline management.

## Commands

| Task | Command |
|------|---------|
| Start Dagster UI | `clawdata dagster dev` |
| Run all assets | `clawdata dagster materialize --all` |
| Run specific asset | `clawdata dagster materialize <asset>` |
| Check asset status | `clawdata dagster status` |
| Run sensor check | `clawdata dagster sensor tick <name>` |

## Asset Definitions

```python
# assets.py
from dagster import asset, AssetExecutionContext
import duckdb

@asset(group_name="bronze")
def raw_customers(context: AssetExecutionContext):
    """Ingest customer CSV into DuckDB."""
    con = duckdb.connect("data/warehouse.duckdb")
    con.execute("CREATE OR REPLACE TABLE raw_customers AS SELECT * FROM read_csv_auto('data/sample/sample_customers.csv')")
    context.log.info("Loaded raw_customers")

@asset(group_name="silver", deps=[raw_customers])
def slv_customers(context: AssetExecutionContext):
    """Clean and deduplicate customers."""
    con = duckdb.connect("data/warehouse.duckdb")
    con.execute("CREATE OR REPLACE TABLE slv_customers AS SELECT DISTINCT * FROM raw_customers")
    context.log.info("Created slv_customers")
```

## When to use

- Team prefers asset-based orchestration over DAG-based → Dagster
- Need software-defined assets with automatic lineage → Dagster
- Want built-in asset catalog and observability → Dagster UI

## Integration

Dagster works alongside dbt via `dagster-dbt`:

```python
from dagster_dbt import DbtCliResource, dbt_assets

@dbt_assets(manifest=dbt_manifest_path)
def clawdata_dbt_assets(context, dbt: DbtCliResource):
    yield from dbt.cli(["build"], context=context).stream()
```
