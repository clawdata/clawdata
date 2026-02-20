"""
clawdata_dynamic — Dynamic DAG generated from the dbt manifest.

Each dbt model becomes its own Airflow task with dependencies derived
from the manifest's `depends_on.nodes` graph.  This ensures the Airflow
DAG always mirrors the dbt lineage without manual wiring.

Prerequisites:
  Run `clawdata dbt compile` (or `dbt compile`) first so that
  `apps/dbt/target/manifest.json` exists.
"""

import json
import os
from pathlib import Path

from airflow import DAG
from airflow.operators.bash import BashOperator
from datetime import datetime, timedelta

MANIFEST_PATH = os.environ.get(
    "DBT_MANIFEST_PATH",
    str(Path(__file__).resolve().parent.parent.parent / "dbt" / "target" / "manifest.json"),
)

default_args = {
    "owner": "clawdata",
    "retries": 1,
    "retry_delay": timedelta(minutes=3),
}


def load_manifest():
    """Load and return the dbt manifest, or empty dict on failure."""
    try:
        with open(MANIFEST_PATH, "r") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def build_dag():
    manifest = load_manifest()
    nodes = manifest.get("nodes", {})

    # Filter to model nodes only
    model_nodes = {
        key: node for key, node in nodes.items() if key.startswith("model.")
    }

    with DAG(
        dag_id="clawdata_dynamic",
        description="Dynamic per-model DAG generated from the dbt manifest",
        start_date=datetime(2026, 1, 1),
        schedule="@daily",
        catchup=False,
        default_args=default_args,
        tags=["clawdata", "dbt", "dynamic"],
    ) as dag:

        tasks = {}

        for key, node in model_nodes.items():
            model_name = node.get("name", key.split(".")[-1])
            task = BashOperator(
                task_id=f"dbt_run_{model_name}",
                bash_command=f"clawdata dbt run --models {model_name}",
            )
            tasks[key] = task

        # Wire up dependencies
        for key, node in model_nodes.items():
            upstream_nodes = node.get("depends_on", {}).get("nodes", [])
            for dep_key in upstream_nodes:
                if dep_key in tasks:
                    tasks[dep_key] >> tasks[key]

    return dag


dag = build_dag()
