/**
 * Mission Control — Backend Server
 *
 * HTTP API server + SSE event stream for the Mission Control dashboard.
 * Connects to OpenClaw Gateway, TaskTracker, and skill registry.
 *
 * Usage:
 *   clawdata mission-control [--port 3200] [--host 127.0.0.1]
 */

import * as http from "http";
import * as fs from "fs/promises";
import * as path from "path";
import { execFile } from "child_process";
import { GatewayClient, GatewayAgent, GatewayLogEntry } from "./lib/gateway-client.js";
import { TaskBridge } from "./lib/task-bridge.js";
import { SkillScanner } from "./lib/skill-scanner.js";

// ── Agent name pool (loaded from sampledata CSV) ─────────────────────

let _agentNames: string[] = [];

async function loadAgentNames(root: string): Promise<string[]> {
  if (_agentNames.length) return _agentNames;
  try {
    const csv = await fs.readFile(path.join(root, "templates", "sampledata", "agent_names.csv"), "utf-8");
    _agentNames = csv
      .split("\n")
      .map(l => l.trim())
      .filter(l => l && l.toLowerCase() !== "name");
  } catch { /* CSV missing — fall back to hardcoded list */ }
  if (!_agentNames.length) {
    _agentNames = [
      "Atlas", "Nova", "Sage", "Reef", "Ember", "Onyx", "Pixel", "Cirrus",
      "Echo", "Flux", "Iris", "Cobalt", "Zephyr", "Nimbus", "Jasper", "Fern",
    ];
  }
  return _agentNames;
}

function pickRandomName(exclude: Set<string> = new Set()): string {
  const pool = _agentNames.filter(n => !exclude.has(n.toLowerCase()));
  if (!pool.length) return `Agent-${Math.floor(Math.random() * 9000) + 1000}`;
  return pool[Math.floor(Math.random() * pool.length)];
}

// ── Types ────────────────────────────────────────────────────────────

interface FeedEvent {
  id: string;
  type: "agent" | "plan" | "task" | "system" | "error" | "pipeline";
  title: string;
  detail: string;
  timestamp: string;
  actor?: string;
  icon?: string;
}

interface SSEClient {
  id: number;
  res: http.ServerResponse;
}

// ── Server ───────────────────────────────────────────────────────────

export class MissionControlServer {
  private gateway: GatewayClient;
  private tasks: TaskBridge;
  private skills: SkillScanner;
  private root: string;
  private sseClients: SSEClient[] = [];
  private sseId = 0;
  private feedEvents: FeedEvent[] = [];
  private feedCounter = 0;
  private refreshInterval: ReturnType<typeof setInterval> | null = null;
  private projectName = "ClawData";

  constructor(root: string, gatewayUrl?: string) {
    this.root = root;
    this.gateway = new GatewayClient(gatewayUrl || "ws://127.0.0.1:18789");
    this.tasks = new TaskBridge(root);
    this.skills = new SkillScanner(root);

    this.gateway.on("status", (status: string) => {
      this.pushFeed({
        type: "system",
        title: `Gateway ${status}`,
        detail: `OpenClaw Gateway is now ${status}`,
      });
    });

    // Stream live OpenClaw logs into the feed + SSE
    this.gateway.on("log", (entry: GatewayLogEntry) => {
      if (entry.type === "meta" || entry.type === "notice") return;
      const subsystem = entry.subsystem || "";
      const level = entry.level || "info";
      const message = entry.message || "";

      // Parse the message to remove the subsystem prefix JSON
      let cleanMsg = message;
      const prefixMatch = message.match(/^\{"subsystem":"[^"]*"\}\s*(.*)$/);
      if (prefixMatch) cleanMsg = prefixMatch[1];

      // Determine feed event type based on subsystem
      let feedType: FeedEvent["type"] = "system";
      if (subsystem.startsWith("agent")) feedType = "agent";
      else if (subsystem.includes("channel")) feedType = "pipeline";
      else if (level === "error" || level === "fatal") feedType = "error";

      // Only surface info+ level logs in the feed (skip debug to avoid noise)
      if (level === "debug") {
        // Still broadcast via SSE for the log viewer, but don't add to feed
        this.broadcastSSE("log:entry", {
          time: entry.time,
          level,
          subsystem,
          message: cleanMsg,
        });
        return;
      }

      this.pushFeed({
        type: feedType,
        title: cleanMsg.slice(0, 120) || `[${subsystem}]`,
        detail: subsystem ? `${subsystem} · ${level}` : level,
      });

      this.broadcastSSE("log:entry", {
        time: entry.time,
        level,
        subsystem,
        message: cleanMsg,
      });
    });

    // Forward agent updates to SSE
    this.gateway.on("agents:update", (agents: GatewayAgent[]) => {
      this.broadcastSSE("agents:update", agents);
    });

    // Forward full gateway data refreshes to SSE
    this.gateway.on("data:refresh", (data: unknown) => {
      this.broadcastSSE("gateway:data", data);
    });

    this.gateway.on("error", (msg: string) => {
      this.pushFeed({
        type: "error",
        title: "Gateway error",
        detail: msg,
      });
    });
  }

  // ── Initialization ─────────────────────────────────────────────

  async init(): Promise<void> {
    await loadAgentNames(this.root);
    await this.tasks.load();
    this.gateway.connect();

    this.pushFeed({
      type: "system",
      title: "Mission Control started",
      detail: `Monitoring project: ${this.projectName}`,
    });

    // Refresh data every 60 seconds (reduced from 10s to prevent flicker)
    this.refreshInterval = setInterval(async () => {
      await this.tasks.load();
      this.broadcastSSE("state:refresh", { timestamp: new Date().toISOString() });
    }, 60000);
  }

  // ── SSE ────────────────────────────────────────────────────────

  private addSSEClient(res: http.ServerResponse): number {
    const id = ++this.sseId;
    this.sseClients.push({ id, res });
    res.on("close", () => {
      this.sseClients = this.sseClients.filter((c) => c.id !== id);
    });
    return id;
  }

  private broadcastSSE(event: string, data: unknown): void {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    this.sseClients.forEach((client) => {
      try {
        client.res.write(payload);
      } catch {
        // Client disconnected
      }
    });
  }

  private pushFeed(ev: Omit<FeedEvent, "id" | "timestamp">): void {
    const event: FeedEvent = {
      ...ev,
      id: `feed_${++this.feedCounter}`,
      timestamp: new Date().toISOString(),
    };
    this.feedEvents.unshift(event);
    if (this.feedEvents.length > 100) this.feedEvents.pop();
    this.broadcastSSE("feed:new", event);
  }

  // ── Route helpers ──────────────────────────────────────────────

  private json(res: http.ServerResponse, data: unknown, status = 200): void {
    res.writeHead(status, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(JSON.stringify(data));
  }

  private async readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
      req.on("error", reject);
    });
  }

  // ── Mock agents (when Gateway is unavailable) ──────────────────

  private getDefaultAgents(): GatewayAgent[] {
    return [
      {
        id: "agent_main",
        name: "Main",
        role: "Chief of Staff",
        status: this.gateway.isConnected ? "working" : "idle",
        model: "claude-opus-4-6",
        lastSeen: new Date().toISOString(),
      },
    ];
  }

  // ── Agent skills persistence ─────────────────────────────────

  /**
   * Find the index of an agent in the gateway's agents.list config.
   * Returns -1 if the agent is not in the gateway config.
   */
  private async findAgentIndex(agentName: string): Promise<number> {
    try {
      const cfg = await this.runOpenClawCommand(["config", "get", "agents.list", "--json"]);
      const list: any[] = Array.isArray(cfg) ? cfg : [];
      return list.findIndex((a: any) => a.id === agentName || a.name === agentName);
    } catch {
      return -1;
    }
  }

  /**
   * Read per-agent skills from gateway config (source of truth).
   * null = no restriction (all skills), array = specific allowlist.
   */
  private async readAgentSkills(agentName: string): Promise<string[] | null> {
    try {
      const idx = await this.findAgentIndex(agentName);
      if (idx >= 0) {
        try {
          const skills = await this.runOpenClawCommand(["config", "get", `agents.list.${idx}.skills`, "--json"]);
          if (Array.isArray(skills)) return skills;
        } catch { /* no skills key = no restriction */ }
      }
    } catch { /* gateway unavailable */ }
    return null;
  }

  /**
   * Write per-agent skills to gateway config.
   */
  private async writeAgentSkills(agentName: string, skills: string[]): Promise<void> {
    const idx = await this.findAgentIndex(agentName);
    if (idx < 0) return;
    if (skills.length) {
      await this.runOpenClawCommand([
        "config", "set",
        `agents.list.${idx}.skills`,
        JSON.stringify(skills),
        "--json",
      ]);
    } else {
      // Empty = remove restriction (all skills available)
      try {
        await this.runOpenClawCommand([
          "config", "unset",
          `agents.list.${idx}.skills`,
          "--json",
        ]);
      } catch { /* may not exist */ }
    }
  }

  // ── Route handler ──────────────────────────────────────────────

  private async handleRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): Promise<void> {
    const url = (req.url || "/").split("?")[0];
    const method = (req.method || "GET").toUpperCase();
    const query = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`).searchParams;

    // CORS
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    // ── Static files ─────────────────────────────────────────────
    if (method === "GET" && (url === "/" || url.startsWith("/public/"))) {
      return this.serveStatic(req, res, url);
    }

    // ── SSE stream ───────────────────────────────────────────────
    if (method === "GET" && url === "/api/events") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
      });
      this.addSSEClient(res);
      res.write(`event: connected\ndata: {"clientId":${this.sseId}}\n\n`);
      return;
    }

    // ── API routes ───────────────────────────────────────────────

    // Health
    if (method === "GET" && url === "/health") {
      return this.json(res, {
        status: "ok",
        gateway: this.gateway.status,
        project: this.projectName,
        timestamp: new Date().toISOString(),
      });
    }

    // Dashboard summary
    if (method === "GET" && url === "/api/dashboard") {
      let agents = this.gateway.getAgents();

      // Merge configured agents from openclaw.json so newly-added agents
      // are visible even before the gateway heartbeat picks them up.
      try {
        const configured = await this.runOpenClawCommand(["agents", "list", "--json"]);
        const cfgList: any[] = Array.isArray(configured) ? configured : [];
        const knownIds = new Set(agents.map(a => a.name));
        for (const cfg of cfgList) {
          const id = cfg.id || cfg.agentId || cfg.name;
          if (id && !knownIds.has(id)) {
            agents.push({
              id: `agent_${id}`,
              name: id,
              role: cfg.isDefault ? "Default Agent" : "Agent",
              status: "idle",
              model: cfg.model,
              agentId: id,
            });
            knownIds.add(id);
          }
        }
      } catch { /* best-effort — gateway agents are the baseline */ }

      // Also discover workspace-only agents (folders in userdata/agents/ not in CLI or gateway)
      // This ensures legacy/orphan agents are visible and can be deleted.
      try {
        const agentsDir = path.join(this.root, "userdata", "agents");
        const knownIds = new Set(agents.map(a => a.name));
        const wsDirs = (await fs.readdir(agentsDir, { withFileTypes: true }))
          .filter(d => d.isDirectory() && !d.name.startsWith("."))
          .map(d => d.name);
        for (const dirName of wsDirs) {
          if (!knownIds.has(dirName)) {
            agents.push({
              id: `agent_${dirName}`,
              name: dirName,
              role: "Legacy Agent",
              status: "offline",
              agentId: dirName,
            });
          }
        }
      } catch { /* no agents dir yet */ }

      const taskSummary = this.tasks.getSummary();
      const gwHealth = this.gateway.health;
      const presence = this.gateway.presence;
      const usageCost = this.gateway.usageCost;
      // Also include tasks as queue items
      const taskItems = this.tasks.getTasks().map((t) => ({
        id: t.id,
        title: t.name,
        description: t.message || "",
        status: t.status === "running" ? "in_progress" : t.status === "completed" ? "done" : t.status === "failed" ? "done" : "inbox",
        priority: t.status === "failed" ? "high" : "medium",
        source: "task",
        createdAt: t.startTime || new Date().toISOString(),
        updatedAt: t.endTime || t.startTime || new Date().toISOString(),
        tags: [],
      }));
      // Merge system tasks with user-created queue items
      const userQueue = this.tasks.getQueue();
      const allQueue = [...taskItems, ...userQueue];

      // Extract channel status from gateway health
      const channels: Record<string, any> = {};
      if (gwHealth?.channels) {
        for (const [name, ch] of Object.entries(gwHealth.channels)) {
          const info = ch as any;
          channels[name] = {
            configured: info.configured,
            running: info.running,
            probe: info.probe ? { ok: info.probe.ok, elapsedMs: info.probe.elapsedMs } : null,
            botName: info.probe?.bot?.name,
            teamName: info.probe?.team?.name,
          };
        }
      }

      return this.json(res, {
        project: this.projectName,
        gateway: this.gateway.status,
        gatewayHealth: gwHealth ? {
          ok: gwHealth.ok,
          heartbeatSeconds: gwHealth.heartbeatSeconds,
          defaultAgentId: gwHealth.defaultAgentId,
          channels,
          channelOrder: gwHealth.channelOrder || [],
        } : null,
        presence,
        usageCost: usageCost.slice(0, 7), // last 7 days
        agents: {
          list: agents,
          active: agents.filter((a) => a.status === "working").length,
          total: agents.length,
        },
        queue: {
          items: allQueue,
          inbox: allQueue.filter((q) => q.status === "inbox").length,
          assigned: allQueue.filter((q) => q.status === "assigned").length,
          inProgress: allQueue.filter((q) => q.status === "in_progress").length,
          review: allQueue.filter((q) => q.status === "review").length,
          done: allQueue.filter((q) => q.status === "done").length,
          total: allQueue.length,
        },
        tasks: taskSummary,
        feed: this.feedEvents.slice(0, 30),
      });
    }

    // Agents
    if (method === "GET" && url === "/api/agents") {
      const agents = this.gateway.getAgents();
      return this.json(res, {
        agents,
        gateway: this.gateway.status,
        presence: this.gateway.presence,
      });
    }

    // Skills
    if (method === "GET" && url === "/api/skills") {
      const skills = await this.skills.scan();
      return this.json(res, { skills, total: skills.length });
    }

    // Tasks
    if (method === "GET" && url === "/api/tasks") {
      return this.json(res, { tasks: this.tasks.getTasks(), summary: this.tasks.getSummary() });
    }

    // ── Queue item CRUD ──────────────────────────────────────────────

    // Add a new queue item (user-created task)
    if (method === "POST" && url === "/api/queue/add") {
      try {
        const body = JSON.parse(await this.readBody(req));
        const { title, description, priority, assignee, tags } = body;
        if (!title) return this.json(res, { error: "Title is required" }, 400);
        const item = await this.tasks.addQueueItem({ title, description, priority, assignee, tags });
        this.pushFeed({
          type: "task",
          title: `Task created: ${title}`,
          detail: assignee ? `Assigned to ${assignee}` : "Added to inbox",
          actor: assignee || undefined,
        });
        this.broadcastSSE("state:refresh", {});
        return this.json(res, { ok: true, item });
      } catch (err: any) {
        return this.json(res, { error: err.message }, 500);
      }
    }

    // Assign a queue item to an agent
    if (method === "POST" && url === "/api/queue/assign") {
      try {
        const body = JSON.parse(await this.readBody(req));
        const { id, assignee } = body;
        if (!id || !assignee) return this.json(res, { error: "id and assignee are required" }, 400);
        const item = await this.tasks.assignQueueItem(id, assignee);
        if (!item) return this.json(res, { error: "Queue item not found" }, 404);
        this.pushFeed({
          type: "task",
          title: `Task assigned: ${item.title}`,
          detail: `Assigned to ${assignee} — actioned`,
          actor: assignee,
        });
        this.broadcastSSE("state:refresh", {});
        return this.json(res, { ok: true, item });
      } catch (err: any) {
        return this.json(res, { error: err.message }, 500);
      }
    }

    // Update a queue item (status, priority, etc.)
    if (method === "POST" && url === "/api/queue/update") {
      try {
        const body = JSON.parse(await this.readBody(req));
        const { id, ...updates } = body;
        if (!id) return this.json(res, { error: "id is required" }, 400);
        const item = await this.tasks.updateQueueItem(id, updates);
        if (!item) return this.json(res, { error: "Queue item not found" }, 404);
        this.pushFeed({
          type: "task",
          title: `Task updated: ${item.title}`,
          detail: updates.status ? `Status → ${item.status}` : "Updated",
        });
        this.broadcastSSE("state:refresh", {});
        return this.json(res, { ok: true, item });
      } catch (err: any) {
        return this.json(res, { error: err.message }, 500);
      }
    }

    // Delete a queue item
    if (method === "POST" && url === "/api/queue/delete") {
      try {
        const body = JSON.parse(await this.readBody(req));
        const { id } = body;
        if (!id) return this.json(res, { error: "id is required" }, 400);
        const ok = await this.tasks.deleteQueueItem(id);
        if (!ok) return this.json(res, { error: "Queue item not found" }, 404);
        this.broadcastSSE("state:refresh", {});
        return this.json(res, { ok: true });
      } catch (err: any) {
        return this.json(res, { error: err.message }, 500);
      }
    }

    // Feed
    if (method === "GET" && url === "/api/feed") {
      const limit = parseInt(query.get("limit") || "30", 10);
      return this.json(res, { feed: this.feedEvents.slice(0, limit) });
    }

    // Suggest a random agent name (from the CSV pool, excluding names already in use)
    if (method === "GET" && url === "/api/agents/suggest-name") {
      try {
        // Collect identity names already used by gateway agents
        const used = new Set<string>();
        try {
          const agents = await this.runOpenClawCommand(["agents", "list", "--json"]);
          for (const a of (Array.isArray(agents) ? agents : [])) {
            if (a.identityName) used.add(a.identityName.toLowerCase());
            if (a.identity?.name) used.add(a.identity.name.toLowerCase());
            if (a.name) used.add(a.name.toLowerCase());
            if (a.id) used.add(a.id.toLowerCase());
          }
        } catch { /* best-effort */ }
        const suggestion = pickRandomName(used);
        return this.json(res, { name: suggestion });
      } catch (err: any) {
        return this.json(res, { name: `Agent-${Math.floor(Math.random() * 9000) + 1000}` });
      }
    }

    // Add agent (via openclaw CLI)
    if (method === "POST" && url === "/api/agents/add") {
      try {
        const body = JSON.parse(await this.readBody(req));
        const { name, model, bind, skills } = body;
        if (!name) return this.json(res, { error: "Agent name is required" }, 400);

        // Validate: name may include spaces (displayed), but folder uses underscores
        if (!/^[a-zA-Z0-9 _-]+$/.test(name)) {
          return this.json(res, { error: "Agent name must contain only letters, numbers, spaces, hyphens, and underscores" }, 400);
        }
        const folderId = name.replace(/\s+/g, "_");

        // Check uniqueness against existing agents (compare both display name and folder id)
        try {
          const existing = await this.runOpenClawCommand(["agents", "list", "--json"]);
          const existingList = Array.isArray(existing) ? existing : [];
          if (existingList.some((a: any) => a.id === name || a.name === name || a.id === folderId || a.name === folderId)) {
            return this.json(res, { error: `Agent "${name}" already exists` }, 409);
          }
        } catch { /* best-effort — proceed if list fails */ }

        // Each agent gets its own isolated workspace per OpenClaw multi-agent docs
        const workspace = path.join(this.root, "userdata", "agents", folderId);
        await fs.mkdir(workspace, { recursive: true });

        // Resolve skills list early so scaffold can persist them
        const skillsList = Array.isArray(skills) ? skills : [];

        // Populate workspace with required OpenClaw files if they don't exist
        await this.scaffoldAgentWorkspace(workspace, name, model, skillsList);

        const args = ["agents", "add", name, "--non-interactive", "--json"];
        args.push("--workspace", workspace);
        if (model) args.push("--model", model);
        if (bind) args.push("--bind", bind);

        const result = await this.runOpenClawCommand(args);

        // Sync selected skills to the gateway config (per-agent)
        // This must happen AFTER `agents add` so the agent is in agents.list
        if (skillsList.length) {
          await this.writeAgentSkills(name, skillsList);
        }

        // Identity name comes from gateway config — no auto-generated persona to push

        // Restart gateway so it picks up the new agent + skills + identity immediately
        try { await this.runOpenClawCommand(["gateway", "restart"]); } catch { /* best-effort */ }

        // Refresh gateway data so the dashboard reflects the new agent
        try { await this.gateway.refreshAll(); } catch { /* best-effort */ }

        // Attach skills to the response
        if (skillsList.length) {
          result.assignedSkills = skillsList;
        }

        this.pushFeed({
          type: "agent",
          title: `Agent added: ${name}`,
          detail: [model ? `Model: ${model}` : "", skillsList.length ? `Skills: ${skillsList.join(", ")}` : ""].filter(Boolean).join(" · ") || "New agent configured",
        });
        this.broadcastSSE("agents:changed", { action: "add", name, skills: skillsList });
        return this.json(res, result);
      } catch (err: any) {
        return this.json(res, { error: err.message || "Failed to add agent" }, 500);
      }
    }

    // Delete agent (via openclaw CLI)
    if (method === "POST" && url === "/api/agents/delete") {
      try {
        const body = JSON.parse(await this.readBody(req));
        const { name } = body;
        if (!name) return this.json(res, { error: "Agent name is required" }, 400);

        // Try CLI removal first — but don't fail if the agent isn't in gateway config
        // (handles legacy/orphan agents that only exist as workspace folders)
        let cliResult: any = null;
        try {
          cliResult = await this.runOpenClawCommand(["agents", "delete", name, "--force", "--json"]);
        } catch {
          // Agent not in gateway config — that's fine, we'll still clean up the workspace
        }

        // Delete the agent's workspace folder (always, even if CLI failed)
        const workspace = path.join(this.root, "userdata", "agents", name);
        try { await fs.rm(workspace, { recursive: true, force: true }); } catch { /* best-effort */ }

        // Restart gateway so it drops the removed agent
        try { await this.runOpenClawCommand(["gateway", "restart"]); } catch { /* best-effort */ }
        try { await this.gateway.refreshAll(); } catch { /* best-effort */ }

        this.pushFeed({
          type: "agent",
          title: `Agent removed: ${name}`,
          detail: "Agent and workspace deleted",
        });
        this.broadcastSSE("agents:changed", { action: "delete", name });
        return this.json(res, cliResult || { ok: true, deleted: name });
      } catch (err: any) {
        return this.json(res, { error: err.message || "Failed to delete agent" }, 500);
      }
    }

    // Set agent identity (via openclaw CLI)
    if (method === "POST" && url === "/api/agents/set-identity") {
      try {
        const body = JSON.parse(await this.readBody(req));
        const { name: nameField, agentName, identityName, identityEmoji, identityTheme, identityAvatar } = body;
        const name = nameField || agentName;
        if (!name) return this.json(res, { error: "Agent name is required" }, 400);

        const args = ["agents", "set-identity", "--agent", name, "--json"];
        if (identityName) args.push("--name", identityName);
        if (identityEmoji) args.push("--emoji", identityEmoji);
        if (identityTheme) args.push("--theme", identityTheme);
        if (identityAvatar) args.push("--avatar", identityAvatar);

        const result = await this.runOpenClawCommand(args);
        this.pushFeed({
          type: "agent",
          title: `Identity updated: ${name}`,
          detail: [identityName, identityEmoji, identityTheme].filter(Boolean).join(" · ") || "Identity changed",
        });
        this.broadcastSSE("agents:changed", { action: "identity", name });
        return this.json(res, result);
      } catch (err: any) {
        return this.json(res, { error: err.message || "Failed to set identity" }, 500);
      }
    }

    // Save agent skills (synced to gateway config + local workspace)
    if (method === "POST" && url === "/api/agents/skills") {
      try {
        const body = JSON.parse(await this.readBody(req));
        const { name: nameField, agentName, skills } = body;
        const name = nameField || agentName;
        if (!name) return this.json(res, { error: "Agent name is required" }, 400);
        const skillsList = Array.isArray(skills) ? skills : [];
        await this.writeAgentSkills(name, skillsList);

        // Restart gateway so the new per-agent skill config takes effect
        try { await this.runOpenClawCommand(["gateway", "restart"]); } catch { /* best-effort */ }

        this.pushFeed({
          type: "agent",
          title: `Skills updated: ${name}`,
          detail: skillsList.length ? `Skills: ${skillsList.join(", ")}` : "All skills available",
        });
        this.broadcastSSE("agents:changed", { action: "skills", name, skills: skillsList });
        return this.json(res, { ok: true, agent: name, skills: skillsList });
      } catch (err: any) {
        return this.json(res, { error: err.message || "Failed to save skills" }, 500);
      }
    }

    // Agent config — full config data from openclaw agents list (with bindings)
    if (method === "GET" && url === "/api/agents/config") {
      try {
        const agents = await this.runOpenClawCommand(["agents", "list", "--json", "--bindings"]);
        const agentList = Array.isArray(agents) ? agents : [];

        // Enrich with identity from raw openclaw.json (gateway is source of truth for names)
        try {
          const homedir = process.env.HOME || process.env.USERPROFILE || "";
          const configPath = `${homedir}/.openclaw/openclaw.json`;
          const { readFile } = await import("node:fs/promises");
          const raw = JSON.parse(await readFile(configPath, "utf-8"));
          const cfgAgents: any[] = raw?.agents?.list || [];
          const cfgMap = new Map(cfgAgents.map((a: any) => [a.id, a]));
          for (const agent of agentList) {
            const cfg = cfgMap.get((agent as any).id);
            if (cfg?.identity) {
              (agent as any).identityFull = cfg.identity;
              // Override CLI identityName with gateway value (source of truth)
              if (cfg.identity.name) (agent as any).identityName = cfg.identity.name;
              if (cfg.identity.theme) (agent as any).identityTheme = cfg.identity.theme;
              if (cfg.identity.avatar) (agent as any).identityAvatar = cfg.identity.avatar;
              if (cfg.identity.emoji) (agent as any).identityEmoji = cfg.identity.emoji;
            }
            // Skills from gateway config (source of truth)
            if (Array.isArray(cfg?.skills)) {
              (agent as any).skills = cfg.skills;
            } else {
              (agent as any).skills = null; // no restriction
            }
          }
        } catch { /* config enrichment is best-effort */ }

        // Enrich with workspace file existence + SOUL.md summary + persisted skills
        const agentsDir = path.join(this.root, "userdata", "agents");
        const knownAgentIds = new Set(agentList.map((a: any) => (a as any).id || (a as any).name));

        // Also discover workspace-only agents (folders in userdata/agents/ not in CLI config)
        try {
          const wsDirs = (await fs.readdir(agentsDir, { withFileTypes: true }))
            .filter(d => d.isDirectory() && !d.name.startsWith("."))
            .map(d => d.name);
          for (const dirName of wsDirs) {
            if (!knownAgentIds.has(dirName)) {
              agentList.push({ id: dirName, name: dirName, isworkspaceOnly: true } as any);
              knownAgentIds.add(dirName);
            }
          }
        } catch { /* no agents dir yet */ }

        for (const agent of agentList) {
          const id = (agent as any).id || (agent as any).name;
          const agentDir = path.join(agentsDir, id);
          const wsFiles: string[] = [];
          for (const f of ["AGENTS.md", "SOUL.md", "USER.md", "MEMORY.md", "IDENTITY.md", "TOOLS.md"]) {
            try { await fs.access(path.join(agentDir, f)); wsFiles.push(f); } catch { /* skip */ }
          }
          (agent as any).workspaceFiles = wsFiles;

          // Extract first meaningful line from SOUL.md as a summary
          try {
            const soul = await fs.readFile(path.join(agentDir, "SOUL.md"), "utf-8");
            const lines = soul.split("\n").filter(l => l.trim() && !l.startsWith("#"));
            (agent as any).soulSummary = lines[0]?.trim().slice(0, 120) || "";
          } catch { /* no SOUL.md */ }
        }

        return this.json(res, { agents: agentList });
      } catch (err: any) {
        return this.json(res, { agents: [], error: err.message }, 500);
      }
    }

    // Agent templates — suggested multi-agent configurations
    if (method === "GET" && url === "/api/team/templates") {
      return this.json(res, {
        templates: [
          {
            id: "scout", name: "Scout", role: "Data Discovery",
            description: "Explores data sources, profiles datasets, discovers schemas and relationships.",
            skills: ["duckdb", "s3", "postgres"], model: "claude-sonnet-4-5",
            icon: "🔍", color: "#22d3ee", tier: "specialist",
          },
          {
            id: "architect", name: "Architect", role: "Data Modeling",
            description: "Designs dimensional models, builds dbt transformations, manages silver/gold layers.",
            skills: ["dbt", "duckdb", "snowflake"], model: "claude-opus-4-6",
            icon: "🏗", color: "#a78bfa", tier: "specialist",
          },
          {
            id: "pipeline", name: "Pipeline", role: "Orchestration",
            description: "Manages ETL/ELT workflows, schedules DAGs, monitors pipeline health.",
            skills: ["airflow", "dagster", "fivetran", "dlt"], model: "claude-sonnet-4-5",
            icon: "🔄", color: "#60a5fa", tier: "specialist",
          },
          {
            id: "guardian", name: "Guardian", role: "Data Quality",
            description: "Enforces data contracts, runs quality tests, monitors anomalies and SLAs.",
            skills: ["great-expectations", "dbt"], model: "claude-sonnet-4-5",
            icon: "🛡", color: "#34d399", tier: "specialist",
          },
          {
            id: "analyst", name: "Analyst", role: "Analytics & Insights",
            description: "Runs ad-hoc queries, generates reports, builds dashboards and visualizations.",
            skills: ["duckdb", "metabase", "postgres"], model: "claude-sonnet-4-5",
            icon: "📊", color: "#fbbf24", tier: "specialist",
          },
          {
            id: "ops", name: "Ops", role: "Infrastructure",
            description: "Manages cloud warehouses, handles scaling, monitors infrastructure costs.",
            skills: ["snowflake", "bigquery", "databricks", "spark", "kafka"], model: "claude-sonnet-4-5",
            icon: "⚙", color: "#f472b6", tier: "support",
          },
        ],
      });
    }

    // ── Agent workspace file endpoints ─────────────────────────────

    // List workspace files for an agent
    if (method === "GET" && url.startsWith("/api/agents/workspace/")) {
      try {
        const agentName = decodeURIComponent(url.slice("/api/agents/workspace/".length));
        if (!agentName) return this.json(res, { error: "Agent name is required" }, 400);

        const agentDir = path.join(this.root, "userdata", "agents", agentName);
        const WORKSPACE_FILES = ["AGENTS.md", "SOUL.md", "USER.md", "MEMORY.md", "IDENTITY.md", "HEARTBEAT.md", "BOOTSTRAP.md", "TOOLS.md"];
        const files: any[] = [];

        for (const name of WORKSPACE_FILES) {
          try {
            const stat = await fs.stat(path.join(agentDir, name));
            const content = await fs.readFile(path.join(agentDir, name), "utf-8");
            files.push({
              name,
              size: stat.size,
              modified: stat.mtime.toISOString(),
              content,
            });
          } catch { /* file doesn't exist — skip */ }
        }

        return this.json(res, { agent: agentName, files });
      } catch (err: any) {
        return this.json(res, { error: err.message }, 500);
      }
    }

    // Write a workspace file for an agent
    if (method === "POST" && url === "/api/agents/workspace/write") {
      try {
        const body = JSON.parse(await this.readBody(req));
        const { agent: agentName, file: fileName, content } = body;
        if (!agentName || !fileName || content === undefined) {
          return this.json(res, { error: "agent, file, and content are required" }, 400);
        }

        // Security: only allow known workspace markdown files
        const ALLOWED = ["AGENTS.md", "SOUL.md", "USER.md", "MEMORY.md", "IDENTITY.md", "HEARTBEAT.md", "BOOTSTRAP.md", "TOOLS.md"];
        if (!ALLOWED.includes(fileName)) {
          return this.json(res, { error: `Invalid file: ${fileName}` }, 400);
        }

        const fullPath = path.join(this.root, "userdata", "agents", agentName, fileName);
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, content, "utf-8");

        this.pushFeed({
          type: "agent",
          title: `${fileName} updated: ${agentName}`,
          detail: `${content.length} chars written`,
        });

        return this.json(res, { ok: true, agent: agentName, file: fileName, size: content.length });
      } catch (err: any) {
        return this.json(res, { error: err.message }, 500);
      }
    }

    // ── Memory endpoints ─────────────────────────────────────────

    // List all agents and their memory files
    if (method === "GET" && url === "/api/memory") {
      try {
        const agentsDir = path.join(this.root, "userdata", "agents");
        let agentDirs: string[] = [];
        try {
          agentDirs = (await fs.readdir(agentsDir, { withFileTypes: true }))
            .filter(d => d.isDirectory() && !d.name.startsWith("."))
            .map(d => d.name);
        } catch { /* no agents dir yet */ }

        const agents: any[] = [];

        for (const agentName of agentDirs) {
          const agentDir = path.join(agentsDir, agentName);
          const memoryDir = path.join(agentDir, "memory");
          const files: any[] = [];

          // Check MEMORY.md (long-term)
          try {
            const stat = await fs.stat(path.join(agentDir, "MEMORY.md"));
            const content = await fs.readFile(path.join(agentDir, "MEMORY.md"), "utf-8");
            files.push({
              name: "MEMORY.md",
              type: "long-term",
              path: "MEMORY.md",
              size: stat.size,
              modified: stat.mtime.toISOString(),
              preview: content.slice(0, 200),
            });
          } catch { /* no MEMORY.md yet */ }

          // List daily notes
          try {
            const dailyFiles = (await fs.readdir(memoryDir))
              .filter(f => f.endsWith(".md"))
              .sort()
              .reverse();
            for (const file of dailyFiles) {
              const stat = await fs.stat(path.join(memoryDir, file));
              const content = await fs.readFile(path.join(memoryDir, file), "utf-8");
              files.push({
                name: file,
                type: "daily",
                path: `memory/${file}`,
                size: stat.size,
                modified: stat.mtime.toISOString(),
                preview: content.slice(0, 200),
              });
            }
          } catch { /* no memory dir yet */ }

          agents.push({
            name: agentName,
            files,
            totalFiles: files.length,
            totalSize: files.reduce((s, f) => s + f.size, 0),
          });
        }

        return this.json(res, { agents, total: agents.length });
      } catch (err: any) {
        return this.json(res, { error: err.message }, 500);
      }
    }

    // Read a specific memory file
    if (method === "GET" && url.startsWith("/api/memory/read/")) {
      try {
        const rest = url.slice("/api/memory/read/".length); // agentName/path
        const slashIdx = rest.indexOf("/");
        if (slashIdx === -1) return this.json(res, { error: "Invalid path" }, 400);
        const agentName = decodeURIComponent(rest.slice(0, slashIdx));
        const filePath = decodeURIComponent(rest.slice(slashIdx + 1));

        // Security: only allow MEMORY.md and memory/*.md
        if (filePath !== "MEMORY.md" && !filePath.match(/^memory\/[a-zA-Z0-9_-]+\.md$/)) {
          return this.json(res, { error: "Invalid memory path" }, 400);
        }

        const fullPath = path.join(this.root, "userdata", "agents", agentName, filePath);
        const content = await fs.readFile(fullPath, "utf-8");
        const stat = await fs.stat(fullPath);
        return this.json(res, {
          agent: agentName,
          file: filePath,
          content,
          size: stat.size,
          modified: stat.mtime.toISOString(),
        });
      } catch (err: any) {
        if (err.code === "ENOENT") return this.json(res, { error: "File not found" }, 404);
        return this.json(res, { error: err.message }, 500);
      }
    }

    // Write/update a memory file
    if (method === "POST" && url === "/api/memory/write") {
      try {
        const body = JSON.parse(await this.readBody(req));
        const { agent: agentName, file: filePath, content } = body;
        if (!agentName || !filePath || content === undefined) {
          return this.json(res, { error: "agent, file, and content are required" }, 400);
        }

        // Security: only allow MEMORY.md and memory/*.md
        if (filePath !== "MEMORY.md" && !filePath.match(/^memory\/[a-zA-Z0-9_-]+\.md$/)) {
          return this.json(res, { error: "Invalid memory path" }, 400);
        }

        const fullPath = path.join(this.root, "userdata", "agents", agentName, filePath);
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, content, "utf-8");

        this.pushFeed({
          type: "agent",
          title: `Memory updated: ${agentName}`,
          detail: `${filePath} written (${content.length} chars)`,
        });

        return this.json(res, { ok: true, agent: agentName, file: filePath, size: content.length });
      } catch (err: any) {
        return this.json(res, { error: err.message }, 500);
      }
    }

    // 404
    this.json(res, { error: "Not Found", path: url }, 404);
  }

  // ── OpenClaw CLI runner ─────────────────────────────────────────

  private runOpenClawCommand(args: string[]): Promise<any> {
    return new Promise((resolve, reject) => {
      execFile("openclaw", args, { timeout: 30000, maxBuffer: 2 * 1024 * 1024 }, (err, stdout, stderr) => {
        if (err) {
          const msg = stderr?.trim() || err.message;
          return reject(new Error(msg));
        }
        try {
          resolve(JSON.parse(stdout));
        } catch {
          resolve({ output: stdout.trim() });
        }
      });
    });
  }

  // ── Static file server ─────────────────────────────────────────

  /**
   * Scaffold a new agent workspace with required OpenClaw files.
   * Per https://docs.openclaw.ai/concepts/multi-agent — each agent needs
   * its own workspace with AGENTS.md, SOUL.md, and USER.md.
   */
  private async scaffoldAgentWorkspace(workspace: string, agentName: string, model?: string, skills?: string[]): Promise<void> {
    const writeIfMissing = async (file: string, content: string) => {
      const filePath = path.join(workspace, file);
      try {
        await fs.access(filePath);
      } catch {
        await fs.writeFile(filePath, content, "utf-8");
      }
    };

    // Use the agent name directly — no auto-generated persona names

    await writeIfMissing("AGENTS.md", `# AGENTS.md — ${agentName}

This folder is home. Treat it that way.

## First Run

If \`BOOTSTRAP.md\` exists, that's your birth certificate. Follow it, figure out who you are, then delete it.

## Every Session

Before doing anything else:

1. Read \`SOUL.md\` — this is who you are
2. Read \`USER.md\` — this is who you're helping
3. Read \`memory/YYYY-MM-DD.md\` (today + yesterday) for recent context

Don't ask permission. Just do it.

## Memory

You wake up fresh each session. These files are your continuity:

- **Daily notes:** \`memory/YYYY-MM-DD.md\` — raw logs of what happened
- **Long-term:** \`MEMORY.md\` — curated memories

Capture what matters. Decisions, context, things to remember.

## Safety

- Don't exfiltrate private data. Ever.
- Don't run destructive commands without asking.
- \`trash\` > \`rm\` (recoverable beats gone forever)
- When in doubt, ask.
`);

    await writeIfMissing("SOUL.md", `# SOUL.md — ${agentName}

_You are ${agentName}. Define who you are below._

## Core Truths

**Be genuinely helpful, not performatively helpful.** Skip the filler — just help.

**Have opinions.** You're allowed to disagree because you have expertise.

**Be resourceful before asking.** Try to figure it out. Read the file. Search for it. Then ask if you're stuck.

**Earn trust through competence.** Be careful with external actions. Be bold with internal ones.

## Vibe

Be the assistant you'd actually want to work with. Concise when needed, thorough when it matters.

## Continuity

Each session, you wake up fresh. These files _are_ your memory. Read them. Update them.

---

_This file is yours to evolve. As you learn who you are, update it._
`);

    await writeIfMissing("USER.md", `# USER.md — About Your Human

_Learn about the person you're helping. Update this as you go._

- **Name:**
- **What to call them:**
- **Timezone:**
- **Notes:**

## Context

_(What do they care about? What projects are they working on? Build this over time.)_

---

The more you know, the better you can help.
`);

    // Create memory directory for daily notes
    await fs.mkdir(path.join(workspace, "memory"), { recursive: true });

    // Create .openclaw metadata directory
    await fs.mkdir(path.join(workspace, ".openclaw"), { recursive: true });

    // Scaffold IDENTITY.md with the agent name
    await writeIfMissing("IDENTITY.md", `# IDENTITY.md — ${agentName}

- **Name:** ${agentName}
- **Creature:** AI agent
- **Vibe:** Sharp and resourceful
- **Emoji:** 🦞
- **Avatar:**

---

This isn't just metadata. It's the start of figuring out who you are.
`);

    // Skills are written to gateway config after `agents add` (not stored locally)
  }

  private async serveStatic(
    _req: http.IncomingMessage,
    res: http.ServerResponse,
    url: string
  ): Promise<void> {
    // Static assets live at <project-root>/src/mission-control/public/
    const publicDir = path.join(this.root, "src", "mission-control", "public");

    let filePath: string;
    if (url === "/" || url === "/index.html") {
      filePath = path.join(publicDir, "index.html");
    } else if (url.startsWith("/public/")) {
      filePath = path.join(publicDir, url.slice(8));
    } else {
      filePath = path.join(publicDir, url);
    }

    const ext = path.extname(filePath);
    const mimeTypes: Record<string, string> = {
      ".html": "text/html",
      ".css": "text/css",
      ".js": "application/javascript",
      ".json": "application/json",
      ".svg": "image/svg+xml",
      ".png": "image/png",
      ".ico": "image/x-icon",
    };

    try {
      const content = await fs.readFile(filePath, "utf-8");
      res.writeHead(200, {
        "Content-Type": mimeTypes[ext] || "text/plain",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
      });
      res.end(content);
    } catch {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not Found");
    }
  }

  // ── Start ──────────────────────────────────────────────────────

  async start(port = 3200, host = "127.0.0.1"): Promise<void> {
    await this.init();

    const server = http.createServer((req, res) => {
      this.handleRequest(req, res).catch((err) => {
        console.error("Request error:", err);
        this.json(res, { error: "Internal Server Error" }, 500);
      });
    });

    return new Promise((resolve) => {
      server.listen(port, host, () => {
        const BOLD = "\x1B[1m";
        const CYAN = "\x1B[36m";
        const GREEN = "\x1B[32m";
        const DIM = "\x1B[2m";
        const RESET = "\x1B[0m";

        console.log("");
        console.log(`${BOLD}${CYAN}  ╔═══════════════════════════════════════════╗${RESET}`);
        console.log(`${BOLD}${CYAN}  ║        MISSION CONTROL — ONLINE           ║${RESET}`);
        console.log(`${BOLD}${CYAN}  ╚═══════════════════════════════════════════╝${RESET}`);
        console.log("");
        console.log(`  ${GREEN}▸${RESET} Dashboard:  ${BOLD}http://${host}:${port}${RESET}`);
        console.log(`  ${GREEN}▸${RESET} API:        http://${host}:${port}/api/dashboard`);
        console.log(`  ${GREEN}▸${RESET} Events:     http://${host}:${port}/api/events ${DIM}(SSE)${RESET}`);
        console.log(`  ${GREEN}▸${RESET} Gateway:    ${this.gateway.status}`);
        console.log(`  ${GREEN}▸${RESET} Project:    ${this.projectName}`);
        console.log("");
        console.log(`  ${DIM}Press Ctrl+C to stop.${RESET}`);
        console.log("");
        resolve();
      });
    });
  }

  stop(): void {
    if (this.refreshInterval) clearInterval(this.refreshInterval);
    this.gateway.disconnect();
    this.sseClients.forEach((c) => c.res.end());
  }
}

// ── CLI entry point ──────────────────────────────────────────────────

export async function missionControlCommand(
  rest: string[],
  root: string
): Promise<void> {
  const portIdx = rest.indexOf("--port");
  const port = portIdx !== -1 ? parseInt(rest[portIdx + 1], 10) || 3200 : 3200;

  const hostIdx = rest.indexOf("--host");
  const host = hostIdx !== -1 ? rest[hostIdx + 1] || "127.0.0.1" : "127.0.0.1";

  const gwIdx = rest.indexOf("--gateway");
  const gwUrl = gwIdx !== -1 ? rest[gwIdx + 1] : undefined;

  const server = new MissionControlServer(root, gwUrl);
  await server.start(port, host);
}

export default missionControlCommand;
