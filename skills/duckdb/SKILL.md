---
name: duckdb
description: "Query and explore a local DuckDB warehouse — list tables, inspect schemas, run SQL, ingest CSV/JSON/Parquet files."
metadata: {"openclaw": {"emoji": "🦆", "requires": {"bins": ["duckdb"]}, "tags": ["database", "duckdb", "sql", "query", "data"]}}
---

# DuckDB

You can query and explore a local DuckDB database using the **`duckdb`** CLI.
Use this whenever the user asks about data, wants to run SQL, or needs to load files.

> For data transformations, use the **dbt** skill. For SQL code review, use the **sql-reviewer** skill.

## Database Location

The project warehouse lives at `userdata/warehouse.duckdb` (relative to the project root). Always use this path unless the user specifies a different database file.

## Sample Data

Sample CSV files are available in the project at `templates/sampledata/`:
- `templates/sampledata/sample_customers.csv`
- `templates/sampledata/sample_orders.csv`
- `templates/sampledata/sample_payments.csv`
- `templates/sampledata/sample_products.csv`

To ingest them:
```bash
duckdb userdata/warehouse.duckdb -c "CREATE TABLE customers AS SELECT * FROM read_csv_auto('templates/sampledata/sample_customers.csv');"
```

Or query them directly without loading:
```bash
duckdb -c "SELECT * FROM read_csv_auto('templates/sampledata/sample_customers.csv') LIMIT 5;"
```

## Commands

Run SQL against the warehouse using the `duckdb` CLI. The general pattern is:

```bash
duckdb userdata/warehouse.duckdb -c "<SQL>"
```

### List tables

```bash
duckdb userdata/warehouse.duckdb -c "SHOW TABLES;"
```

### Inspect a table schema

```bash
duckdb userdata/warehouse.duckdb -c "DESCRIBE <table_name>;"
```

### Run a query

```bash
duckdb userdata/warehouse.duckdb -c "SELECT * FROM <table_name> LIMIT 10;"
```

### Row counts

```bash
duckdb userdata/warehouse.duckdb -c "SELECT COUNT(*) AS row_count FROM <table_name>;"
```

### Ingest a CSV file

```bash
duckdb userdata/warehouse.duckdb -c "CREATE TABLE <name> AS SELECT * FROM read_csv_auto('<path/to/file.csv>');"
```

### Ingest a Parquet file

```bash
duckdb userdata/warehouse.duckdb -c "CREATE TABLE <name> AS SELECT * FROM read_parquet('<path/to/file.parquet>');"
```

### Ingest a JSON file

```bash
duckdb userdata/warehouse.duckdb -c "CREATE TABLE <name> AS SELECT * FROM read_json_auto('<path/to/file.json>');"
```

### Query a file directly (without loading)

DuckDB can query files in place — no need to import first:

```bash
duckdb -c "SELECT * FROM read_csv_auto('templates/sampledata/sample_customers.csv') LIMIT 5;"
```

### Export query results to CSV

```bash
duckdb userdata/warehouse.duckdb -c "COPY (SELECT * FROM <table>) TO '<output.csv>' (HEADER, DELIMITER ',');"
```

## When to Use

- User asks "what data do I have?" → `SHOW TABLES;` then `DESCRIBE <table>;`
- User asks to see sample data → `SELECT * FROM <table> LIMIT 5;`
- User asks to load a file → `CREATE TABLE ... AS SELECT * FROM read_csv_auto(...)` (or parquet/json)
- User asks a data question → write SQL and run it
- User asks about row counts, aggregations, filters → write and run the appropriate SQL
- User wants to explore a CSV/Parquet/JSON without loading → query the file directly with `read_csv_auto()` / `read_parquet()` / `read_json_auto()`
- User asks for analysis → run queries, then present results using charts and tables (see Analysis Workflow below)

## Analysis Workflow

When the user asks for analysis, follow this pattern:

1. **Query the data** using DuckDB with `-json` flag for structured output
2. **Present key metrics** in a summary markdown table
3. **Produce charts** using `chart` fenced code blocks with JSON specs (see SOUL.md for format)
4. **Show detail tables** in markdown format
5. **Provide insights** — bullet points explaining what the data tells us

### Example: Producing a Chart from Query Results

Run the query:
```bash
duckdb userdata/warehouse.duckdb -json -c "SELECT category, ROUND(SUM(unit_price * quantity), 2) AS revenue FROM orders JOIN products ON orders.product_sku = products.sku GROUP BY category ORDER BY revenue DESC LIMIT 10;"
```

Then format the results as a chart block in your response:
````
```chart
{
  "type": "bar",
  "title": "Revenue by Category",
  "data": [
    {"name": "Electronics", "value": 4800},
    {"name": "Furniture", "value": 3200}
  ],
  "xKey": "name",
  "yKey": "value",
  "color": "#6366f1"
}
```
````

### Common Analysis Queries

**Customer Lifetime Value:**
```sql
SELECT c.first_name || ' ' || c.last_name AS customer,
       COUNT(DISTINCT o.order_id) AS orders,
       ROUND(SUM(o.quantity * p.unit_price), 2) AS total_revenue,
       ROUND(AVG(o.quantity * p.unit_price), 2) AS avg_order_value,
       MIN(o.order_date) AS first_order,
       MAX(o.order_date) AS last_order
FROM customers c
JOIN orders o ON c.id = o.customer_id
JOIN products p ON o.product_sku = p.sku
GROUP BY 1 ORDER BY total_revenue DESC;
```

**Monthly Revenue Trend:**
```sql
SELECT STRFTIME(order_date, '%Y-%m') AS month,
       COUNT(DISTINCT order_id) AS orders,
       ROUND(SUM(quantity * unit_price), 2) AS revenue
FROM orders o JOIN products p ON o.product_sku = p.sku
GROUP BY 1 ORDER BY 1;
```

**Product Performance:**
```sql
SELECT p.product_name, p.category,
       SUM(o.quantity) AS units_sold,
       ROUND(SUM(o.quantity * p.unit_price), 2) AS revenue,
       COUNT(DISTINCT o.customer_id) AS unique_buyers
FROM products p JOIN orders o ON p.sku = o.product_sku
GROUP BY 1, 2 ORDER BY revenue DESC;
```

**Payment Method Distribution:**
```sql
SELECT pay.payment_method,
       COUNT(*) AS transactions,
       ROUND(SUM(pay.amount), 2) AS total_amount,
       ROUND(AVG(pay.amount), 2) AS avg_amount
FROM payments pay
GROUP BY 1 ORDER BY total_amount DESC;
```

## Output Formatting

- Use `-markdown` flag for markdown-formatted table output: `duckdb userdata/warehouse.duckdb -markdown -c "..."`
- Use `-json` flag for JSON output: `duckdb userdata/warehouse.duckdb -json -c "..."`
- Use `-csv` flag for CSV output: `duckdb userdata/warehouse.duckdb -csv -c "..."`
- Default output is column-aligned plain text
- **Prefer `-json` for analysis** — it's easiest to transform into chart specs

## Tips

- **Multiple statements**: Separate with `;` inside a single `-c` string
- **Temp tables**: Use `CREATE TEMP TABLE` for intermediate results within a session
- **Aggregations**: DuckDB supports window functions, CTEs, `PIVOT`/`UNPIVOT`, `GROUP BY ALL`
- **String matching**: Use `ILIKE` for case-insensitive matching
- **Sampling**: `SELECT * FROM <table> USING SAMPLE 100;` for random samples
- DuckDB supports full SQL (joins, subqueries, CTEs, window functions)
- Exit code 1 means failure — check stderr for the error message

## Notes

- Database file: `userdata/warehouse.duckdb` (created automatically on first use)
- DuckDB natively reads CSV, Parquet, JSON, and Excel files
- No server needed — DuckDB is an embedded database
- The database file is safe to delete and rebuild from source files
