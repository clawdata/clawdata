/**
 * OpenClaw Gateway client.
 *
 * Uses the `openclaw` CLI to query real Gateway data:
 *   - `openclaw gateway call health --json`    → health / channel status
 *   - `openclaw gateway call status --json`    → sessions, agents, heartbeat
 *   - `openclaw gateway call system-presence --json` → device presence
 *   - `openclaw gateway usage-cost --json`     → token spend per day
 *   - `openclaw sessions --json`               → live session list
 *   - `openclaw logs --json --follow`          → streaming log tail
 *
 * Falls back gracefully when the Gateway or CLI is unavailable.
 */

import { EventEmitter } from "events";
import { execFile, ChildProcess, spawn } from "child_process";

// ── Types ────────────────────────────────────────────────────────────

export interface GatewayAgent {
  id: string;
  name: string;
  role: string;
  status: "working" | "idle" | "offline";
  model?: string;
  currentTask?: string;
  lastSeen?: string;
  tokenUsage?: { input: number; output: number; total: number };
  percentUsed?: number;
  contextTokens?: number;
  sessionId?: string;
  agentId?: string;
}

export interface GatewayHealth {
  ok: boolean;
  ts: number;
  channels: Record<string, any>;
  channelOrder: string[];
  heartbeatSeconds: number;
  defaultAgentId: string;
  agents: any[];
  sessions: any;
}

export interface GatewayPresence {
  host: string;
  ip: string;
  version: string;
  platform: string;
  deviceFamily: string;
  mode: string;
}

export interface UsageCostDay {
  date: string;
  totalTokens: number;
  totalCost: number;
  inputCost: number;
  outputCost: number;
  cacheReadCost: number;
}

export interface GatewayLogEntry {
  type: string;
  time?: string;
  level?: string;
  subsystem?: string;
  message?: string;
}

export type ConnectionStatus = "connected" | "connecting" | "disconnected";

// ── Client ───────────────────────────────────────────────────────────

export class GatewayClient extends EventEmitter {
  private _status: ConnectionStatus = "disconnected";
  private url: string;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private agents: Map<string, GatewayAgent> = new Map();
  private _health: GatewayHealth | null = null;
  private _presence: GatewayPresence[] = [];
  private _usageCost: UsageCostDay[] = [];
  private logProcess: ChildProcess | null = null;
  private _lastStableAgentHash = "";
  private _lastDataHash = "";

  constructor(url = "ws://127.0.0.1:18789") {
    super();
    this.url = url;
  }

  get status(): ConnectionStatus {
    return this._status;
  }

  get isConnected(): boolean {
    return this._status === "connected";
  }

  get health(): GatewayHealth | null {
    return this._health;
  }

  get presence(): GatewayPresence[] {
    return this._presence;
  }

  get usageCost(): UsageCostDay[] {
    return this._usageCost;
  }

  // ── Connect ────────────────────────────────────────────────────

  async connect(): Promise<void> {
    this._status = "connecting";
    this.emit("status", this._status);

    try {
      // Use `openclaw gateway call health --json` to check the real gateway
      const health = await this.cliExec("gateway", ["call", "health", "--json"]) as any;
      if (health && health.ok) {
        this._health = health;
        this._status = "connected";
        this.emit("status", this._status);

        // Initial full data load
        await this.refreshAll();

        // Start polling
        this.startPolling();

        // Start log streaming
        this.startLogStream();
      } else {
        throw new Error("Gateway health check returned not-ok");
      }
    } catch (err) {
      this._status = "disconnected";
      this.emit("status", this._status);
      this.emit("error", `Gateway connection failed: ${(err as Error).message || err}`);
      this.scheduleReconnect();
    }
  }

  disconnect(): void {
    this._status = "disconnected";
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    this.stopLogStream();
    this.emit("status", this._status);
  }

  // ── CLI helper ─────────────────────────────────────────────────

  private cliExec(command: string, args: string[] = []): Promise<unknown> {
    return new Promise((resolve, reject) => {
      execFile(
        "openclaw",
        [command, ...args],
        { timeout: 15000, maxBuffer: 1024 * 1024 },
        (err, stdout, stderr) => {
          if (err) return reject(err);
          try {
            resolve(JSON.parse(stdout));
          } catch {
            // Some commands output multiple JSON objects (one per line)
            const lines = stdout.trim().split("\n").filter(Boolean);
            if (lines.length > 1) {
              try {
                const parsed = lines.map((l) => JSON.parse(l));
                resolve(parsed);
              } catch {
                resolve(null);
              }
            } else {
              resolve(null);
            }
          }
        }
      );
    });
  }

  // ── Data fetching ──────────────────────────────────────────────

  /**
   * Stable hash of agents excluding volatile fields (lastSeen, tokenUsage, percentUsed).
   * Used to suppress no-op SSE emissions that cause frontend flicker.
   */
  private stableAgentHash(agents: GatewayAgent[]): string {
    return JSON.stringify(agents.map(a => ({
      id: a.id, name: a.name, role: a.role, status: a.status,
      model: a.model, agentId: a.agentId,
    })));
  }

  async refreshAll(): Promise<void> {
    await Promise.all([
      this.fetchHealth(),
      this.fetchSessions(),
      this.fetchPresence(),
      this.fetchUsageCost(),
    ]);
    // Only emit data:refresh if something structurally changed
    const dataHash = JSON.stringify({
      agents: this.stableAgentHash(this.getAgents()),
      presence: JSON.stringify(this._presence),
    });
    if (dataHash !== this._lastDataHash) {
      this._lastDataHash = dataHash;
      this.emit("data:refresh", {
        agents: this.getAgents(),
        health: this._health,
        presence: this._presence,
        usageCost: this._usageCost,
      });
    }
  }

  async fetchHealth(): Promise<void> {
    try {
      const result = (await this.cliExec("gateway", ["call", "health", "--json"])) as any;
      if (result && result.ok !== undefined) {
        this._health = result;
        if (!result.ok && this._status === "connected") {
          this._status = "disconnected";
          this.emit("status", this._status);
        } else if (result.ok && this._status !== "connected") {
          this._status = "connected";
          this.emit("status", this._status);
        }
      }
    } catch {
      if (this._status === "connected") {
        this._status = "disconnected";
        this.emit("status", this._status);
      }
    }
  }

  async fetchSessions(): Promise<GatewayAgent[]> {
    try {
      const result = (await this.cliExec("gateway", ["call", "status", "--json"])) as any;
      if (result && result.sessions) {
        const sessions = result.sessions.recent || [];
        const agents = result.agents?.agents || result.heartbeat?.agents || [];

        this.agents.clear();

        // Map each session to an agent card
        for (const session of sessions) {
          const agentMeta = agents.find((a: any) => a.agentId === session.agentId) || {};
          const agent = this.sessionToAgent(session, agentMeta);
          this.agents.set(agent.id, agent);
        }

        // If there are configured agents with no sessions, add them as idle
        for (const agentDef of agents) {
          const hasSession = sessions.some((s: any) => s.agentId === agentDef.agentId);
          if (!hasSession) {
            const id = `agent_${agentDef.agentId}`;
            this.agents.set(id, {
              id,
              name: agentDef.agentId,
              role: agentDef.isDefault ? "Default Agent" : "Agent",
              status: "idle",
              agentId: agentDef.agentId,
            });
          }
        }

        // Only emit if agents structurally changed (ignore timestamps/tokens)
        const stableHash = this.stableAgentHash(this.getAgents());
        if (stableHash !== this._lastStableAgentHash) {
          this._lastStableAgentHash = stableHash;
          this.emit("agents:update", this.getAgents());
        }
        return this.getAgents();
      }
    } catch {
      // Silent failure for polling
    }
    return this.getAgents();
  }

  async fetchPresence(): Promise<void> {
    try {
      const result = (await this.cliExec("gateway", ["call", "system-presence", "--json"])) as any;
      if (Array.isArray(result)) {
        this._presence = result;
      }
    } catch {
      // Presence is optional
    }
  }

  async fetchUsageCost(): Promise<void> {
    try {
      const result = (await this.cliExec("gateway", ["usage-cost", "--json"])) as any;
      if (result && Array.isArray(result.daily)) {
        this._usageCost = result.daily;
      }
    } catch {
      // Usage cost is optional
    }
  }

  /**
   * Get current agent list (cached).
   */
  getAgents(): GatewayAgent[] {
    return Array.from(this.agents.values());
  }

  // ── Map session → agent ────────────────────────────────────────

  private sessionToAgent(session: any, agentMeta: any = {}): GatewayAgent {
    // Determine activity status from age
    const ageMs = session.age || session.ageMs || Infinity;
    const isActive = ageMs < 60000; // active if updated < 1 minute ago

    return {
      id: session.sessionId || session.key || `agent_${session.agentId}`,
      name: session.agentId || agentMeta.agentId || "Agent",
      role: session.kind === "direct" ? "Direct" : session.kind || "Agent",
      status: isActive ? "working" : "idle",
      model: session.model,
      lastSeen: session.updatedAt
        ? new Date(session.updatedAt).toISOString()
        : undefined,
      tokenUsage: {
        input: session.inputTokens || 0,
        output: session.outputTokens || 0,
        total: session.totalTokens || 0,
      },
      percentUsed: session.percentUsed,
      contextTokens: session.contextTokens,
      sessionId: session.sessionId,
      agentId: session.agentId,
    };
  }

  // ── Log streaming ──────────────────────────────────────────────

  startLogStream(): void {
    this.stopLogStream();

    try {
      this.logProcess = spawn("openclaw", ["logs", "--json", "--follow", "--limit", "30"], {
        stdio: ["ignore", "pipe", "pipe"],
      });

      let buffer = "";

      this.logProcess.stdout?.on("data", (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop() || ""; // Keep incomplete line in buffer

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const entry = JSON.parse(line) as GatewayLogEntry;
            this.emit("log", entry);
          } catch {
            // Not JSON, skip
          }
        }
      });

      this.logProcess.stderr?.on("data", () => {
        // Ignore stderr (CLI chrome/warnings)
      });

      this.logProcess.on("exit", (code) => {
        this.logProcess = null;
        // Restart log stream after 5s if still connected
        if (this._status === "connected") {
          setTimeout(() => this.startLogStream(), 5000);
        }
      });

      this.logProcess.on("error", () => {
        this.logProcess = null;
      });
    } catch {
      // openclaw not in PATH or spawn failed
    }
  }

  stopLogStream(): void {
    if (this.logProcess) {
      this.logProcess.kill("SIGTERM");
      this.logProcess = null;
    }
  }

  // ── Polling ────────────────────────────────────────────────────

  private startPolling(): void {
    const poll = async () => {
      if (this._status !== "connected" && this._status !== "connecting") return;
      try {
        await this.refreshAll();
      } catch {
        // Silent failure
      }
      if (this._status === "connected") {
        this.pollTimer = setTimeout(poll, 15000);
      }
    };
    this.pollTimer = setTimeout(poll, 5000);
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 15000);
  }
}
