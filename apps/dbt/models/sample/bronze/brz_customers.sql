-- Bronze layer: raw customer data passthrough
-- Unmodified ingestion from source — preserves all columns as-is

SELECT *
FROM {{ source('raw', 'sample_customers') }}
