"""
clawdata_docker_etl — Docker-based ETL pipeline DAG.

Each pipeline step runs inside a Docker container for full isolation.
Uses DockerOperator so the host only needs Docker + Airflow installed.

Set CLAWDATA_DOCKER_IMAGE env var to override the default image.
"""

from airflow import DAG
from airflow.operators.bash import BashOperator
from airflow.utils.task_group import TaskGroup
from datetime import datetime, timedelta
import os

try:
    from airflow.providers.docker.operators.docker import DockerOperator

    HAS_DOCKER_PROVIDER = True
except ImportError:
    HAS_DOCKER_PROVIDER = False

DOCKER_IMAGE = os.environ.get("CLAWDATA_DOCKER_IMAGE", "clawdata:latest")
DOCKER_NETWORK = os.environ.get("CLAWDATA_DOCKER_NETWORK", "bridge")
DATA_VOLUME = os.environ.get("CLAWDATA_DATA_VOLUME", "/data")

default_args = {
    "owner": "clawdata",
    "retries": 1,
    "retry_delay": timedelta(minutes=3),
}


def _make_docker_task(task_id: str, command: str, **kwargs):
    """Create a DockerOperator task (or fall back to BashOperator)."""
    if HAS_DOCKER_PROVIDER:
        return DockerOperator(
            task_id=task_id,
            image=DOCKER_IMAGE,
            command=command,
            auto_remove=True,
            docker_url="unix://var/run/docker.sock",
            network_mode=DOCKER_NETWORK,
            mount_tmp_dir=False,
            volumes=[f"{DATA_VOLUME}:/app/data"],
            environment={
                "DB_PATH": "/app/data/warehouse.duckdb",
                "DATA_FOLDER": "/app/data/sample",
            },
            **kwargs,
        )
    else:
        # Graceful fallback when docker provider is not installed
        return BashOperator(
            task_id=task_id,
            bash_command=f"docker run --rm -v {DATA_VOLUME}:/app/data {DOCKER_IMAGE} {command}",
            **kwargs,
        )


with DAG(
    dag_id="clawdata_docker_etl",
    description="Dockerised clawdata pipeline — every step runs in a container",
    start_date=datetime(2026, 1, 1),
    schedule=None,
    catchup=False,
    default_args=default_args,
    tags=["clawdata", "docker", "etl"],
) as dag:
    # ── Ingest ──────────────────────────────────────────────────────

    with TaskGroup("ingest", tooltip="Load raw data in Docker") as ingest_group:
        docker_ingest = _make_docker_task(
            task_id="docker_ingest",
            command="clawdata data ingest-all",
        )

    # ── dbt Transformations ─────────────────────────────────────────

    with TaskGroup(
        "dbt_transform", tooltip="Run dbt models in Docker"
    ) as transform_group:
        docker_dbt_seed = _make_docker_task(
            task_id="docker_dbt_seed",
            command="clawdata dbt seed",
        )

        docker_dbt_run = _make_docker_task(
            task_id="docker_dbt_run",
            command="clawdata dbt run",
        )

        docker_dbt_seed >> docker_dbt_run

    # ── dbt Tests ───────────────────────────────────────────────────

    with TaskGroup(
        "dbt_quality", tooltip="Run dbt tests in Docker"
    ) as quality_group:
        docker_dbt_test = _make_docker_task(
            task_id="docker_dbt_test",
            command="clawdata dbt test",
        )

    # ── DAG wiring ──────────────────────────────────────────────────

    ingest_group >> transform_group >> quality_group
