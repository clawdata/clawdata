# Skills

Data engineering skill definitions for OpenClaw agents. Each skill is a directory
containing a `SKILL.md` file following the
[AgentSkills](https://agentskills.io/) spec.

## Available Skills

| Skill | Description |
|-------|------------|
| `dbt-model-gen` | Generate dbt models from source definitions |
| `duckdb` | Query & explore a local DuckDB warehouse via CLI |
| `sql-reviewer` | Review SQL for best practices and anti-patterns |
| `airflow-dag-gen` | Generate Airflow DAGs from pipeline specs |
| `data-quality` | Add data quality checks to dbt models |

## Adding Skills

Create a new directory under `skills/` with a `SKILL.md` file containing YAML
frontmatter (`name`, `description`) and instructions for the agent.
