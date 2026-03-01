# Sample Data

CSV datasets for testing and demos. Use these to seed databases, test pipelines,
or demonstrate skills.

## Available Files

### CSV (tabular)

| File | Description | Rows |
|------|-------------|------|
| `sample_customers.csv` | Customer master data (id, name, email) | 30 |
| `sample_orders.csv` | Order transactions (id, customer_id, date, amount) | 102 |
| `sample_payments.csv` | Payment records (id, order_id, method, amount) | 76 |
| `sample_products.csv` | Product catalogue (id, name, category, price) | 16 |

### JSON (for bronze-layer flattening)

| File | Description | Rows |
|------|-------------|------|
| `sample_customers.json` | Customer master data as JSON array | 30 |
| `sample_orders.json` | Order transactions as JSON array | 102 |
| `sample_payments.json` | Payment records as JSON array | 76 |
| `sample_products.json` | Product catalogue as JSON array | 16 |

The JSON files contain the same data as their CSV counterparts, formatted as arrays
of objects. Use these with the **Bronze Model** template (`templates/dbt/bronze_model.sql.j2`)
to practise JSON flattening in the first layer of the medallion architecture.

## Usage

Read files with the `read` tool:

```
read templates/sampledata/sample_customers.csv
```

Or use `exec` to inspect:

```
exec ls templates/sampledata/
exec head -5 templates/sampledata/sample_customers.csv
```
