---
name: airflow
description: >
  Orchestrate data pipelines with Apache Airflow — trigger DAGs, monitor runs,
  manage connections, and inspect task logs. Uses the airflow CLI.
metadata:
  openclaw:
    requires:
      bins: [clawdata]
    primaryEnv: AIRFLOW_DAGS_FOLDER
    tags: [orchestration, airflow, pipeline, scheduling, workflow]
---

# Airflow

You can manage and orchestrate data pipelines using the **`airflow`** CLI.
Use this when the user asks about scheduling, DAG runs, pipeline monitoring, or workflow management.

> For data queries, use the **duckdb** or **snowflake** skill. For transformations, use the **dbt** skill.

## Commands

### DAGs

| Task | Command |
|------|---------|
| List all DAGs | `airflow dags list` |
| Show DAG details | `airflow dags show <dag_id>` |
| Trigger a DAG | `airflow dags trigger <dag_id>` |
| Trigger with config | `airflow dags trigger <dag_id> --conf '{"key":"value"}'` |
| Pause a DAG | `airflow dags pause <dag_id>` |
| Unpause a DAG | `airflow dags unpause <dag_id>` |
| List DAG runs | `airflow dags list-runs -d <dag_id>` |
| Backfill | `airflow dags backfill <dag_id> -s <start> -e <end>` |

### Tasks

| Task | Command |
|------|---------|
| List tasks in DAG | `airflow tasks list <dag_id>` |
| Task state | `airflow tasks state <dag_id> <task_id> <execution_date>` |
| Task logs | `airflow tasks log <dag_id> <task_id> <execution_date>` |
| Test a task | `airflow tasks test <dag_id> <task_id> <execution_date>` |
| Clear task | `airflow tasks clear <dag_id> -t <task_id> -s <start> -e <end>` |

### Connections & Variables

| Task | Command |
|------|---------|
| List connections | `airflow connections list` |
| Add connection | `airflow connections add <conn_id> --conn-uri <uri>` |
| Delete connection | `airflow connections delete <conn_id>` |
| List variables | `airflow variables list` |
| Get variable | `airflow variables get <key>` |
| Set variable | `airflow variables set <key> <value>` |

### System

| Task | Command |
|------|---------|
| Check health | `airflow db check` |
| Show config | `airflow config list` |
| Show version | `airflow version` |
| List providers | `airflow providers list` |
| Show pools | `airflow pools list` |

Add `-o json` to most commands for JSON output.

## When to use

- User asks about pipelines or DAGs → `airflow dags list`
- User wants to run a pipeline → `airflow dags trigger <dag_id>`
- User asks about a failed run → `airflow dags list-runs`, then `airflow tasks log`
- User wants to schedule something → create a DAG file, then `airflow dags unpause`
- User asks about connections → `airflow connections list`

## Typical workflow

1. **See available pipelines:**
   ```bash
   airflow dags list -o json
   ```

2. **Trigger a run:**
   ```bash
   airflow dags trigger my_etl_pipeline
   ```

3. **Monitor progress:**
   ```bash
   airflow dags list-runs -d my_etl_pipeline -o json
   ```

4. **Check task logs on failure:**
   ```bash
   airflow tasks list my_etl_pipeline
   airflow tasks log my_etl_pipeline load_data 2026-02-19
   ```

5. **Clear and retry failed tasks:**
   ```bash
   airflow tasks clear my_etl_pipeline -t load_data -s 2026-02-19 -e 2026-02-19
   ```

## Creating a DAG

DAG files live in `apps/airflow/dags/` (configured via `AIRFLOW_DAGS_FOLDER`).

The project ships with two sample DAGs:

| DAG | Schedule | Description |
|-----|----------|-------------|
| `clawdata_etl` | `@daily` | Full pipeline: ingest → dbt run → dbt test |
| `clawdata_dbt_only` | `@hourly` | Lightweight: dbt run → dbt test |

Example (`apps/airflow/dags/daily_etl.py`):

```python
from airflow import DAG
from airflow.operators.bash import BashOperator
from datetime import datetime, timedelta

with DAG(
    "daily_etl",
    start_date=datetime(2026, 1, 1),
    schedule="@daily",
    catchup=False,
    default_args={"retries": 1, "retry_delay": timedelta(minutes=5)},
) as dag:

    ingest = BashOperator(
        task_id="ingest_data",
        bash_command="clawdata data ingest-all",
    )

    transform = BashOperator(
        task_id="run_dbt",
        bash_command="clawdata dbt run",
    )

    test = BashOperator(
        task_id="test_dbt",
        bash_command="clawdata dbt test",
    )

    ingest >> transform >> test
```

After creating, unpause with `airflow dags unpause daily_etl`.

## Error recovery

| Problem | Fix |
|---------|-----|
| `airflow: command not found` | `pip install apache-airflow` |
| DB not initialised | `airflow db init` (first time) or `airflow db migrate` |
| DAG not appearing | Check `$AIRFLOW_HOME/dags/` and `airflow dags list` |
| Task failed | `airflow tasks log <dag> <task> <date>` to see the error |
| Scheduler not running | `airflow scheduler -D` (daemon) or run in foreground |
| Webserver not running | `airflow webserver -p 8080 -D` |

## Environment

| Env var | Default | Purpose |
|---------|---------|---------|
| `AIRFLOW_HOME` | `~/airflow` | Airflow config and DAGs directory |
| `AIRFLOW_DAGS_FOLDER` | `apps/airflow/dags` | OpenClaw DAGs directory |
| `AIRFLOW__CORE__DAGS_FOLDER` | `$AIRFLOW_HOME/dags` | Override DAG location |
| `AIRFLOW__DATABASE__SQL_ALCHEMY_CONN` | SQLite | Metadata database connection |

## Notes

- Airflow's scheduler must be running for scheduled DAGs to execute
- Use `airflow tasks test` to run a task without recording it in the DB (useful for debugging)
- The example DAG above integrates with `clawdata` — tying Airflow orchestration to dbt transforms
- Add `-o json` for machine-readable output on most commands
