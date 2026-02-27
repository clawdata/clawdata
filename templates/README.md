# Templates

Reference Jinja2 templates that agents can use when generating data engineering
artifacts. Organized by domain.

## Categories

| Category | Contents |
|----------|----------|
| `dbt/` | dbt model templates (staging, intermediate, mart), source/schema YAML |
| `airflow/` | Airflow DAG templates (basic, dbt-run, ELT pattern) |
| `sql/` | Raw SQL patterns (CREATE TABLE, SCD2 merge) |

## Usage

Templates are served via the API (`GET /api/templates`) and can be rendered with
variables (`POST /api/templates/{id}/render`). The agent can also read them
directly from the `templates/` directory using the `read` tool.

## Variables

Each template declares expected variables in its metadata. Use Jinja2 `{{ var }}`
syntax. Variables are validated at render time.
