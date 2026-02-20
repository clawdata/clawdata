-- Silver layer: deduplicated and standardised customer data
-- Keeps the most-recently-updated record per email, normalises country codes

WITH ranked AS (
    SELECT
        id AS customer_id,
        first_name,
        last_name,
        email,
        phone,
        address,
        city,
        state,
        postal_code,
        country,
        registered_at,
        updated_at,
        account_status,
        acquisition_source,
        ROW_NUMBER() OVER (
            PARTITION BY LOWER(TRIM(email))
            ORDER BY updated_at DESC
        ) AS row_num
    FROM {{ ref('brz_customers') }}
    WHERE email IS NOT NULL
      AND TRIM(email) != ''
      AND account_status != 'cancelled'
)

SELECT
    customer_id,
    CONCAT(UPPER(SUBSTR(TRIM(first_name),1,1)), LOWER(SUBSTR(TRIM(first_name),2)))  AS first_name,
    CONCAT(UPPER(SUBSTR(TRIM(last_name),1,1)), LOWER(SUBSTR(TRIM(last_name),2)))    AS last_name,
    LOWER(TRIM(email))                     AS email,
    NULLIF(TRIM(phone), '')                AS phone,
    TRIM(address)                          AS address,
    CONCAT(UPPER(SUBSTR(TRIM(city),1,1)), LOWER(SUBSTR(TRIM(city),2)))              AS city,
    UPPER(TRIM(state))                     AS state,
    TRIM(postal_code)                      AS postal_code,
    -- Standardise country to two-letter code
    CASE UPPER(TRIM(country))
        WHEN 'US'             THEN 'US'
        WHEN 'USA'            THEN 'US'
        WHEN 'UNITED STATES'  THEN 'US'
        WHEN 'UK'             THEN 'GB'
        WHEN 'UNITED KINGDOM' THEN 'GB'
        WHEN 'CA'             THEN 'CA'
        WHEN 'CANADA'         THEN 'CA'
        WHEN 'AU'             THEN 'AU'
        WHEN 'AUSTRALIA'      THEN 'AU'
        WHEN 'DE'             THEN 'DE'
        WHEN 'GERMANY'        THEN 'DE'
        WHEN 'FR'             THEN 'FR'
        WHEN 'FRANCE'         THEN 'FR'
        WHEN 'JP'             THEN 'JP'
        WHEN 'JAPAN'          THEN 'JP'
        WHEN 'IN'             THEN 'IN'
        WHEN 'INDIA'          THEN 'IN'
        ELSE UPPER(TRIM(country))
    END                                    AS country_code,
    registered_at::TIMESTAMP               AS registered_at,
    updated_at::TIMESTAMP                  AS updated_at,
    account_status,
    acquisition_source
FROM ranked
WHERE row_num = 1
