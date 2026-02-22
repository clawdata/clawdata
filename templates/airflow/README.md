# Airflow — OpenClaw Data Pipelines

This directory contains Apache Airflow DAGs that orchestrate the clawdata
pipeline: ingest → transform → test.

## Setup

Point Airflow at this DAGs folder:

```bash
export AIRFLOW__CORE__DAGS_FOLDER="$(pwd)/apps/airflow/dags"
```

Or symlink into Airflow's default location:

```bash
ln -s "$(pwd)/apps/airflow/dags" ~/airflow/dags/clawdata
```

## DAGs

| DAG | Schedule | Description |
|-----|----------|-------------|
| `clawdata_etl` | `@daily` | Full pipeline: ingest all data → dbt run → dbt test |
| `clawdata_dbt_only` | `@hourly` | Lightweight: dbt run → dbt test (no ingest) |

## Quick start

```bash
# Initialise Airflow metadata DB (first time only)
airflow db migrate

# Unpause DAGs
airflow dags unpause clawdata_etl
airflow dags unpause clawdata_dbt_only

# Trigger a manual run
airflow dags trigger clawdata_etl

# Start the scheduler (keeps running)
airflow scheduler
```
