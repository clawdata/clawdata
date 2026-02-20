---
name: dlt
description: >
  Declarative data ingestion with dlt (data load tool) — replace manual CSV
  loading with source connectors for APIs, databases, and SaaS platforms.
metadata:
  openclaw:
    requires:
      bins: [dlt, clawdata]
    primaryEnv: DLT_DESTINATION
    tags: [ingestion, etl, connectors, api, dlt, pipeline]
---

# dlt (data load tool)

Declarative ingestion pipelines — replace manual CSV loading with
source connectors for APIs, databases, and SaaS platforms.

## Commands

| Task | Command |
|------|---------|
| Initialise dlt pipeline | `clawdata dlt init <source> duckdb` |
| Run a pipeline | `clawdata dlt run <pipeline>` |
| List available sources | `clawdata dlt sources` |
| Check pipeline status | `clawdata dlt status <pipeline>` |
| Show schema | `clawdata dlt schema <pipeline>` |

## Supported Sources

dlt supports 100+ verified sources including:

| Source | Example |
|--------|---------|
| REST APIs | GitHub, Notion, Slack, HubSpot |
| Databases | PostgreSQL, MySQL, MongoDB |
| SaaS | Stripe, Salesforce, Google Sheets |
| Files | CSV, JSON, Parquet (local or remote) |

## Example Pipeline

```python
# pipelines/github_pipeline.py
import dlt
from dlt.sources.rest_api import rest_api_source

source = rest_api_source({
    "client": {"base_url": "https://api.github.com"},
    "resources": ["repos/{owner}/{repo}/issues"],
})

pipeline = dlt.pipeline(
    pipeline_name="github_issues",
    destination="duckdb",
    dataset_name="github",
)

pipeline.run(source)
```

## When to use

- User wants to load data from an API → `clawdata dlt init <source> duckdb`
- User wants to replace manual CSV downloads → create a dlt pipeline
- User needs incremental loading from a database → dlt handles state management

## Integration

dlt writes directly to DuckDB, so loaded data is immediately available
for dbt transformations and SQL queries.
