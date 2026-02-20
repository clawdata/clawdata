# ClawData Streamlit Explorer

Interactive data exploration UI for the ClawData DuckDB warehouse.

## Quick Start

```bash
# Install dependencies
pip install -r apps/streamlit/requirements.txt

# Make sure you have data loaded
clawdata data ingest-all

# Launch the explorer
streamlit run apps/streamlit/app.py
```

## Features

- **Browse Tables** — select any table, preview rows, quick bar charts
- **SQL Query** — run ad-hoc SQL against the DuckDB warehouse
- **Column Profile** — null counts, distinct counts, min/max per column

## Configuration

Set `CLAWDATA_DB_PATH` to point to a different DuckDB file:

```bash
CLAWDATA_DB_PATH=./data/prod.duckdb streamlit run apps/streamlit/app.py
```
