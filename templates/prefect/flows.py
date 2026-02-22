"""
ClawData Prefect Flows
======================

Prefect flows mirroring the Airflow DAGs for teams that prefer
Prefect's Python-native approach.

Flows:
  - clawdata_etl: Full pipeline (ingest → dbt run → dbt test)
  - clawdata_dbt_only: dbt run + test only

Usage:
    pip install prefect
    prefect server start          # local UI
    python apps/prefect/flows.py  # register & run
"""

from __future__ import annotations

import os
import subprocess
from datetime import timedelta
from pathlib import Path

try:
    from prefect import flow, task, get_run_logger
    from prefect.tasks import task_input_hash
except ImportError:
    # Allow import for testing even when prefect is not installed
    def flow(*a, **kw):  # type: ignore
        def decorator(fn):
            fn._is_flow = True
            fn.serve = lambda **sk: None
            return fn
        return decorator if not a else decorator(a[0])

    def task(*a, **kw):  # type: ignore
        def decorator(fn):
            fn._is_task = True
            return fn
        return decorator if not a else decorator(a[0])

    def get_run_logger():  # type: ignore
        import logging
        return logging.getLogger("prefect.mock")

    class task_input_hash:  # type: ignore
        pass


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
PROJECT_ROOT = Path(os.environ.get("CLAWDATA_ROOT", Path(__file__).resolve().parent.parent.parent))
DBT_PROJECT_DIR = PROJECT_ROOT / "apps" / "dbt"
DATA_DIR = PROJECT_ROOT / "data" / "sample"
DB_PATH = os.environ.get("DB_PATH", str(PROJECT_ROOT / "data" / "warehouse.duckdb"))


def _run(cmd: list[str], cwd: str | Path | None = None) -> str:
    """Run a shell command and return stdout."""
    result = subprocess.run(cmd, capture_output=True, text=True, cwd=cwd)
    if result.returncode != 0:
        raise RuntimeError(f"Command failed: {' '.join(cmd)}\n{result.stderr}")
    return result.stdout


# ---------------------------------------------------------------------------
# Tasks
# ---------------------------------------------------------------------------
@task(name="ingest_data", retries=2, retry_delay_seconds=30)
def ingest_data() -> str:
    """Ingest all CSV files from data/sample/ into DuckDB."""
    logger = get_run_logger()
    logger.info("Ingesting data from %s", DATA_DIR)
    output = _run(["node", str(PROJECT_ROOT / "build" / "cli.js"), "data", "ingest-all"])
    logger.info(output)
    return output


@task(name="dbt_seed")
def dbt_seed() -> str:
    """Run dbt seed to load reference data."""
    logger = get_run_logger()
    logger.info("Running dbt seed")
    return _run(["dbt", "seed", "--project-dir", str(DBT_PROJECT_DIR), "--profiles-dir", str(DBT_PROJECT_DIR)])


@task(name="dbt_run", retries=1, retry_delay_seconds=60)
def dbt_run() -> str:
    """Run all dbt models."""
    logger = get_run_logger()
    logger.info("Running dbt run")
    return _run(["dbt", "run", "--project-dir", str(DBT_PROJECT_DIR), "--profiles-dir", str(DBT_PROJECT_DIR)])


@task(name="dbt_test")
def dbt_test() -> str:
    """Run dbt tests."""
    logger = get_run_logger()
    logger.info("Running dbt test")
    return _run(["dbt", "test", "--project-dir", str(DBT_PROJECT_DIR), "--profiles-dir", str(DBT_PROJECT_DIR)])


@task(name="dbt_docs_generate")
def dbt_docs_generate() -> str:
    """Generate dbt documentation."""
    logger = get_run_logger()
    logger.info("Generating dbt docs")
    return _run(["dbt", "docs", "generate", "--project-dir", str(DBT_PROJECT_DIR), "--profiles-dir", str(DBT_PROJECT_DIR)])


@task(name="data_quality_check")
def data_quality_check() -> str:
    """Run basic data quality checks via SQL."""
    logger = get_run_logger()
    logger.info("Running data quality checks")
    output = _run(["node", str(PROJECT_ROOT / "build" / "cli.js"), "db", "query", "SELECT COUNT(*) AS row_count FROM information_schema.tables WHERE table_schema = 'main'"])
    logger.info(output)
    return output


# ---------------------------------------------------------------------------
# Flows
# ---------------------------------------------------------------------------
@flow(name="clawdata_etl", log_prints=True)
def clawdata_etl():
    """Full ETL pipeline: ingest → seed → transform → test → docs."""
    ingest_data()
    dbt_seed()
    dbt_run()
    dbt_test()
    dbt_docs_generate()
    data_quality_check()
    print("ETL pipeline complete")


@flow(name="clawdata_dbt_only", log_prints=True)
def clawdata_dbt_only():
    """dbt-only pipeline: seed → run → test."""
    dbt_seed()
    dbt_run()
    dbt_test()
    print("dbt pipeline complete")


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    # Run the ETL flow immediately, or use .serve() for scheduled deployment
    # clawdata_etl.serve(name="clawdata-etl-deployment", cron="0 6 * * *")
    clawdata_etl()
