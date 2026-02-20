-- Gold layer: order fact table
-- Conformed fact linking to customer and product dimensions, with payment info

WITH payment_agg AS (
    SELECT
        order_id,
        STRING_AGG(DISTINCT payment_method, ', ')  AS payment_methods,
        SUM(CASE WHEN payment_status = 'completed' THEN amount ELSE 0 END)
                                                    AS paid_amount,
        BOOL_OR(payment_status = 'refunded')        AS has_refund
    FROM {{ ref('slv_payments') }}
    GROUP BY order_id
)

SELECT
    o.order_id,
    o.customer_id,
    o.order_date,
    o.order_status,
    o.line_count,
    o.subtotal,
    o.discount_amount,
    o.discount_pct,
    o.net_amount,
    o.tax_amount,
    o.tax_rate,
    o.shipping_amount,
    o.total_amount,
    o.shipping_city,
    o.shipping_country,
    COALESCE(p.payment_methods, 'Unpaid')  AS payment_methods,
    COALESCE(p.paid_amount, 0)             AS paid_amount,
    COALESCE(p.has_refund, false)          AS has_refund,
    o.created_at
FROM {{ ref('slv_orders') }} o
LEFT JOIN payment_agg p ON o.order_id = p.order_id
