---
name: dagster
description: "Build and manage Dagster data pipelines -- create assets, jobs, schedules, sensors, and resources."
metadata: {"openclaw": {"emoji": "🗡️", "requires": {"bins": ["dagster"]}, "tags": ["orchestration", "dagster", "pipeline", "etl", "data"]}}
---

# Dagster

You help build and manage Dagster data pipelines using the **`dagster`** CLI.
Use this when the user wants to create assets, jobs, schedules, or manage Dagster projects.

## Project Structure

A typical Dagster project:

```
my_project/
|-- my_project/
|   |-- __init__.py
|   |-- assets/
|   |   |-- __init__.py
|   |   |-- ingestion.py
|   |   \-- transformations.py
|   |-- resources/
|   |   \-- __init__.py
|   |-- jobs.py
|   |-- schedules.py
|   \-- sensors.py
|-- pyproject.toml
\-- setup.py
```

## Commands

### Create a new project

```bash
dagster project scaffold --name my_project
```

### Start the development UI

```bash
dagster dev -f my_project/__init__.py
```

### Run a job

```bash
dagster job execute -f my_project/__init__.py -j my_job
```

### Materialise assets

```bash
dagster asset materialize --select my_asset -f my_project/__init__.py
```

### Check definitions

```bash
dagster definitions validate -f my_project/__init__.py
```

## Asset Patterns

### Basic software-defined asset

```python
from dagster import asset

@asset
def raw_orders():
    """Ingest raw orders from source."""
    ...
```

### Asset with dependencies

```python
@asset(deps=[raw_orders])
def cleaned_orders(raw_orders):
    """Clean and validate orders."""
    ...
```

### Partitioned asset

```python
from dagster import asset, DailyPartitionsDefinition

@asset(partitions_def=DailyPartitionsDefinition(start_date="2024-01-01"))
def daily_metrics(context):
    partition_date = context.partition_key
    ...
```

## Best Practices

- Prefer software-defined assets over ops/jobs for data pipelines
- Use `@asset` with type annotations and docstrings
- Define resources (database connections, API clients) separately
- Use partition definitions for incremental processing
- Add metadata and descriptions for observability
- Group related assets with `@asset(group_name="...")`
