# Mission Control

Operational dashboard for OpenClaw + ClawData — manage agents,
monitor pipelines, and track tasks from a single pane.

## Quick Start

```bash
# From the project root
clawdata mission-control

# Or with the short alias
clawdata mc

# Custom port
clawdata mc --port 8080
```

Then open **http://127.0.0.1:3200** in your browser.

## What It Does

Mission Control connects to:

| System               | Integration                                    |
|----------------------|------------------------------------------------|
| **OpenClaw Gateway** | Agent sessions, presence, usage (ws://18789)   |
| **TaskTracker**      | Pipeline task status, progress                 |
| **Skills Registry**  | Skill health, linked status                    |
| **DuckDB**           | Data layer metrics (via existing API)          |

### Dashboard Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│  MISSION CONTROL  │  Agents: 3  Tasks: 12  │  ● ONLINE  │
├──────────┬────────────────────────────────┬──────────────────────────┤
│ AGENTS   │     MISSION QUEUE (Kanban)     │     LIVE FEED           │
│          │                                │                         │
│ ● Main   │ Inbox│Assigned│InProg│Review│  │  ⚙ Gateway connected   │
│ ● Agent2 │      │        │      │      │  │  📋 Plan approved      │
│ ● Agent3 │ [cards with approve/reject]    │  📦 Task completed      │
│          │                                │  🤖 Agent status change │
├──────────┤                                │                         │
│ SKILLS   │                                │                         │
│ dbt ✓    │                                │                         │
│ duckdb ✓ │                                │                         │
└──────────┴────────────────────────────────┴─────────────────────────┘
```

### Key Features

- **Real-time SSE** — live feed updates without polling
- **Agent monitoring** — see which agents are working, idle, or offline
- **Skill health** — visual indicator of which skills are linked and available
- **Dark theme** — monospace ops aesthetic, comfortable for long sessions

## API

All endpoints return JSON.

| Method | Path                       | Description                     |
|--------|----------------------------|---------------------------------|
| GET    | `/health`                  | Server health + gateway status  |
| GET    | `/api/dashboard`           | Full dashboard state            |
| GET    | `/api/agents`              | Agent list with presence        |
| GET    | `/api/queue`               | Mission queue items             |
| GET    | `/api/skills`              | Skill registry + health         |
| GET    | `/api/tasks`               | TaskTracker status              |
| GET    | `/api/feed`                | Activity feed                   |
| GET    | `/api/events`              | SSE event stream                |

## Options

```
--port <number>     Port to listen on (default: 3200)
--host <address>    Host to bind to (default: 127.0.0.1)
--gateway <url>     OpenClaw Gateway URL (default: ws://127.0.0.1:18789)
```
