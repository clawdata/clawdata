"""
clawdata_etl — Full ETL pipeline DAG.

Ingest all CSV data → run dbt transformations → run dbt tests.
Scheduled daily with no backfill.
"""

from airflow import DAG
from airflow.operators.bash import BashOperator
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

    ingest = BashOperator(
        task_id="ingest_data",
        bash_command="clawdata data ingest-all",
    )

    transform = BashOperator(
        task_id="dbt_run",
        bash_command="clawdata dbt run",
    )

    test = BashOperator(
        task_id="dbt_test",
        bash_command="clawdata dbt test",
    )

    ingest >> transform >> test
