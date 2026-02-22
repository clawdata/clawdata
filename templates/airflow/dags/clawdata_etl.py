"""
clawdata_etl — Full ETL pipeline DAG with TaskGroups.

Ingest all CSV data → run dbt transformations (bronze → silver → gold) → run dbt tests.
Scheduled daily with no backfill.
"""

from airflow import DAG
from airflow.operators.bash import BashOperator
from airflow.sensors.filesystem import FileSensor
from airflow.utils.task_group import TaskGroup
from datetime import datetime, timedelta
import logging
import os

logger = logging.getLogger(__name__)


def on_failure_callback(context):
    """Log failure details and (optionally) send a Slack/email alert."""
    task_instance = context.get("task_instance")
    dag_id = context.get("dag").dag_id if context.get("dag") else "unknown"
    task_id = task_instance.task_id if task_instance else "unknown"
    execution_date = context.get("execution_date", "unknown")
    exception = context.get("exception", "N/A")

    message = (
        f"[ALERT] Task failed — dag={dag_id} task={task_id} "
        f"execution_date={execution_date} error={exception}"
    )
    logger.error(message)

    # Extend here: send Slack webhook, email via SES/SMTP, PagerDuty, etc.
    # Example:
    #   requests.post(SLACK_WEBHOOK_URL, json={"text": message})


# ── Environment-aware scheduling ──────────────────────────────────

ENV = os.environ.get("CLAWDATA_ENV", "dev").lower()

# dev  → manual trigger only (schedule=None), fewer retries
# prod → daily schedule, more retries
if ENV == "prod":
    DAG_SCHEDULE = "@daily"
    DAG_RETRIES = 2
else:
    DAG_SCHEDULE = None
    DAG_RETRIES = 0

default_args = {
    "owner": "clawdata",
    "retries": DAG_RETRIES,
    "retry_delay": timedelta(minutes=5),
    "on_failure_callback": on_failure_callback,
}

with DAG(
    dag_id="clawdata_etl",
    description="Full clawdata pipeline: ingest → dbt run → dbt test",
    start_date=datetime(2026, 1, 1),
    schedule=DAG_SCHEDULE,
    catchup=False,
    default_args=default_args,
    tags=["clawdata", "etl", ENV],
) as dag:

    # ── File Sensor ──────────────────────────────────────────────────

    wait_for_data = FileSensor(
        task_id="wait_for_data",
        filepath="data/sample/",
        fs_conn_id="fs_default",
        poke_interval=60,
        timeout=600,
        mode="poke",
    )

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

    wait_for_data >> ingest_group >> transform_group >> quality_group
