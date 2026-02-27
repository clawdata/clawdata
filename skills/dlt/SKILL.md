---
name: dlt
description: "Build data ingestion pipelines with dlt (data load tool) — extract from APIs, databases, and files, then load to any destination."
metadata: {"openclaw": {"emoji": "🔄", "requires": {"bins": ["dlt"]}, "tags": ["ingestion", "dlt", "etl", "elt", "pipeline", "data"]}}
---

# dlt (data load tool)

You help build data ingestion pipelines using **`dlt`**.
Use this when the user wants to extract data from APIs, databases, or files and load it into a warehouse or lakehouse.

## Commands

### Initialise a new pipeline

```bash
dlt init <source_name> <destination_name>
```

Example:

```bash
dlt init sql_database duckdb
```

### Run a pipeline

```bash
python <pipeline_script>.py
```

### Check pipeline status

```bash
dlt pipeline <pipeline_name> info
```

### List loaded tables

```bash
dlt pipeline <pipeline_name> show
```

## Pipeline Patterns

### Basic API source

```python
import dlt

@dlt.source
def my_api_source(api_key=dlt.secrets.value):
    @dlt.resource(write_disposition="replace")
    def customers():
        response = requests.get("https://api.example.com/customers",
                                headers={"Authorization": f"Bearer {api_key}"})
        yield response.json()

    return customers

pipeline = dlt.pipeline(
    pipeline_name="my_api",
    destination="duckdb",
    dataset_name="raw",
)

load_info = pipeline.run(my_api_source())
print(load_info)
```

### Incremental loading

```python
@dlt.resource(write_disposition="merge", primary_key="id")
def orders(updated_at=dlt.sources.incremental("updated_at")):
    params = {"since": updated_at.last_value}
    response = requests.get("https://api.example.com/orders", params=params)
    yield response.json()
```

### SQL database source

```python
from dlt.sources.sql_database import sql_database

source = sql_database(
    credentials="postgresql://user:pass@host:5432/db",
    schema="public",
    table_names=["customers", "orders"],
)

pipeline = dlt.pipeline(destination="bigquery", dataset_name="raw")
pipeline.run(source)
```

## Supported Destinations

- DuckDB, PostgreSQL, BigQuery, Snowflake, Redshift, Databricks, Synapse, Filesystem (S3, GCS)

## Best Practices

- Use `dlt.secrets` and `dlt.config` for credentials — never hardcode
- Choose `write_disposition` carefully: `replace`, `append`, or `merge`
- Define `primary_key` for merge operations
- Use `dlt.sources.incremental` for efficient incremental loads
- Add schema contracts to catch source schema changes
- Store pipeline state with the destination for production deployments
