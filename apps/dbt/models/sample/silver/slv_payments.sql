-- Silver layer: validated payment transactions
-- Excludes failed payments, standardises method names

SELECT
    transaction_id,
    order_id,
    CASE payment_method
        WHEN 'credit_card'    THEN 'Credit Card'
        WHEN 'paypal'         THEN 'PayPal'
        WHEN 'bank_transfer'  THEN 'Bank Transfer'
        WHEN 'apple_pay'      THEN 'Apple Pay'
        ELSE REPLACE(payment_method, '_', ' ')
    END                                    AS payment_method,
    amount,
    UPPER(currency)                        AS currency,
    status                                 AS payment_status,
    processor_ref,
    processed_at::TIMESTAMP                AS processed_at
FROM {{ ref('brz_payments') }}
WHERE status != 'failed'
