# ClawData Lightdash Integration

Pre-built BI project for [Lightdash](https://www.lightdash.com/) with dashboards
and saved charts mapped to the ClawData gold layer.

## Quick Start

```bash
# Install Lightdash CLI
npm install -g @lightdash/cli

# Connect to the dbt project
lightdash config set-project \
  --project-dir apps/dbt \
  --profiles-dir apps/dbt

# Start Lightdash (Docker)
docker-compose -f apps/lightdash/docker-compose.yml up -d

# Deploy charts
lightdash deploy --project-dir apps/dbt
```

## Pre-built Dashboards

| Dashboard | Models Used | Description |
|-----------|------------|-------------|
| Revenue Overview | `gld_revenue_summary`, `fct_orders` | Monthly revenue, order trends, payment methods |
| Customer Segments | `gld_customer_analytics`, `dim_customers` | Segment breakdown, LTV, retention |
| Product Performance | `dim_products`, `fct_orders` | Top products, category revenue, margins |

## Configuration

### Lightdash Project

The Lightdash project reads directly from the dbt project in `apps/dbt/`.
All model descriptions, column descriptions, and metrics defined in `schema.yml`
are automatically available.

### Custom Metrics

Define metrics in your dbt `schema.yml`:

```yaml
models:
  - name: fct_orders
    columns:
      - name: amount
        meta:
          metrics:
            total_revenue:
              type: sum
            avg_order_value:
              type: average
```

## Docker Compose

The `docker-compose.yml` spins up Lightdash with a Postgres backend:

- **lightdash**: Web UI on port 8080
- **postgres**: Metadata store on port 5433
