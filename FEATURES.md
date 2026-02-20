# Feature Roadmap

Ideas and improvements for ClawData — organised by area.

> Features marked with ✅ have been implemented and tested.

---

## New Skills

| Skill | Description |
|-------|-------------|
| **Postgres** | Query and manage PostgreSQL databases — `DatabaseManager` already stubs `postgres` as a type but has no implementation |
| **BigQuery** | Google BigQuery skill — query, load, manage datasets. `DatabaseType` already includes `bigquery` |
| **Databricks** | Databricks SQL warehouse queries, Unity Catalog browsing, job triggers |
| **Spark** | Submit and monitor Spark jobs, read logs, manage clusters |
| **Great Expectations** | Data quality validation as a standalone skill — define expectations, run suites, review results |
| **dlt (data load tool)** | Declarative ingestion pipelines — replace manual CSV loading with source connectors (APIs, databases, SaaS) |
| **Dagster** | Alternative orchestrator skill — asset-based pipelines, sensors, schedules |
| **Fivetran / Airbyte** | Managed connector skill — trigger syncs, check status, browse connectors |
| **S3 / GCS / Azure Blob** | Cloud storage skill — list, upload, download, preview files from object stores |
| **Kafka** | Produce/consume messages, list topics, check consumer group lag |
| **Metabase / Superset** | BI skill — create questions, refresh dashboards, export charts |

---

## CLI Improvements

### Query & Output
- ✅ **`db export`** — export query results to CSV, JSON, or Parquet (`clawdata db export "SELECT …" --format parquet -o out.parquet`)
- ✅ **`db sample <table>`** — quick shorthand for `SELECT * FROM <table> LIMIT N` with configurable row count
- ✅ **`db diff <table> --before <ref>`** — compare table state before/after a dbt run (row counts, schema changes, value distributions)
- ✅ **`db profile <table>`** — column-level stats: nulls, distinct count, min/max, mean, percentiles
- ✅ **Pretty table output** — use box-drawing characters, colour headers, truncate wide columns; optionally use a pager for large results
- ✅ **`--format` flag** — global output format: `table`, `csv`, `json`, `markdown`

### Data Ingestion
- ✅ **Glob / directory ingestion** — `clawdata data ingest "logs/*.json"` to load multiple files matching a pattern
- ✅ **Remote file support** — ingest from URLs or S3 paths (`clawdata data ingest https://example.com/data.csv`)
- ✅ **Schema inference preview** — show inferred types before loading so the user can confirm or override
- ✅ **Incremental ingestion** — detect already-loaded files and skip them (track checksums / modified timestamps)
- ✅ **Excel support** — `.xlsx` / `.xls` ingestion via DuckDB's `spatial` or `excel` extension

### Workflow
- ✅ **`clawdata init`** — scaffold a new project from scratch (create `data/`, `apps/dbt/`, sample models, profiles, skills config)
- ✅ **`clawdata run`** — one-command full pipeline: ingest → dbt run → dbt test (similar to the Airflow ETL DAG but local)
- ✅ **`clawdata watch`** — file watcher that re-runs affected dbt models when `.sql` files change
- ✅ **`clawdata logs`** — unified log viewer across CLI runs, dbt, and Airflow
- ✅ **`clawdata config`** — view/edit environment config (`DB_PATH`, `DATA_FOLDER`, etc.) without touching env vars directly

---

## dbt App Improvements

### Modelling
- ✅ **Bronze layer** — add raw ingestion views (`brz_*`) that `SELECT *` from source tables, completing the medallion architecture (silver now references bronze via `ref()`)
- ✅ **Incremental models** — convert high-volume gold tables (`fct_orders`, `gld_revenue_summary`) to incremental materialisation
- ✅ **Snapshots** — add SCD Type 2 snapshots for `slv_customers` and `slv_products` to track changes over time (`DbtManager.snapshot()` already exists but no snapshot files ship)
- ✅ **Custom schema per layer** — write bronze/silver/gold to separate DuckDB schemas (`bronze.*`, `silver.*`, `gold.*`) for clarity

### Testing & Quality
- ✅ **dbt-utils integration** — add common tests: `expression_is_true`, `at_least_one`, `not_constant` across all models
- ✅ **Freshness checks** — add `loaded_at_field` to sources and run `dbt source freshness`
- ✅ **Row-count assertions** — ensure gold tables are never empty after a run
- ✅ **dbt exposures** — define downstream consumers (dashboards, reports) in `schema.yml`

### Documentation & Lineage
- ✅ **`clawdata dbt lineage`** — print an ASCII DAG of the model dependency graph in the terminal
- ✅ **Auto-serve docs** — `clawdata dbt docs --serve` to open the dbt docs site in a browser
- ✅ **Model descriptions** — add `description` fields to all silver/gold model columns in `schema.yml` (many are still empty)

### Multi-project
- ✅ **Project templates** — let `clawdata init` create different starter dbt projects (e-commerce, SaaS metrics, financial reporting)
- ✅ **dbt packages** — ship a `packages.yml` with useful packages pre-configured (`dbt-utils`, `dbt-expectations`, `dbt-date`)

---

## Airflow App Improvements

- ✅ **Sensors** — add a `FileSensor` to `clawdata_etl` that waits for new files in `data/sample/` before triggering ingest
- ✅ **Notifications** — on_failure callback that logs or sends a Slack/email alert
- ✅ **TaskGroups** — group related tasks (e.g. all silver models, all gold models) for better DAG readability
- ✅ **Dynamic DAGs** — generate tasks dynamically from the dbt manifest so each model runs as its own Airflow task with correct dependencies
- **Docker-based operator** — `DockerOperator` or `KubernetesPodOperator` variants so the pipeline runs in isolated containers
- ✅ **Environment-aware scheduling** — dev DAGs run on trigger only; prod DAGs on a schedule

---

## New Apps & Integrations

### `apps/streamlit` — Data Explorer UI
A Streamlit app that connects to the DuckDB warehouse and provides:
- Table browser with column stats
- SQL playground
- dbt model lineage visualisation
- Auto-generated charts from gold tables

### `apps/evidence` — Embedded Analytics
An Evidence.dev project for markdown-based dashboards powered by `data/warehouse.duckdb`:
- Revenue dashboard from `gld_revenue_summary`
- Customer segmentation report from `gld_customer_analytics`
- Product performance from `dim_products`

### `apps/jupyter` — Notebook Environment
Pre-configured Jupyter notebooks with:
- DuckDB kernel / connection helper
- Exploratory analysis templates
- Model development workflow (prototype in notebook → convert to dbt model)

### `apps/prefect` — Alternative Orchestrator
Prefect flows mirroring the Airflow DAGs for teams that prefer Prefect's Python-native approach.

### `apps/lightdash` / `apps/metabase`
Pre-built BI project with dashboards and saved questions mapped to the gold layer.

---

## Testing & CI

- ✅ **Unit tests** — test suite for `DatabaseManager`, `DataIngestor`, `DbtManager`, and `TaskTracker` (vitest, 66 tests across 6 files)
- ✅ **Integration tests** — end-to-end: ingest sample data → query tables and assert expected values
- ✅ **CI pipeline** — GitHub Actions workflow: install → build → test → dbt run on every PR
- ✅ **Linting** — add ESLint + Prettier for TypeScript; SQLFluff for dbt SQL models
- ✅ **Type safety** — replaced `any` types in `DatabaseManager` and `DbtManager` with proper interfaces (`DatabaseInfo`, `TableInfo`, `ColumnInfo`, `ColumnProfile`, `DbtModelNode`)

---

## Developer Experience

- **Plugin architecture** — let third parties add skills by publishing npm packages (`clawdata-skill-redshift`) that register via a config file
- ✅ **Skill scaffolding** — `clawdata skill create <name>` to generate a new `SKILL.md` + folder structure
- ✅ **Config file** — `clawdata.yml` at project root for all settings (replaces scattered env vars)
- **Auto-update** — `clawdata update` to pull the latest skills and CLI from GitHub/npm
- ✅ **Shell completions** — generate zsh/bash/fish completions for all commands and subcommands
- ✅ **Progress bars** — show progress during data ingestion and dbt runs (especially for large datasets)
- ✅ **Verbose mode** — `--verbose` / `-V` flag for debugging (writes to stderr with `[verbose]` prefix)

---

## Data & Sample Datasets

- ✅ **More sample datasets** — add industry-specific datasets beyond e-commerce (SaaS metrics, IoT sensor data, financial transactions)
- **Dataset marketplace** — `clawdata data add <dataset>` to download curated datasets from a registry
- ✅ **Seed data management** — use dbt seeds for small reference tables (country codes, currency mappings) and ship them in `apps/dbt/seeds/`
- ✅ **Data dictionary** — auto-generate a `DATA_DICTIONARY.md` from DuckDB `information_schema` + dbt descriptions
- ✅ **Sample data generator** — `clawdata data generate --rows 10000` to create realistic synthetic data at scale for performance testing

---

## Architecture & Infrastructure

- **Multi-database support** — make `DatabaseManager` a proper adapter pattern so DuckDB, Postgres, Snowflake, and BigQuery share the same interface (queries, schema inspection, loading)
- ✅ **Connection profiles** — `clawdata connect add prod --type snowflake --account …` to manage multiple database connections
- ✅ **Task persistence** — persist `TaskTracker` state to disk so task history survives CLI restarts
- ✅ **Async task execution** — run long tasks (large ingests, full dbt runs) in the background and poll for status
- **HTTP API mode** — `clawdata serve` to expose the CLI as a REST API (useful for web UIs or non-OpenClaw integrations)
- ✅ **Containerisation** — Dockerfile + docker-compose for the full stack (DuckDB, dbt, Airflow, ClawData CLI)
- **Monorepo tooling** — add Turborepo or Nx for managing builds across `apps/` and `src/`
