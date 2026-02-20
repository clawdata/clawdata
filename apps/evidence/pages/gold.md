---
title: Gold Layer Overview
---

# Gold Layer Overview

End-to-end summary of the curated gold models (`gold.gld_revenue_summary` and
`gold.gld_customer_analytics`). Use this page to monitor revenue momentum,
segment mix, and top customers coming out of the dbt pipeline.

## Key Metrics

```sql gold_kpis
SELECT
  ROUND(SUM(total_collected), 2)        AS total_collected,
  SUM(orders)                           AS total_orders,
  SUM(unique_customers)                 AS unique_buyers,
  ROUND(SUM(total_collected) / NULLIF(SUM(orders), 0), 2) AS blended_aov
FROM clawdata.gld_revenue_summary;
```

<BigValue data={gold_kpis} value=total_collected title="Total Collected" />
<BigValue data={gold_kpis} value=total_orders title="Orders" />
<BigValue data={gold_kpis} value=unique_buyers title="Unique Buyers" />
<BigValue data={gold_kpis} value=blended_aov title="Blended AOV" />

## Revenue Momentum

```sql gold_trend
SELECT
  DATE_TRUNC('month', order_date) AS month,
  SUM(net_revenue)                AS net_revenue,
  SUM(orders)                     AS orders,
  SUM(total_collected)            AS total_collected
FROM clawdata.gld_revenue_summary
GROUP BY 1
ORDER BY 1;
```

<LineChart data={gold_trend} x=month y=total_collected title="Monthly Collected Revenue" />
<BarChart data={gold_trend} x=month y=orders title="Monthly Orders" />

## Customer Segments

```sql segment_mix
SELECT
  customer_segment,
  COUNT(*)                             AS customers,
  ROUND(SUM(lifetime_value), 2)        AS revenue,
  ROUND(AVG(avg_order_value), 2)       AS avg_order_value
FROM clawdata.gld_customer_analytics
GROUP BY 1
ORDER BY revenue DESC;
```

<BarChart data={segment_mix} x=customer_segment y=revenue title="Revenue by Customer Segment" />
<DataTable data={segment_mix} />

## Recency Health

```sql recency_mix
SELECT
  recency_segment,
  COUNT(*)                      AS customers,
  ROUND(SUM(lifetime_value), 2) AS revenue
FROM clawdata.gld_customer_analytics
GROUP BY 1
ORDER BY revenue DESC;
```

<BarChart data={recency_mix} x=recency_segment y=customers title="Customers by Recency Segment" />
<DataTable data={recency_mix} />

## Geographic Concentration

```sql geo_mix
SELECT
  country_code,
  COUNT(*)                      AS customers,
  ROUND(SUM(lifetime_value), 2) AS revenue
FROM clawdata.gld_customer_analytics
GROUP BY 1
ORDER BY revenue DESC
LIMIT 15;
```

<BarChart data={geo_mix} x=country_code y=revenue title="Top Markets by Lifetime Revenue" />
<DataTable data={geo_mix} />

## Top Customers

```sql top_customers
SELECT
  full_name,
  country_code,
  customer_segment,
  total_orders,
  ROUND(lifetime_value, 2) AS lifetime_value,
  ROUND(avg_order_value, 2) AS avg_order_value,
  last_order_date
FROM clawdata.gld_customer_analytics
ORDER BY lifetime_value DESC
LIMIT 20;
```

<DataTable data={top_customers} />
