{% snapshot snp_customers %}

{{
    config(
      target_schema='snapshots',
      unique_key='customer_id',
      strategy='check',
      check_cols=['email', 'first_name', 'last_name', 'country_code'],
    )
}}

SELECT * FROM {{ ref('slv_customers') }}

{% endsnapshot %}
