---
name: fivetran
description: "Manage Fivetran connectors and syncs — list connectors, trigger syncs, check status, and manage schemas."
metadata: {"openclaw": {"emoji": "🔗", "tags": ["ingestion", "fivetran", "etl", "connector", "sync", "data"]}}
---

# Fivetran

You help manage Fivetran connectors and data syncs.
Use this when the user asks about Fivetran connectors, sync status, or schema management.

## Authentication

Fivetran uses API key + secret for authentication. Set these environment variables:

- `FIVETRAN_API_KEY`
- `FIVETRAN_API_SECRET`

## API Patterns

All Fivetran API calls use `web_fetch` with Basic Auth against `https://api.fivetran.com/v1`.

### List all connectors in a group

```
GET https://api.fivetran.com/v1/groups/<group_id>/connectors
```

### Get connector details

```
GET https://api.fivetran.com/v1/connectors/<connector_id>
```

### Trigger a sync

```
POST https://api.fivetran.com/v1/connectors/<connector_id>/force
```

### Pause a connector

```
PATCH https://api.fivetran.com/v1/connectors/<connector_id>
Body: {"paused": true}
```

### Resume a connector

```
PATCH https://api.fivetran.com/v1/connectors/<connector_id>
Body: {"paused": false}
```

### Get sync status

```
GET https://api.fivetran.com/v1/connectors/<connector_id>/status
```

### List schemas and tables for a connector

```
GET https://api.fivetran.com/v1/connectors/<connector_id>/schemas
```

### Modify schema config (enable/disable tables)

```
PATCH https://api.fivetran.com/v1/connectors/<connector_id>/schemas
Body: {"schemas": {"<schema>": {"tables": {"<table>": {"enabled": true}}}}}
```

## Common Tasks

- **Check why data is stale**: Get connector status, check `succeeded_at` and `failed_at` timestamps
- **Enable a new table**: Modify the schema config to enable the table
- **Troubleshoot failures**: Check connector status for error messages
- **Manage sync frequency**: Update connector config with desired `sync_frequency` (minutes)

## Best Practices

- Use Fivetran for source ingestion (EL), then dbt for transformation (T)
- Monitor `succeeded_at` timestamps for freshness
- Disable unused tables/schemas to reduce sync time and cost
- Use column hashing for PII columns
- Set up Fivetran-dbt integration for automatic model triggering after syncs
