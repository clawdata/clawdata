-- Gold layer: daily revenue summary with running totals (incremental)

{{
  config(
    materialized='incremental',
    unique_key='order_date',
    incremental_strategy='merge'
  )
}}

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
{% if is_incremental() %}
WHERE order_date > (SELECT MAX(order_date) FROM {{ this }})
{% endif %}
GROUP BY order_date
ORDER BY order_date
