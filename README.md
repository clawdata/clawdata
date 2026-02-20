<p align="center">
  <img src="clawdata.png" alt="ClawData" width="200" />
</p>

<h1 align="center">ClawData</h1>

<p align="center">
  Open-source data engineering skills for <a href="https://github.com/openclaw/openclaw">OpenClaw</a>
</p>

---

Data engineering shouldn't feel mysterious, fragile, or reserved for big tech teams.

**ClawData** is an open-source skills library that turns [OpenClaw](https://github.com/openclaw/openclaw) into an AI-powered data engineer. Ask it to ingest files, build transformations, query warehouses, or orchestrate pipelines — and it just works.

It currently ships with skills for:

- **DuckDB** — local analytical database, SQL queries, data ingestion
- **dbt** — data transformations with a silver → gold medallion architecture
- **Snowflake** — cloud data warehouse queries, staging, and loading
- **Apache Airflow** — pipeline orchestration, DAGs, scheduling

And because it's fully open source, you can **add your own skills** for any tool your team uses.

## Demo

<p align="center">
  <img src="demo.gif" alt="ClawData demo" width="700" />
</p>

## Quick start

```bash
# 1. Install OpenClaw (if you haven't already)
npm install -g openclaw@latest
openclaw onboard --install-daemon

# 2. Clone & install ClawData
git clone https://github.com/clawdata/clawdata.git && cd clawdata
./setup.sh

# 3. Start OpenClaw and ask it to work with your data
openclaw tui
```

The setup script installs dependencies, opens an interactive skill picker, and links everything into OpenClaw. That's it — start chatting.

## What can it do?

Once skills are linked, OpenClaw can handle requests like:

> *"Load the CSV files and show me what's in the data"*
> *"Run the dbt models and tell me if any tests fail"*
> *"Which customers have the highest lifetime value?"*
> *"Create a new dbt model that aggregates orders by month"*
> *"Show me the Airflow DAG structure"*

No MCP servers, no stdio protocols — just command-line tools that the AI agent calls on your behalf.

## Skills

| Skill | What it does |
|-------|-------------|
| **duckdb** | Query local DuckDB — SQL, tables, schemas, data ingestion |
| **dbt** | Transform data — run models, tests, compile, seeds |
| **snowflake** | Query Snowflake warehouse — SQL, staging, loading |
| **airflow** | Orchestrate pipelines — DAGs, tasks, connections |

Each skill is a `SKILL.md` file that teaches the agent when and how to use the tool. Skills are symlinked into OpenClaw's workspace so the agent discovers them automatically.

### Managing skills

```bash
clawdata skills          # interactive: toggle skills on/off
clawdata setup           # first-run wizard: picks skills + verifies prerequisites
clawdata doctor          # check that everything is configured correctly
```

## The `clawdata` CLI

The CLI is both the engine behind the skills and a standalone tool you can use directly.

```bash
clawdata help            # full command reference
```

**Data** — load and manage files:
```bash
clawdata data list                     # show files in data/
clawdata data ingest-all               # load everything into DuckDB
clawdata data reset                    # delete warehouse and start fresh
```

**Database** — query DuckDB directly:
```bash
clawdata db tables                     # list all tables
clawdata db query "SELECT * FROM dim_customers LIMIT 5"
clawdata db schema fct_orders          # show columns and types
```

**dbt** — run transformations:
```bash
clawdata dbt run                       # build all models
clawdata dbt test                      # run schema & data tests
clawdata dbt models                    # list available models
```

## Data architecture

ClawData ships with sample data and a medallion-architecture dbt project:

```
Sources (CSV)          Silver (tables)           Gold (tables)
─────────────          ───────────────           ────────────
sample_customers  →  slv_customers (dedup)   →  dim_customers
sample_products   →  slv_products (clean)    →  dim_products
sample_orders     →  slv_orders (normalise)  →  fct_orders
                     slv_order_items            gld_customer_analytics
sample_payments   →  slv_payments (validate) →  gld_revenue_summary
```

- **Silver** — cleans, deduplicates, normalises, and validates raw data
- **Gold** — dimensional model (dims + facts) and analytical aggregates

## Project layout

```
clawdata/
├── skills/                ← Skill definitions (SKILL.md files)
│   ├── duckdb/
│   ├── dbt/
│   ├── snowflake/
│   └── airflow/
├── src/                   ← TypeScript CLI source
│   ├── cli.ts             ← Entry point & dispatcher
│   ├── commands/          ← data, db, dbt, doctor
│   ├── lib/               ← database, ingestor, dbt wrapper
│   └── tui/               ← Interactive skill selector
├── apps/
│   ├── dbt/               ← dbt project (models, profiles, schema)
│   └── airflow/           ← Airflow DAGs
├── data/                  ← Drop CSV/JSON/Parquet files here
└── setup.sh               ← One-command bootstrap
```

## Contributing your own skills

ClawData is designed to be extended. Adding a new skill is straightforward:

1. **Create a folder** under `skills/` with a `SKILL.md`:
   ```
   skills/my-tool/SKILL.md
   ```

2. **Write the skill file** — this is what teaches the AI agent how to use your tool:
   ```markdown
   ---
   name: my-tool
   description: Short description of what this skill does
   tools:
     - my-tool-cli
   ---

   ## When to use
   Explain when this skill is relevant.

   ## Commands
   List the commands the agent can run and what they do.

   ## Examples
   Show example interactions.
   ```

3. **Link it** — run `clawdata skills` to link your new skill into OpenClaw

That's it. The agent will pick up the new skill on its next conversation.

### Ideas for new skills

- **Postgres / MySQL** — query production databases safely
- **Spark** — large-scale data processing
- **Great Expectations** — data quality validation
- **Dagster** — alternative pipeline orchestration
- **Kafka** — stream processing and topic management
- **Tableau / Looker** — BI tool integration

Pull requests welcome — the more skills, the more useful ClawData becomes for everyone.

## Configuration

All environment variables are auto-detected. Override only if needed:

| Variable | Default | Purpose |
|----------|---------|---------|
| `CLAWDATA_ROOT` | auto | Project root |
| `DB_PATH` | `data/warehouse.duckdb` | DuckDB file path |
| `DATA_FOLDER` | `data/` | Incoming data directory |
| `DBT_PROJECT_DIR` | `apps/dbt/` | dbt project location |
| `DBT_PROFILES_DIR` | `apps/dbt/` | dbt profiles location |
| `AIRFLOW_DAGS_FOLDER` | `apps/airflow/dags/` | Airflow DAGs directory |

## License

MIT
