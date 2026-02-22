# Mission Control — Implementation Plan

## Overview

**Mission Control** is an operational dashboard for OpenClaw + ClawData.
It provides a real-time, single-pane view of agents, tasks,
skills health, and data pipeline status — all driven by the OpenClaw Gateway
WebSocket and the ClawData CLI/API layer.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Browser (SPA)                               │
│                                                                     │
│  ┌─────────────┐  ┌────────────────────┐  ┌──────────────────────┐ │
│  │  Agent Panel │  │   Mission Queue    │  │     Live Feed        │ │
│  │  - list      │  │   - Inbox          │  │   - events stream    │ │
│  │  - status    │  │   - Assigned       │  │   - pipeline runs    │ │
│  │  - presence  │  │   - In Progress    │  │   - errors           │ │
│  │  - skills    │  │   - Review         │  │                      │ │
│  │             │  │   - Done           │  │                      │ │
│  └──────┬──────┘  └────────┬───────────┘  └──────────┬───────────┘ │
│         │                  │                          │             │
│         └──────────────────┼──────────────────────────┘             │
│                            │  WebSocket + REST                      │
└────────────────────────────┼────────────────────────────────────────┘
                             │
               ┌─────────────▼──────────────┐
               │   Mission Control Server    │
               │   (Node.js, port 3200)      │
               │                             │
               │   REST API + SSE stream     │
               └──────┬────────┬─────────────┘
                      │        │
          ┌───────────┘        └───────────┐
          ▼                                ▼
┌──────────────────┐            ┌──────────────────────┐
│  OpenClaw Gateway │            │    ClawData Engine    │
│  ws://127.0.0.1   │            │                      │
│  :18789            │            │  - TaskTracker       │
│  - sessions.list   │            │  - DatabaseManager   │
│  - sessions.history│            │  - DbtManager        │
│  - presence        │            │  - DataIngestor      │
│  - config          │            │  - SkillRegistry     │
│  - usage           │            │                      │
└──────────────────┘            └──────────────────────┘
```

---

## Integration Points

### 1. OpenClaw Gateway WebSocket (`ws://127.0.0.1:18789`)

The Gateway exposes a WebSocket control plane. Mission Control connects as a
client and subscribes to:

| WS Method             | Purpose                                          |
|-----------------------|--------------------------------------------------|
| `sessions.list`       | Discover active agents/sessions                  |
| `sessions.history`    | Fetch conversation logs per session              |
| `sessions.send`       | Send commands to an agent                        |
| `presence.*`          | Real-time agent status (working/idle/offline)    |
| `config.get`          | Read gateway configuration                       |
| `usage.*`             | Token usage, cost tracking per session/agent     |

### 2. ClawData TaskTracker

The existing `TaskTracker` class persists to `.clawdata/tasks.json`. Mission
Control reads this for pipeline task status and maps to the queue columns.

### 3. ClawData Skills Registry

Reads from `skills/` directory and `~/.openclaw/workspace/skills/` to show
skill health, linked status, and tool availability.

### 4. DuckDB Data Layer

Connects via the existing `DatabaseManager` to surface:
- Table counts, row counts, freshness
- Pipeline health (bronze → silver → gold layer completeness)
- Data quality metrics from dbt tests

---

## Tech Stack

| Layer      | Choice                  | Rationale                                    |
|------------|-------------------------|----------------------------------------------|
| Backend    | Node.js (built-in http) | Zero deps, consistent with `clawdata serve`  |
| Frontend   | Vanilla HTML/CSS/JS     | No build step, deploys as static assets      |
| Real-time  | Server-Sent Events (SSE)| Simpler than WS for server→client push       |
| Data store | In-memory + JSON files  | Tasks in `.clawdata/tasks.json` |
| Gateway    | WebSocket client        | Standard ws to OpenClaw Gateway              |

---

## File Structure

```
apps/mission-control/
├── IMPLEMENTATION.md       ← This file
├── README.md               ← Usage docs
├── server.ts               ← Backend: HTTP API + SSE + Gateway WS client
├── public/                 ← Static frontend assets
│   ├── index.html          ← Main SPA shell
│   ├── styles.css          ← Dashboard styles (dark theme)
│   └── app.js              ← Frontend logic (vanilla JS)
└── lib/
    ├── gateway-client.ts   ← OpenClaw Gateway WebSocket client
    ├── task-bridge.ts      ← Bridge to TaskTracker
    └── skill-scanner.ts    ← Skill health checker
```

---

## UI Layout (3-column dashboard)

### Header Bar
- **Logo / Title**: "MISSION CONTROL" + squad/project name from `clawdata.yml`
- **Stats strip**: Agents Active | Tasks in Queue
- **Status indicator**: ONLINE/OFFLINE (Gateway connection), Clock

### Left Panel — Agents
- List of OpenClaw sessions/agents with:
  - Avatar (initials + color)
  - Name / session ID
  - Role (from skill tags)
  - Status badge: WORKING / IDLE / OFFLINE
  - Current activity snippet
- Click agent → shows detail drawer (history, usage, model)

### Center Panel — Mission Queue (Kanban)
Columns: **Inbox** → **Assigned** → **In Progress** → **Review** → **Done**

Cards show:
- Title (plan goal or task name)
- Description snippet
- Priority badge (HIGH / MEDIUM / LOW)
- Assigned agent (if any)
- Action buttons (Approve / Reject for Review column)

Data sources:
- **Inbox**: Unassigned tasks
- **Assigned**: Tasks assigned to specific agents
- **In Progress**: Currently executing tasks
- **Review**: Tasks requiring review
- **Done**: Completed tasks (last 24h)

### Right Panel — Live Feed
Real-time event stream showing:
- Agent messages and status changes
- Pipeline completions
- Errors and warnings
- Data ingestion events

---

## API Endpoints

### REST

| Method | Path                      | Description                        |
|--------|---------------------------|------------------------------------|
| GET    | `/health`                 | Server health + gateway status     |
| GET    | `/api/agents`             | List agents with presence          |
| GET    | `/api/agents/:id`         | Agent detail + history             |
| GET    | `/api/queue`              | All mission queue items            |
| GET    | `/api/queue/:status`      | Filter by column                   |
| GET    | `/api/skills`             | Skill registry + health            |
| GET    | `/api/tasks`              | TaskTracker status                 |
| GET    | `/api/data/health`        | Pipeline layer health              |
| GET    | `/api/usage`              | Token/cost usage summary           |

### SSE

| Path            | Events                                          |
|-----------------|-------------------------------------------------|
| `/api/events`   | `agent:status`, `task:update`,                  |
|                 | `feed:message`, `data:pipeline`, `error`        |

---

## Implementation Phases

### Phase 1 — Core Server + UI Shell (MVP)
1. Create HTTP server with REST routes
2. Build the 3-column HTML dashboard with CSS
3. Implement agent list (mock data + OpenClaw Gateway when available)
4. Wire SSE for live feed
5. Add `clawdata mission-control` CLI command

### Phase 2 — Pipeline & Data Layer
1. TaskTracker integration for pipeline status
2. DuckDB metrics (table counts, freshness)
3. dbt model status + test results
4. Data layer health indicators

### Phase 3 — Full Gateway Integration
1. Real OpenClaw WS client for `sessions.list`
2. Presence subscription for live agent status
3. Usage tracking display
4. `sessions.send` for commanding agents from UI

---

## CLI Integration

Add to `src/cli.ts` dispatcher:

```typescript
case "mission-control":
case "mc":
  // Launch the Mission Control server
  const { default: startMissionControl } = await import("../apps/mission-control/server.js");
  await startMissionControl(rest);
  break;
```

This keeps it launchable via: `clawdata mission-control` or `clawdata mc`.

---

## Design Tokens (Dark Theme)

| Token               | Value        | Usage                    |
|---------------------|------------- |--------------------------|
| `--bg-primary`      | `#0a0a0b`   | Page background          |
| `--bg-panel`        | `#141416`   | Panel backgrounds        |
| `--bg-card`         | `#1c1c1f`   | Card backgrounds         |
| `--border`          | `#2a2a2e`   | Borders, dividers        |
| `--text-primary`    | `#e8e8ea`   | Primary text             |
| `--text-secondary`  | `#8b8b90`   | Secondary / muted text   |
| `--accent-orange`   | `#e8724a`   | Primary accent (CTA)     |
| `--accent-green`    | `#34d399`   | Success, online, approved|
| `--accent-yellow`   | `#fbbf24`   | Warning, pending review  |
| `--accent-red`      | `#f87171`   | Error, rejected, blocked |
| `--accent-cyan`     | `#22d3ee`   | Info, in-progress        |
| `--accent-purple`   | `#a78bfa`   | Critical risk            |

Font: `"SF Mono", "JetBrains Mono", "Fira Code", monospace` for the ops aesthetic.

---

## Security Notes

- Mission Control binds to `127.0.0.1` by default (localhost only)
- No authentication in v1 (same trust model as `clawdata serve`)
- Plan approval requires explicit POST with plan ID
- Read-only by default for data operations
- Future: integrate with OpenClaw Gateway auth tokens
