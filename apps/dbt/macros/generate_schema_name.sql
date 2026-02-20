{% macro generate_schema_name(custom_schema_name, node) -%}
    {#
        Custom schema macro for clawdata.
        When a model specifies +schema, use that directly (e.g. bronze, silver, gold).
        Otherwise fall back to the target schema (usually 'main' for DuckDB).
    #}
    {%- if custom_schema_name is not none -%}
        {{ custom_schema_name | trim }}
    {%- else -%}
        {{ target.schema | trim }}
    {%- endif -%}
{%- endmacro %}
