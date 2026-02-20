---
title: Customer Intelligence Report
---

# Customer Intelligence Report

Comprehensive view of the curated gold-layer customer models with charts and tables you can use for planning, retention, and revenue strategy.

## Portfolio Snapshot

```sql customer_summary
SELECT
  COUNT(*)                                         AS total_customers,
  SUM(CASE WHEN customer_segment = 'VIP' THEN 1 ELSE 0 END) AS vip_customers,
  SUM(CASE WHEN total_orders > 1 THEN 1 ELSE 0 END) AS repeat_buyers,
  ROUND(SUM(lifetime_value), 2)                    AS lifetime_revenue,
  ROUND(AVG(avg_order_value), 2)                   AS average_order_value
FROM clawdata.gld_customer_analytics;
```

<BigValue data={customer_summary} value=total_customers title="Customers" />
<BigValue data={customer_summary} value=vip_customers title="VIPs" />
<BigValue data={customer_summary} value=repeat_buyers title="Repeat Buyers" />
<BigValue data={customer_summary} value=lifetime_revenue title="Lifetime Revenue" />
<BigValue data={customer_summary} value=average_order_value title="Avg Order Value" />

## Segment Mix & Value

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

<BarChart data={segment_mix} x=customer_segment y=revenue title="Revenue by Segment" />
<DataTable data={segment_mix} />

## Recency Health

```sql recency_mix
SELECT
  recency_segment,
  COUNT(*)                      AS customers,
  ROUND(SUM(lifetime_value), 2) AS revenue
FROM clawdata.gld_customer_analytics
GROUP BY 1
ORDER BY customers DESC;
```

<BarChart data={recency_mix} x=recency_segment y=customers title="Customers by Recency" />
<BarChart data={recency_mix} x=recency_segment y=revenue title="Revenue by Recency" />

## Acquisition Sources

```sql acquisition_mix
SELECT
  acquisition_source,
  COUNT(*)                      AS customers,
  ROUND(SUM(lifetime_value), 2) AS revenue
FROM clawdata.gld_customer_analytics
GROUP BY 1
ORDER BY revenue DESC;
```

<BarChart data={acquisition_mix} x=acquisition_source y=revenue title="Revenue by Acquisition Source" />
<DataTable data={acquisition_mix} />

## Geographic Concentration

```sql geo_mix
SELECT
  country_code,
  COUNT(*)                      AS customers,
  ROUND(SUM(lifetime_value), 2) AS revenue
FROM clawdata.gld_customer_analytics
GROUP BY 1
ORDER BY revenue DESC
LIMIT 20;
```

<BarChart data={geo_mix} x=country_code y=revenue title="Top Markets by Revenue" />
<DataTable data={geo_mix} />

## Customer Growth & Activity

```sql cohort_growth
SELECT
  DATE_TRUNC('month', first_order_date) AS cohort_month,
  COUNT(*)                              AS new_customers,
  ROUND(SUM(lifetime_value), 2)         AS lifetime_revenue
FROM clawdata.gld_customer_analytics
GROUP BY 1
ORDER BY 1;
```

<LineChart data={cohort_growth} x=cohort_month y=new_customers title="New Customers by Month" />
<LineChart data={cohort_growth} x=cohort_month y=lifetime_revenue title="Lifetime Revenue by Cohort" />

```sql activity_trend
SELECT
  DATE_TRUNC('month', last_order_date) AS active_month,
  COUNT(*)                             AS active_customers
FROM clawdata.gld_customer_analytics
GROUP BY 1
ORDER BY 1;
```

<BarChart data={activity_trend} x=active_month y=active_customers title="Active Customers by Month" />

## Lifetime Value Distribution

```sql ltv_distribution
WITH buckets AS (
  SELECT
    CASE
      WHEN lifetime_value >= 1500 THEN '≥ 1.5k'
      WHEN lifetime_value >= 1000 THEN '1k - 1.5k'
      WHEN lifetime_value >= 500  THEN '500 - 999'
      WHEN lifetime_value >= 250  THEN '250 - 499'
      ELSE '< 250'
    END AS bucket,
    lifetime_value
  FROM clawdata.gld_customer_analytics
)
SELECT
  bucket,
  COUNT(*)                      AS customers,
  ROUND(SUM(lifetime_value), 2) AS revenue
FROM buckets
GROUP BY 1
ORDER BY CASE bucket
  WHEN '≥ 1.5k' THEN 1
  WHEN '1k - 1.5k' THEN 2
  WHEN '500 - 999' THEN 3
  WHEN '250 - 499' THEN 4
  ELSE 5
END;
```

<BarChart data={ltv_distribution} x=bucket y=customers title="Customers per LTV Bucket" />
<BarChart data={ltv_distribution} x=bucket y=revenue title="Revenue per LTV Bucket" />

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
LIMIT 25;
```

<DataTable data={top_customers} />
