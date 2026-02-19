"""
clawdata_dbt_only — Lightweight transformation DAG.

Run dbt models and tests without re-ingesting data.
Useful for iterating on model changes.
"""

from airflow import DAG
from airflow.operators.bash import BashOperator
from datetime import datetime, timedelta

default_args = {
    "owner": "clawdata",
    "retries": 1,
    "retry_delay": timedelta(minutes=2),
}

with DAG(
    dag_id="clawdata_dbt_only",
    description="Lightweight pipeline: dbt run → dbt test",
    start_date=datetime(2026, 1, 1),
    schedule="@hourly",
    catchup=False,
    default_args=default_args,
    tags=["clawdata", "dbt"],
) as dag:

    transform = BashOperator(
        task_id="dbt_run",
        bash_command="clawdata dbt run",
    )

    test = BashOperator(
        task_id="dbt_test",
        bash_command="clawdata dbt test",
    )

    transform >> test
