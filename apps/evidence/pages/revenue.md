---
title: Revenue Summary
---

# Revenue Summary

```sql monthly_revenue
SELECT
  DATE_TRUNC('month', order_date) AS month,
  SUM(total_amount) AS revenue,
  COUNT(DISTINCT order_id) AS orders
FROM clawdata.fct_orders
GROUP BY 1
ORDER BY 1
```

<LineChart data={monthly_revenue} x=month y=revenue title="Monthly Revenue" />

<BarChart data={monthly_revenue} x=month y=orders title="Monthly Orders" />

## Revenue by Payment Method

```sql by_payment
SELECT
  payment_method,
  SUM(amount) AS revenue,
  COUNT(*) AS transactions
FROM clawdata.slv_payments
GROUP BY 1
ORDER BY 2 DESC
```

<DataTable data={by_payment} />

<BarChart data={by_payment} x=payment_method y=revenue title="Revenue by Payment Method" />
