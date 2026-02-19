-- Gold layer: daily revenue summary with running totals

SELECT
    order_date,
    COUNT(DISTINCT order_id)               AS orders,
    COUNT(DISTINCT customer_id)            AS unique_customers,
    SUM(subtotal)                          AS gross_revenue,
    SUM(discount_amount)                   AS total_discounts,
    SUM(net_amount)                        AS net_revenue,
    SUM(tax_amount)                        AS total_tax,
    SUM(shipping_amount)                   AS total_shipping,
    SUM(total_amount)                      AS total_collected,
    ROUND(AVG(total_amount), 2)            AS avg_order_value,
    -- Running totals
    SUM(SUM(total_amount)) OVER (
        ORDER BY order_date
    )                                      AS cumulative_revenue,
    SUM(COUNT(DISTINCT order_id)) OVER (
        ORDER BY order_date
    )                                      AS cumulative_orders
FROM {{ ref('fct_orders') }}
GROUP BY order_date
ORDER BY order_date
