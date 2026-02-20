# ClawData Prefect Flows

Alternative orchestrator using [Prefect](https://www.prefect.io/) for teams
that prefer a Python-native approach over Airflow.

## Quick Start

```bash
pip install prefect

# Start Prefect server (optional — for UI)
prefect server start

# Run the ETL flow
python apps/prefect/flows.py
```

## Flows

| Flow | Description |
|------|-------------|
| `clawdata_etl` | Full pipeline: ingest → dbt seed → dbt run → dbt test → docs → quality check |
| `clawdata_dbt_only` | dbt only: seed → run → test |

## Scheduling

Deploy with a cron schedule:

```python
clawdata_etl.serve(name="clawdata-etl", cron="0 6 * * *")
```

## Configuration

| Env Var | Default | Description |
|---------|---------|-------------|
| `CLAWDATA_ROOT` | auto-detected | Project root directory |
| `DB_PATH` | `data/warehouse.duckdb` | DuckDB database path |
