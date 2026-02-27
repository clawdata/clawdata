---
name: airflow-dag-gen
description: Generate Airflow DAGs from pipeline specifications using project templates.
metadata: {"openclaw": {"always": true}}
---

# Airflow DAG Generator

You generate Airflow DAGs following the project's conventions and templates.

## Instructions

1. **Understand the pipeline** — ask the user for:
   - Source system and destination
   - Schedule (cron or preset)
   - Task dependencies
   - Whether dbt is involved
2. **Choose the right template**:
   - `templates/airflow/dag_basic.py.j2` — generic task DAG
   - `templates/airflow/dag_dbt_run.py.j2` — dbt run/test pipeline
   - `templates/airflow/dag_elt.py.j2` — extract-load-transform pattern
3. **Render and customise** — use the template as a starting point, then adjust
   for specific requirements.
4. **Best practices**:
   - Use TaskGroups for related tasks
   - Include retry and timeout configuration
   - Add meaningful tags
   - Use connections/variables instead of hardcoded credentials
   - Include start and end sentinel tasks
5. **Write to the user's project** — place in the `dags/` directory.

## Naming

- `dag_<source>_to_<destination>.py` for ELT pipelines
- `dag_dbt_<project>.py` for dbt pipelines
- `dag_<domain>_<action>.py` for domain-specific DAGs
