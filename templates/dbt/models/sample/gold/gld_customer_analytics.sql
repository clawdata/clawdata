-- Gold layer: wide customer analytics view
-- Combines dim_customers with order-level and product-level breakdowns

WITH order_monthly AS (
    SELECT
        customer_id,
        DATE_TRUNC('month', order_date)    AS order_month,
        SUM(total_amount)                  AS monthly_spend
    FROM {{ ref('fct_orders') }}
    GROUP BY customer_id, DATE_TRUNC('month', order_date)
),

top_category AS (
    SELECT
        oi.customer_id,
        p.category,
        ROW_NUMBER() OVER (
            PARTITION BY oi.customer_id
            ORDER BY SUM(oi.line_total) DESC
        ) AS rn
    FROM {{ ref('slv_order_items') }} oi
    JOIN {{ ref('slv_products') }} p ON oi.product_sku = p.product_sku
    GROUP BY oi.customer_id, p.category
)

SELECT
    c.customer_id,
    c.full_name,
    c.email,
    c.country_code,
    c.acquisition_source,
    c.customer_segment,
    c.recency_segment,
    c.total_orders,
    c.lifetime_value,
    c.avg_order_value,
    c.first_order_date,
    c.last_order_date,
    c.days_to_first_order,
    tc.category                             AS top_category,
    -- Months with at least one order
    (SELECT COUNT(*) FROM order_monthly om
     WHERE om.customer_id = c.customer_id)  AS active_months,
    -- Average monthly spend (across active months)
    ROUND((SELECT AVG(om.monthly_spend) FROM order_monthly om
           WHERE om.customer_id = c.customer_id), 2)
                                            AS avg_monthly_spend
FROM {{ ref('dim_customers') }} c
LEFT JOIN top_category tc
    ON c.customer_id = tc.customer_id AND tc.rn = 1
