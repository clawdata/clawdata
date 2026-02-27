---
name: metabase
description: "Manage Metabase dashboards and questions — create questions, manage collections, and interact with the Metabase API."
metadata: {"openclaw": {"emoji": "📊", "tags": ["bi", "metabase", "dashboard", "analytics", "visualization", "data"]}}
---

# Metabase

You help manage Metabase instances and create analytics content.
Use this when the user asks about dashboards, questions, collections, or Metabase configuration.

## Authentication

Metabase uses session tokens. Set these environment variables:

- `METABASE_URL` — e.g. `http://localhost:3000`
- `METABASE_USERNAME`
- `METABASE_PASSWORD`

First, obtain a session token:

```
POST <METABASE_URL>/api/session
Body: {"username": "<email>", "password": "<password>"}
```

Use the returned `id` as `X-Metabase-Session` header for subsequent requests.

## API Patterns

### Databases

#### List connected databases

```
GET /api/database
```

#### Get database metadata (tables and fields)

```
GET /api/database/<id>/metadata
```

### Questions (Saved Questions)

#### List questions

```
GET /api/card
```

#### Get a question

```
GET /api/card/<id>
```

#### Create a native query question

```
POST /api/card
Body: {
  "name": "Monthly Revenue",
  "dataset_query": {
    "type": "native",
    "native": {"query": "SELECT date_trunc('month', created_at) AS month, SUM(amount) AS revenue FROM orders GROUP BY 1 ORDER BY 1"},
    "database": 1
  },
  "display": "line",
  "visualization_settings": {},
  "collection_id": null
}
```

#### Run a question

```
POST /api/card/<id>/query
```

### Dashboards

#### List dashboards

```
GET /api/dashboard
```

#### Get a dashboard

```
GET /api/dashboard/<id>
```

#### Create a dashboard

```
POST /api/dashboard
Body: {"name": "Sales Overview", "collection_id": null}
```

#### Add a card to a dashboard

```
PUT /api/dashboard/<dashboard_id>
Body: {"dashcards": [{"card_id": <card_id>, "row": 0, "col": 0, "size_x": 6, "size_y": 4}]}
```

### Collections

#### List collections

```
GET /api/collection
```

#### Create a collection

```
POST /api/collection
Body: {"name": "Finance", "parent_id": null}
```

## Best Practices

- Organise questions into collections by domain (e.g. Finance, Marketing)
- Use native queries for complex analytics, simple questions for self-serve
- Add descriptions to questions and dashboards
- Use dashboard filters for interactivity
- Cache slow queries with Metabase's caching settings
- Pin important dashboards to collections for discoverability
