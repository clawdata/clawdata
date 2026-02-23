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
import * as fsSync from "fs";
import * as os from "os";
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
  body?: string;
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
  private _lastAgentStates: Map<string, string> = new Map();
  /** Cached set of valid agent IDs from `openclaw agents list --json`. Updated on dashboard fetch. */
  private _validAgentIds: Set<string> = new Set();
  /** Dedup cache for recent log messages — prevents duplicate feed/activity entries. */
  private _recentLogHashes: Map<string, number> = new Map();
  private _recentLogCleanupTimer: ReturnType<typeof setInterval> | null = null;
  /** Session monitoring — tracks updatedAt per session to detect new conversations. */
  private _lastSessionUpdates: Map<string, number> = new Map();
  private _sessionPollTimer: ReturnType<typeof setInterval> | null = null;

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

      // Skip raw JSON responses (CLI command output noise from the gateway log stream)
      const trimmed = cleanMsg.trim();
      if ((trimmed.startsWith("{") || trimmed.startsWith("[")) && !subsystem) {
        return;
      }

      // ── Dedup: skip if we've seen this exact message recently ──
      const dedupKey = `${subsystem}|${level}|${cleanMsg.slice(0, 200)}`;
      const now = Date.now();
      const lastSeen = this._recentLogHashes.get(dedupKey);
      if (lastSeen && now - lastSeen < 5000) {
        // Duplicate within 5 seconds — skip entirely
        return;
      }
      this._recentLogHashes.set(dedupKey, now);

      // Determine feed event type based on subsystem
      let feedType: FeedEvent["type"] = "system";
      if (subsystem.startsWith("agent")) feedType = "agent";
      else if (subsystem.includes("channel")) feedType = "pipeline";
      else if (level === "error" || level === "fatal") feedType = "error";

      // Detect agent task responses — messages without a subsystem that reference
      // active task IDs or come from the agent CLI dispatch. These should be tagged
      // as "agent" type and linked to tasks.
      let matchedTask: ReturnType<TaskBridge["getDispatchedTasks"]>[0] | null = null;
      if (!subsystem && level !== "debug") {
        const dispatchedTasks = this.tasks.getDispatchedTasks();
        for (const task of dispatchedTasks) {
          if (cleanMsg.includes(task.id) || cleanMsg.toLowerCase().includes(task.title.toLowerCase().slice(0, 40))) {
            feedType = "agent";
            matchedTask = task;
            break;
          }
        }
      }

      // If we matched a dispatched task, run completion detection immediately
      // (handles "Task <id> complete" pattern where task ID sits between words)
      if (matchedTask && matchedTask.assignee) {
        this.detectTaskCompletion(matchedTask, matchedTask.assignee, cleanMsg);
      }

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

      // ── Task-aware log monitoring ──────────────────────────────
      // Detect agent activity related to dispatched tasks and auto-update status.
      if (subsystem.startsWith("agent")) {
        this.detectTaskActivity(subsystem, cleanMsg);
      }
    });

    // Forward agent updates to SSE + push feed events for state changes
    this.gateway.on("agents:update", (agents: GatewayAgent[]) => {
      // Filter to only agents that exist in the config (skip stale sessions)
      const validAgents = this._validAgentIds.size > 0
        ? agents.filter(a => this._validAgentIds.has(a.agentId || a.name))
        : agents;

      // Generate feed events for meaningful agent state changes
      for (const agent of validAgents) {
        const prev = this._lastAgentStates.get(agent.id || agent.name);
        const key = agent.id || agent.name;
        if (!prev) {
          // New agent appeared
          this.pushFeed({
            type: "agent",
            title: `Agent online: ${agent.name}`,
            detail: `Status: ${agent.status}` + (agent.model ? ` · Model: ${agent.model}` : ""),
            actor: agent.name,
          });
        } else if (prev !== agent.status) {
          // Status changed
          this.pushFeed({
            type: "agent",
            title: `Agent ${agent.status}: ${agent.name}`,
            detail: `${prev} → ${agent.status}`,
            actor: agent.name,
          });
        }
        this._lastAgentStates.set(key, agent.status);
      }
      this.broadcastSSE("agents:update", validAgents);
      this.broadcastSSE("agents:changed", { action: "update", agents: validAgents });
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

    // Repair tasks assigned to agents that no longer exist
    this.repairBrokenTasksOnStartup();

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

    // Clean up dedup cache every 30 seconds
    this._recentLogCleanupTimer = setInterval(() => {
      const cutoff = Date.now() - 10000;
      for (const [key, ts] of this._recentLogHashes) {
        if (ts < cutoff) this._recentLogHashes.delete(key);
      }
    }, 30000);

    // Poll sessions every 20 seconds to detect TUI chat activity
    this._sessionPollTimer = setInterval(() => this.pollSessionChanges(), 20000);
    // First poll after 5 seconds (let gateway connect first)
    setTimeout(() => this.pollSessionChanges(), 5000);
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

  // ── Config identity resolution ─────────────────────────────────

  /**
   * Cache of agent identity overrides from the gateway config file.
   * The gateway config (openclaw.json) is the source of truth for agent
   * identities, since IDENTITY.md can be modified by the agent itself.
   */
  private _configIdentityCache: Map<string, { name?: string; emoji?: string }> = new Map();
  private _configIdentityCacheAge = 0;

  /**
   * Load agent identity overrides from the gateway config file.
   * Returns a map from agent ID → { name, emoji } as set in the config.
   */
  private async loadConfigIdentities(): Promise<Map<string, { name?: string; emoji?: string }>> {
    const now = Date.now();
    // Cache for 15 seconds to avoid repeated reads
    if (this._configIdentityCache.size > 0 && now - this._configIdentityCacheAge < 15000) {
      return this._configIdentityCache;
    }
    try {
      const homedir = process.env.HOME || process.env.USERPROFILE || "";
      const configPath = `${homedir}/.openclaw/openclaw.json`;
      const raw = JSON.parse(await fs.readFile(configPath, "utf-8"));
      const cfgAgents: any[] = raw?.agents?.list || [];
      const map = new Map<string, { name?: string; emoji?: string }>();
      for (const a of cfgAgents) {
        if (a.id && a.identity) {
          map.set(a.id, { name: a.identity.name, emoji: a.identity.emoji });
        }
      }
      this._configIdentityCache = map;
      this._configIdentityCacheAge = now;
    } catch { /* config read failed — use what we have */ }
    return this._configIdentityCache;
  }

  /**
   * Resolve the display name for an agent, preferring the gateway config
   * identity (source of truth) over the CLI-reported identityName
   * (which comes from IDENTITY.md and can drift).
   */
  private async resolveDisplayName(agentFromCli: any): Promise<string> {
    const id = agentFromCli.id || agentFromCli.agentId || agentFromCli.name;
    const configIdentities = await this.loadConfigIdentities();
    const cfgIdentity = configIdentities.get(id);
    // Prefer config identity name → CLI identityName → agent ID
    return cfgIdentity?.name || agentFromCli.identityName || agentFromCli.identity?.name || id;
  }

  /**
   * Resolve the display emoji for an agent from the gateway config.
   */
  private async resolveDisplayEmoji(agentFromCli: any): Promise<string | undefined> {
    const id = agentFromCli.id || agentFromCli.agentId || agentFromCli.name;
    const configIdentities = await this.loadConfigIdentities();
    const cfgIdentity = configIdentities.get(id);
    return cfgIdentity?.emoji || agentFromCli.identityEmoji || agentFromCli.identity?.emoji;
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
      // ── Source of truth: `openclaw agents list --json` ───────────
      // The gateway config is authoritative. Session data from the
      // gateway enriches but never adds agents on its own.
      let agents: any[] = [];
      let cfgList: any[] = [];

      try {
        const configured = await this.runOpenClawCommand(["agents", "list", "--json"]);
        cfgList = Array.isArray(configured) ? configured : [];
        // Update the valid agent ID cache
        this._validAgentIds = new Set(cfgList.map((a: any) => a.id || a.agentId || a.name));
      } catch { /* CLI unavailable — fall back to gateway cache */ }

      if (cfgList.length > 0) {
        // Load config identities (source of truth for display names)
        const configIdentities = await this.loadConfigIdentities();

        // Build the agent list from config, enriched with session data
        const sessionAgents = this.gateway.getAgents();
        const sessionMap = new Map<string, any>();
        for (const sa of sessionAgents) {
          sessionMap.set(sa.agentId || sa.name, sa);
        }

        for (const cfg of cfgList) {
          const id = cfg.id || cfg.agentId || cfg.name;
          // Prefer gateway config identity (user-configured) over CLI identityName
          // (which comes from IDENTITY.md and can be changed by the agent itself)
          const cfgIdentity = configIdentities.get(id);
          const identityName = cfgIdentity?.name || cfg.identityName || cfg.identity?.name || id;
          const identityEmoji = cfgIdentity?.emoji || cfg.identityEmoji || cfg.identity?.emoji;
          const session = sessionMap.get(id);

          agents.push({
            id: session?.id || `agent_${id}`,
            name: id,
            role: cfg.isDefault ? "Default Agent" : "Agent",
            status: session?.status || "idle",
            model: cfg.model || session?.model,
            agentId: id,
            identName: identityName,
            identEmoji: identityEmoji,
            isDefault: cfg.isDefault || false,
            lastSeen: session?.lastSeen,
            tokenUsage: session?.tokenUsage,
            percentUsed: session?.percentUsed,
            contextTokens: session?.contextTokens,
            sessionId: session?.sessionId,
          });
        }

        // Repair tasks assigned to agents that no longer exist
        const validNames = cfgList.flatMap((a: any) => {
          const id = a.id || a.agentId || a.name;
          const cfgIdentity = configIdentities.get(id);
          return [id, cfgIdentity?.name, a.identityName || a.identity?.name].filter(Boolean);
        });
        this.tasks.repairBrokenTasks(validNames).catch(() => {});
      } else {
        // Fallback: use gateway session cache if CLI is unavailable
        agents = this.gateway.getAgents();
      }

      // Enrich agents with dispatched task info — match on both
      // agent ID and identity name (tasks store display names).
      const userQueue = this.tasks.getQueue();
      for (const agent of agents) {
        const names = [agent.name, agent.identName, agent.agentId].filter(Boolean);
        const activeTask = userQueue.find(
          q => q.status === "in_progress" && q.dispatchedAt && names.includes(q.assignee)
        );
        if (activeTask) {
          agent.status = "working";
          agent.currentTask = activeTask.title;
        }
      }

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
          detail: assignee ? `Assigned to ${assignee}` : "Routing to default agent…",
          actor: assignee || undefined,
        });

        // Return response immediately — dispatch happens in background
        this.json(res, { ok: true, item });

        // Fire-and-forget: route + dispatch asynchronously so the client isn't blocked
        this.backgroundDispatchNewTask(item.id, title, assignee).catch(e => {
          console.error("Background dispatch failed:", e);
        });
        return;
      } catch (err: any) {
        return this.json(res, { error: err.message }, 500);
      }
    }

    // Assign a queue item to an agent
    if (method === "POST" && url === "/api/queue/assign") {
      try {
        const body = JSON.parse(await this.readBody(req));
        const { id, assignee, autoDispatch } = body;
        if (!id || !assignee) return this.json(res, { error: "id and assignee are required" }, 400);
        const item = await this.tasks.assignQueueItem(id, assignee);
        if (!item) return this.json(res, { error: "Queue item not found" }, 404);
        // Sync the agent's TASKS.md
        await this.tasks.syncAgentTasksMd(assignee);
        this.pushFeed({
          type: "task",
          title: `Task assigned: ${item.title}`,
          detail: `Assigned to ${assignee} — actioned`,
          actor: assignee,
        });
        this.broadcastSSE("state:refresh", {});
        // Auto-dispatch if requested
        if (autoDispatch) {
          const dResult = await this.tasks.dispatchToAgent(id);
          if (dResult.ok) {
            this.pushFeed({
              type: "task",
              title: `Task dispatched: ${item.title}`,
              detail: `Sent to ${assignee} via OpenClaw`,
              actor: assignee,
              icon: "🚀",
            });
            // If agent responded, check for completion
            if (dResult.response) {
              this.pushFeed({
                type: "agent",
                title: dResult.response.slice(0, 120),
                detail: `${assignee} responded to task`,
                body: dResult.response,
                actor: assignee,
                icon: "🤖",
              });
              const updated = this.tasks.getQueueItem(id);
              if (updated) {
                await this.detectTaskCompletion(updated, assignee, dResult.response);
              }
            }
            this.broadcastSSE("state:refresh", {});
          }
        }
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

    // Clear activity log for a task
    if (method === "POST" && url === "/api/queue/clear-activity") {
      try {
        const body = JSON.parse(await this.readBody(req));
        const { id } = body;
        if (!id) return this.json(res, { error: "id is required" }, 400);
        const item = await this.tasks.clearActivity(id);
        if (!item) return this.json(res, { error: "Queue item not found" }, 404);
        this.broadcastSSE("state:refresh", {});
        return this.json(res, { ok: true, item });
      } catch (err: any) {
        return this.json(res, { error: err.message }, 500);
      }
    }

    // Clear ALL queue items
    if (method === "POST" && url === "/api/queue/clear-all") {
      try {
        const count = await this.tasks.clearAllQueueItems();
        this.pushFeed({
          type: "task",
          title: "All tasks cleared",
          detail: `${count} task(s) removed`,
          icon: "🗑️",
        });
        this.broadcastSSE("state:refresh", {});
        return this.json(res, { ok: true, cleared: count });
      } catch (err: any) {
        return this.json(res, { error: err.message }, 500);
      }
    }

    // Repair broken tasks (unassign from unknown agents)
    if (method === "POST" && url === "/api/queue/repair") {
      try {
        const agents = await this.runOpenClawCommand(["agents", "list", "--json"]);
        const list = Array.isArray(agents) ? agents : [];
        const validNames = list.flatMap((a: any) => [
          a.id,
          a.identityName || a.identity?.name,
        ].filter(Boolean));
        const fixed = await this.tasks.repairBrokenTasks(validNames);
        if (fixed) this.broadcastSSE("state:refresh", {});
        return this.json(res, { ok: true, fixed });
      } catch (err: any) {
        return this.json(res, { error: err.message }, 500);
      }
    }

    // Dispatch a task to an agent (sends via OpenClaw CLI + syncs TASKS.md)
    if (method === "POST" && url === "/api/queue/dispatch") {
      try {
        const body = JSON.parse(await this.readBody(req));
        const { id } = body;
        if (!id) return this.json(res, { error: "id is required" }, 400);
        const qItem = this.tasks.getQueueItem(id);
        if (!qItem) return this.json(res, { error: "Task not found" }, 404);
        if (!qItem.assignee) return this.json(res, { error: "Task has no assignee" }, 400);

        // Resolve display name → gateway agent ID
        const agentId = await this.resolveAgentId(qItem.assignee);

        const result = await this.tasks.dispatchToAgent(id, agentId);
        if (!result.ok) return this.json(res, { error: result.error }, 400);
        const item = this.tasks.getQueueItem(id);
        this.pushFeed({
          type: "task",
          title: `Task dispatched: ${item?.title || id}`,
          detail: `Sent to ${item?.assignee} via OpenClaw`,
          actor: item?.assignee,
          icon: "🚀",
        });

        // If the agent responded, check for task completion
        if (result.response && item) {
          this.pushFeed({
            type: "agent",
            title: result.response.slice(0, 120),
            detail: `${item.assignee} responded to task`,
            body: result.response,
            actor: item.assignee,
            icon: "🤖",
          });
          await this.detectTaskCompletion(item, item.assignee || "agent", result.response);
        }

        this.broadcastSSE("state:refresh", {});
        return this.json(res, { ok: true, item: this.tasks.getQueueItem(id) });
      } catch (err: any) {
        return this.json(res, { error: err.message }, 500);
      }
    }

    // Mark a task complete (by agent or human)
    if (method === "POST" && url === "/api/queue/complete") {
      try {
        const body = JSON.parse(await this.readBody(req));
        const { id, actor, summary } = body;
        if (!id) return this.json(res, { error: "id is required" }, 400);
        const item = await this.tasks.updateQueueItem(id, { status: "done" }, actor || "agent");
        if (!item) return this.json(res, { error: "Queue item not found" }, 404);
        if (summary) {
          await this.tasks.recordAgentActivity(id, actor || "agent", "summary", summary);
        }
        this.pushFeed({
          type: "task",
          title: `Task completed: ${item.title}`,
          detail: summary || `Completed by ${actor || "agent"}`,
          actor: actor || item.assignee,
          icon: "✅",
        });
        this.broadcastSSE("state:refresh", {});
        return this.json(res, { ok: true, item });
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

  /**
   * Background dispatch for a newly-created task.
   * Runs after the HTTP response has been sent so the client isn't blocked.
   */
  private async backgroundDispatchNewTask(itemId: string, title: string, assignee?: string): Promise<void> {
    let displayName = assignee || "";
    let agentId: string | undefined;

    if (!assignee) {
      // Auto-route to the default agent (Chief of Staff)
      try {
        const agents = await this.runOpenClawCommand(["agents", "list", "--json"]);
        const list = Array.isArray(agents) ? agents : [];
        const defaultAgent = list.find((a: any) => a.isDefault);
        if (defaultAgent) {
          agentId = defaultAgent.id;
          // Use config identity (source of truth) — IDENTITY.md can drift
          displayName = await this.resolveDisplayName(defaultAgent);
          await this.tasks.assignQueueItem(itemId, displayName);
          await this.tasks.syncAgentTasksMd(displayName);
        } else {
          return; // No default agent — task stays in inbox
        }
      } catch (e) {
        console.error("Auto-route to default agent failed:", e);
        return;
      }
    } else {
      // Explicit assignee — validate against known agents before dispatching
      try {
        const agents = await this.runOpenClawCommand(["agents", "list", "--json"]);
        const list = Array.isArray(agents) ? agents : [];
        const validNames: string[] = [];
        for (const a of list) {
          const resolvedName = await this.resolveDisplayName(a);
          validNames.push(a.id, resolvedName);
          if (a.identityName) validNames.push(a.identityName);
        }
        const isValid = validNames.some(n => n.toLowerCase() === assignee.toLowerCase());
        if (!isValid) {
          console.warn(`Assignee "${assignee}" does not match any known agent — routing to default`);
          // Re-route to default agent instead of a phantom agent
          const defaultAgent = list.find((a: any) => a.isDefault);
          if (defaultAgent) {
            agentId = defaultAgent.id;
            displayName = await this.resolveDisplayName(defaultAgent);
            await this.tasks.assignQueueItem(itemId, displayName);
            await this.tasks.syncAgentTasksMd(displayName);
          }
        } else {
          agentId = await this.resolveAgentId(assignee);
          await this.tasks.syncAgentTasksMd(assignee);
        }
      } catch {
        // Validation failed — proceed with best-effort
        agentId = await this.resolveAgentId(assignee);
        await this.tasks.syncAgentTasksMd(assignee);
      }
    }

    // Dispatch to the agent using the resolved gateway ID
    const dResult = await this.tasks.dispatchToAgent(itemId, agentId);
    if (dResult.ok) {
      this.pushFeed({
        type: "task",
        title: `Task dispatched to ${displayName}`,
        detail: `"${title}" sent to ${displayName}`,
        actor: displayName,
        icon: "🚀",
      });

      // If the agent responded, push the response into the feed and check for completion
      if (dResult.response) {
        this.pushFeed({
          type: "agent",
          title: dResult.response.slice(0, 120),
          detail: `${displayName} responded to task`,
          body: dResult.response,
          actor: displayName,
          icon: "🤖",
        });

        // Check if the response indicates completion
        const task = (await this.tasks.load(), this.tasks.getQueue().find(q => q.id === itemId));
        if (task) {
          await this.detectTaskCompletion(task, displayName, dResult.response);
        }
      }
    } else {
      this.pushFeed({
        type: "error",
        title: `Dispatch failed: ${title}`,
        detail: dResult.error || "Unknown error",
        actor: displayName,
        icon: "⚠️",
      });
    }
    this.broadcastSSE("state:refresh", {});
  }

  /**
   * Resolve a display name (identityName) or agent ID back to the actual gateway agent ID.
   * The UI uses identityName for display, but `openclaw agent --agent <id>` needs the real ID.
   * Also checks gateway config identity names (source of truth).
   */
  private async resolveAgentId(nameOrId: string): Promise<string> {
    try {
      const agents = await this.runOpenClawCommand(["agents", "list", "--json"]);
      const list = Array.isArray(agents) ? agents : [];
      const configIdentities = await this.loadConfigIdentities();

      // Direct match on id
      const byId = list.find((a: any) => a.id === nameOrId);
      if (byId) return byId.id;
      // Match on config identity name (source of truth for display names)
      for (const a of list) {
        const cfgName = configIdentities.get(a.id)?.name;
        if (cfgName === nameOrId) return a.id;
      }
      // Match on CLI identityName
      const byIdentity = list.find((a: any) =>
        a.identityName === nameOrId ||
        a.identity?.name === nameOrId
      );
      if (byIdentity) return byIdentity.id;
      // Case-insensitive fallback (including config names)
      const lower = nameOrId.toLowerCase();
      for (const a of list) {
        const cfgName = configIdentities.get(a.id)?.name;
        if (
          (a.id || "").toLowerCase() === lower ||
          (cfgName || "").toLowerCase() === lower ||
          (a.identityName || "").toLowerCase() === lower ||
          (a.identity?.name || "").toLowerCase() === lower
        ) return a.id;
      }
    } catch { /* best-effort */ }
    // Fallback: return as-is (may work if it's already a valid ID)
    return nameOrId;
  }

  /**
   * Repair tasks assigned to agents that no longer exist — runs once on startup.
   */
  private async repairBrokenTasksOnStartup(): Promise<void> {
    try {
      const agents = await this.runOpenClawCommand(["agents", "list", "--json"]);
      const list = Array.isArray(agents) ? agents : [];
      const configIdentities = await this.loadConfigIdentities();
      const validNames = list.flatMap((a: any) => [
        a.id,
        a.identityName || a.identity?.name,
        configIdentities.get(a.id)?.name,
      ].filter(Boolean));
      const fixed = await this.tasks.repairBrokenTasks(validNames);
      if (fixed) {
        console.log(`  Repaired ${fixed} task(s) with unknown agent assignments`);
        this.broadcastSSE("state:refresh", {});
      }
    } catch {
      // Gateway not available yet — will be fixed on next repair call
    }
  }

  // ── Session change monitoring (TUI chat detection) ─────────────

  /**
   * Read the last N messages from a session JSONL file.
   * Returns an array of { role, text, thinking } objects.
   */
  private readRecentSessionMessages(
    agentId: string,
    sessionId: string,
    count = 4
  ): { role: string; text: string; thinking: string }[] {
    try {
      const sessionFile = path.join(
        os.homedir(), ".openclaw", "agents", agentId, "sessions", `${sessionId}.jsonl`
      );
      const raw = fsSync.readFileSync(sessionFile, "utf-8").trim();
      if (!raw) return [];
      const lines = raw.split("\n").slice(-count);
      const results: { role: string; text: string; thinking: string }[] = [];
      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          const msg = entry?.message;
          if (!msg?.role) continue;
          const contents: any[] = Array.isArray(msg.content) ? msg.content : [];
          const textParts = contents
            .filter((c: any) => c.type === "text")
            .map((c: any) => (c.text || "").replace(/^\[\[reply_to_current\]\]/i, "").trim())
            .filter(Boolean);
          const thinkingParts = contents
            .filter((c: any) => c.type === "thinking")
            .map((c: any) => (c.thinking || "").trim())
            .filter(Boolean);
          // For user messages, strip the metadata envelope
          let text = textParts.join("\n");
          if (msg.role === "user") {
            // User messages may have "Conversation info ..." preamble; extract last line after timestamp
            const dateMatch = text.match(/\[.+?\]\s*(.*)/s);
            if (dateMatch) text = dateMatch[1].trim();
            // Also strip task dispatch preamble
            if (text.startsWith("📋")) text = text.replace(/^📋\s*\*\*New Task Assigned\*\*.*?\n/i, "").trim();
          }
          results.push({
            role: msg.role,
            text,
            thinking: thinkingParts.join(" "),
          });
        } catch { /* skip malformed lines */ }
      }
      return results;
    } catch {
      return [];
    }
  }

  /**
   * Poll OpenClaw sessions for changes — detects TUI chat activity that
   * doesn't appear in the gateway log stream.
   */
  private async pollSessionChanges(): Promise<void> {
    try {
      const status = await this.runOpenClawCommand(["gateway", "call", "status", "--json"]);
      const sessions = status?.sessions;
      if (!sessions) return;

      // Walk byAgent → recent sessions for each agent
      const byAgent: any[] = sessions.byAgent || [];
      for (const ag of byAgent) {
        const agentId = ag.agentId;
        if (!agentId) continue;
        const recent: any[] = ag.recent || [];
        for (const sess of recent) {
          const key = sess.key || sess.sessionId || `${agentId}:${sess.kind}`;
          const updatedAt: number = sess.updatedAt || 0;
          const prev = this._lastSessionUpdates.get(key);

          if (prev === undefined) {
            // First time seeing this session — just record it
            this._lastSessionUpdates.set(key, updatedAt);
            continue;
          }

          if (updatedAt > prev) {
            // Session was updated since last poll — new conversation activity
            this._lastSessionUpdates.set(key, updatedAt);

            // Resolve agent display name
            let displayName = agentId;
            try {
              const agents = this.gateway.getAgents();
              const match = agents.find(a => a.name === agentId || a.agentId === agentId);
              if (match) displayName = (match as any).identName || (match as any).identityName || match.name;
            } catch { /* best effort */ }

            const kind = sess.kind === "direct" ? "chat" : sess.kind || "session";
            const model = sess.model || "";
            const tokensUsed = sess.totalTokens || 0;
            const pctUsed = sess.percentUsed || 0;

            // Try to read recent conversation content from the session JSONL
            const sessionId = sess.sessionId || "";
            const recentMsgs = sessionId
              ? this.readRecentSessionMessages(agentId, sessionId, 4)
              : [];
            // Build body from last exchange (user question + assistant reply + thinking)
            let body = "";
            if (recentMsgs.length > 0) {
              const parts: string[] = [];
              for (const m of recentMsgs) {
                const prefix = m.role === "user" ? "👤 User" : m.role === "assistant" ? "🤖 Assistant" : m.role;
                if (m.text) parts.push(`${prefix}: ${m.text}`);
                if (m.thinking) parts.push(`💭 Thinking: ${m.thinking}`);
              }
              body = parts.join("\n\n");
            }

            this.pushFeed({
              type: "agent",
              title: `${displayName} ${kind} activity`,
              detail: model
                ? `${model} · ${tokensUsed.toLocaleString()} tokens (${pctUsed}% used)`
                : `Session updated`,
              body: body || undefined,
              actor: displayName,
              icon: "💬",
            });

            // Check if this session corresponds to a dispatched task and record activity
            const agentTasks = this.tasks.getAgentTasks(displayName)
              .filter(t => t.status === "in_progress" && t.dispatchedAt);
            if (agentTasks.length > 0) {
              const task = agentTasks[0];
              await this.tasks.recordAgentActivity(
                task.id, displayName, "working",
                `Agent had conversation activity (${tokensUsed.toLocaleString()} tokens)`
              );
            }

            this.broadcastSSE("state:refresh", {});
          }
        }
      }
    } catch {
      // Gateway unavailable — skip this poll cycle
    }
  }

  // ── Task completion detection (smart) ────────────────────────

  /**
   * Detect task completion from a log message that already matched a specific task.
   * Uses broad regex patterns to handle "Task <id> complete:", "done", etc.
   */
  private async detectTaskCompletion(
    task: { id: string; title: string; assignee?: string; status: string; dispatchedAt?: string },
    agentName: string,
    message: string
  ): Promise<void> {
    if (task.status === "done") return; // Already completed

    const lower = message.toLowerCase();

    // Broad completion detection — this fires when the message already matched the task
    // so we can be more aggressive with patterns:
    const completionPatterns = [
      /\bcomplete[d]?\b/,        // "complete", "completed"
      /\bdone\b/,                 // "done"
      /\bfinish(?:ed)?\b/,       // "finish", "finished"
      /\bnothing else required\b/, // "nothing else required"
      /\bwork is done\b/,
      /\ball done\b/,
      /\bmission accomplished\b/,
      /\btask.*(?:resolved|closed)\b/,
    ];

    const isCompletion = completionPatterns.some(p => p.test(lower));

    if (isCompletion) {
      // updateQueueItem already records a "completed" activity entry with the
      // status transition detail, so we only add the agent response text separately
      // if it's substantive.
      await this.tasks.updateQueueItem(task.id, { status: "done" }, agentName);
      await this.tasks.syncAgentTasksMd(agentName);
      this.pushFeed({
        type: "task",
        title: `Agent completed: ${task.title}`,
        detail: `${agentName} finished the task`,
        actor: agentName,
        icon: "✅",
      });
      this.broadcastSSE("state:refresh", {});
    } else {
      // Not a completion — record as working activity
      if (message.length > 20) {
        await this.tasks.recordAgentActivity(task.id, agentName, "working", message.slice(0, 200));
      }
    }
  }

  // ── Task-aware log monitoring ─────────────────────────────────

  /**
   * Detect agent activity related to dispatched tasks from gateway logs.
   * When an agent subsystem reports activity, we look for dispatched tasks
   * assigned to that agent and record the activity.
   */
  private async detectTaskActivity(subsystem: string, message: string): Promise<void> {
    // Extract agent name from subsystem (e.g., "agent:myagent" or "agent/myagent" → "myagent")
    const agentMatch = subsystem.match(/^agent[:\-\/](.+)/i);
    if (!agentMatch) return;
    const agentId = agentMatch[1];

    // Tasks may be stored by display name (identityName) rather than gateway ID.
    // Try both the raw ID and resolve to display name.
    let agentTasks = this.tasks.getAgentTasks(agentId);
    let agentName = agentId;
    if (!agentTasks.length) {
      // Try finding by resolving: the gateway agent list maps id → identityName
      try {
        const agents = this.gateway.getAgents();
        const match = agents.find(a => a.name === agentId || a.agentId === agentId);
        if (match) {
          const displayName = (match as any).identName || (match as any).identityName || match.name;
          agentTasks = this.tasks.getAgentTasks(displayName);
          if (agentTasks.length) agentName = displayName;
        }
      } catch { /* best effort */ }
    }
    // Match dispatched tasks first, then fall back to any active (assigned/in_progress)
    const dispatched = agentTasks.filter(t => t.status === "in_progress" && t.dispatchedAt);
    const active = dispatched.length
      ? dispatched
      : agentTasks.filter(t => t.status === "in_progress" || t.status === "assigned");
    if (!active.length) return;

    const lowerMsg = message.toLowerCase();

    // Detect completion signals
    const completionPhrases = [
      "task completed", "task complete", "task done", "finished the task",
      "completed the work", "work is done", "work complete", "mission accomplished",
      "all done", "done—", "complete—",
    ];
    const isCompletion = completionPhrases.some(p => lowerMsg.includes(p));

    if (isCompletion && active.length === 1) {
      // Auto-complete the single active task
      const task = active[0];
      await this.tasks.updateQueueItem(task.id, { status: "done" }, agentName);
      await this.tasks.syncAgentTasksMd(agentName);
      this.pushFeed({
        type: "task",
        title: `Agent completed: ${task.title}`,
        detail: `${agentName} finished the task`,
        actor: agentName,
        icon: "✅",
      });
      this.broadcastSSE("state:refresh", {});
      return;
    }

    // Record general agent activity on the most recent active task
    if (active.length > 0) {
      const recentTask = active.sort((a, b) =>
        (b.dispatchedAt || b.updatedAt || "").localeCompare(a.dispatchedAt || a.updatedAt || "")
      )[0];
      // Only record substantive messages (skip heartbeats, short messages)
      if (message.length > 20) {
        await this.tasks.recordAgentActivity(
          recentTask.id, agentName, "working", message.slice(0, 200)
        );
      }
    }
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

    // Scaffold TASKS.md — task management instructions for the agent
    await writeIfMissing("TASKS.md", `# TASKS.md — ${agentName}

_Last synced: ${new Date().toISOString()}_

You are responsible for the tasks listed below. Work through them in priority order.

## How to Work Tasks

1. **Review** — Read the task title and description. Understand what's needed.
2. **Work** — Use your tools to accomplish the task. Search, code, analyze.
3. **Report** — Summarize what you did and any findings.
4. **Complete** — When finished, your work is done. The system tracks progress.

## Delegation (Chief of Staff)

If you are the Chief of Staff (default agent), you may delegate tasks to specialist agents
using \`sessions_send\`. Match tasks to the agent best suited for the work.

## Open Tasks

_No tasks assigned yet. Tasks will appear here when dispatched._
`);
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
