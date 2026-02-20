---
name: fivetran
description: >
  Managed connector skill for Fivetran and Airbyte — trigger syncs,
  check status, and browse connectors.
metadata:
  openclaw:
    requires:
      bins: [clawdata]
      env: [FIVETRAN_API_KEY, FIVETRAN_API_SECRET]
    primaryEnv: FIVETRAN_API_KEY
    tags: [connectors, fivetran, airbyte, sync, ingestion]
---

# Fivetran / Airbyte

Managed connector skill for triggering and monitoring data syncs.

## Commands

| Task | Command |
|------|---------|
| List connectors | `clawdata fivetran connectors` |
| Trigger sync | `clawdata fivetran sync <connector-id>` |
| Sync status | `clawdata fivetran status <connector-id>` |
| Connector details | `clawdata fivetran describe <connector-id>` |
| Pause connector | `clawdata fivetran pause <connector-id>` |
| Resume connector | `clawdata fivetran resume <connector-id>` |

## Configuration

### Fivetran
```bash
export FIVETRAN_API_KEY=your-api-key
export FIVETRAN_API_SECRET=your-api-secret
```

### Airbyte
```bash
export AIRBYTE_API_URL=http://localhost:8000/api/v1
export AIRBYTE_API_TOKEN=your-token
```

## When to use

- User wants to trigger a data sync → `clawdata fivetran sync`
- User asks about connector status → `clawdata fivetran status`
- User needs to see what data sources are configured → `clawdata fivetran connectors`
