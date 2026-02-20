# ClawData Evidence Analytics

Markdown-based analytics dashboards powered by [Evidence](https://evidence.dev) and the ClawData DuckDB warehouse.

## Quick Start

```bash
# Install Evidence CLI
npm install -g @evidence-dev/evidence

# Navigate to the Evidence app
cd apps/evidence

# Install dependencies
npm install

# Start the dev server
npm run dev
```

## Pages

| Page | Description |
|------|-------------|
| `/` | Overview dashboard with table count |
| `/revenue` | Monthly revenue, orders, and payment breakdown |
| `/customers` | Customer segmentation and top-spenders |

## Data Source

The app connects to `../../data/warehouse.duckdb` via the DuckDB connector.
Make sure you've run `clawdata data ingest-all && clawdata dbt run` before starting.

## Adding Pages

Create a new `.md` file in `pages/`. Use SQL code fences to query data and
Evidence components (`<BarChart>`, `<LineChart>`, `<DataTable>`, etc.) to visualize.
