"""
clawdata_etl — Full ETL pipeline DAG with TaskGroups.

Ingest all CSV data → run dbt transformations (bronze → silver → gold) → run dbt tests.
Scheduled daily with no backfill.
"""

from airflow import DAG
from airflow.operators.bash import BashOperator
from airflow.utils.task_group import TaskGroup
from datetime import datetime, timedelta

default_args = {
    "owner": "clawdata",
    "retries": 1,
    "retry_delay": timedelta(minutes=5),
}

with DAG(
    dag_id="clawdata_etl",
    description="Full clawdata pipeline: ingest → dbt run → dbt test",
    start_date=datetime(2026, 1, 1),
    schedule="@daily",
    catchup=False,
    default_args=default_args,
    tags=["clawdata", "etl"],
) as dag:

    # ── Ingest ──────────────────────────────────────────────────────

    with TaskGroup("ingest", tooltip="Load raw data into DuckDB") as ingest_group:
        ingest_all = BashOperator(
            task_id="ingest_all",
            bash_command="clawdata data ingest-all",
        )

    # ── dbt Transformations ─────────────────────────────────────────

    with TaskGroup("dbt_transform", tooltip="Run dbt models by layer") as transform_group:
        dbt_seed = BashOperator(
            task_id="dbt_seed",
            bash_command="clawdata dbt seed",
        )

        dbt_run_bronze = BashOperator(
            task_id="dbt_run_bronze",
            bash_command="clawdata dbt run --models tag:bronze",
        )

        dbt_run_silver = BashOperator(
            task_id="dbt_run_silver",
            bash_command="clawdata dbt run --models tag:silver",
        )

        dbt_run_gold = BashOperator(
            task_id="dbt_run_gold",
            bash_command="clawdata dbt run --models tag:gold",
        )

        dbt_seed >> dbt_run_bronze >> dbt_run_silver >> dbt_run_gold

    # ── dbt Tests ───────────────────────────────────────────────────

    with TaskGroup("dbt_quality", tooltip="Run dbt tests and checks") as quality_group:
        dbt_test = BashOperator(
            task_id="dbt_test",
            bash_command="clawdata dbt test",
        )

    # ── DAG dependencies ────────────────────────────────────────────

    ingest_group >> transform_group >> quality_group
