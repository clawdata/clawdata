/**
 * Mission Control — Dashboard page.
 */

import { state } from "../state.js";
import { escHtml, agentColor, initials, timeAgo } from "../utils.js";
import { setPageContent } from "../router.js";
import { renderFeedItems, handleFeedClick, showFeedDetailModal } from "./feed.js";
import { openModal } from "../modal.js";
import { addQueueItem } from "../api.js";

export function renderDashboardPage(): void {
  const d = state.dashboard || {};
  const agents = state.agents;
  const activeCount = agents.filter(a => a.status === "working").length;
  const totalCost = state.usageCost.reduce((s, d) => s + (d.totalCost || 0), 0).toFixed(2);
  const totalTokens = Math.round(state.usageCost.reduce((s, d) => s + (d.totalTokens || 0), 0) / 1000);

  const dashFeedItems = state.feed.slice(0, 8);

  setPageContent(`
    <div class="page">
      <div class="page-header">
        <div>
          <div class="page-title">Dashboard</div>
          <div class="page-subtitle">Overview of your data platform operations</div>
        </div>
      </div>

      <div class="grid-4">
        <div class="stat-card">
          <div class="stat-card-value">${agents.length}</div>
          <div class="stat-card-label">Agents</div>
          <div class="stat-card-delta positive">${activeCount} active</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-value">${((d as any).queue?.total || 0) - ((d as any).queue?.done || 0)}</div>
          <div class="stat-card-label">Queue Items</div>
          <div class="stat-card-delta">${(d as any).queue?.inProgress || 0} in progress</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-value">$${totalCost}</div>
          <div class="stat-card-label">Usage (7d)</div>
          <div class="stat-card-delta">${totalTokens}k tokens</div>
        </div>
      </div>

      <div class="dash-grid">
        <div class="card">
          <div class="card-header">
            <span class="card-title">Agents</span>
            <a href="#team" style="font-size:11px;color:var(--accent-orange)">View all →</a>
          </div>
          <div class="card-body no-pad">
            <div class="mini-agent-list" id="dashAgents">${renderMiniAgentList(agents)}</div>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <span class="card-title">Live Feed</span>
            <a href="#feed" style="font-size:11px;color:var(--accent-orange)">View all →</a>
          </div>
          <div class="card-body no-pad">
            <div class="feed-list" id="dashFeedList">${renderFeedItems(state.feed.slice(0, 8))}</div>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <span class="card-title">Skills</span>
            <a href="#skills" style="font-size:11px;color:var(--accent-orange)">View all →</a>
          </div>
          <div class="card-body">
            <div style="display:flex;flex-wrap:wrap;gap:4px;">
              ${state.skills.map(s => `<span class="skill-tag ${s.linked ? "active" : ""}">${escHtml(s.name)}</span>`).join("")}
              ${state.skills.length === 0 ? '<span class="skill-tag">Loading...</span>' : ""}
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <span class="card-title">Usage (7d)</span>
            <a href="#usage" style="font-size:11px;color:var(--accent-orange)">Details →</a>
          </div>
          <div class="card-body">
            ${renderUsageMini()}
          </div>
        </div>
      </div>
    </div>
  `, () => {
    // Bind click-to-detail on dashboard feed items (supports threads)
    const feedContainer = document.getElementById("dashFeedList");
    if (feedContainer) {
      feedContainer.addEventListener("click", (e: Event) => handleFeedClick(e, dashFeedItems));
    }

    // Bind agent clicks to agent activity modal
    const agentContainer = document.getElementById("dashAgents");
    if (agentContainer) {
      agentContainer.addEventListener("click", (e: Event) => {
        const row = (e.target as HTMLElement).closest(".mini-agent[data-agent-name]") as HTMLElement | null;
        if (!row) return;
        const name = row.dataset.agentName || "";
        const agent = state.agents.find(a => a.name === name);
        if (agent) showAgentActivityModal(agent);
      });
    }
  });
}

function renderMiniAgentList(agents: any[]): string {
  if (!agents.length) {
    return '<div class="empty-state"><div class="empty-state-icon">🦞</div><div class="empty-state-text">No agents detected. Start OpenClaw to begin.</div></div>';
  }
  return agents.map(a => {
    const c = agentColor(a.name);
    const pct = a.percentUsed || (a.tokenUsage?.total && a.contextTokens ? Math.round(a.tokenUsage.total / a.contextTokens * 100) : 0);
    return `
      <div class="mini-agent" data-agent-name="${escHtml(a.name)}" style="cursor:pointer">
        <div class="mini-agent-avatar" style="background:${c}15;color:${c}">
          ${a.identEmoji ? escHtml(a.identEmoji) : initials(a.name)}
          <div class="mini-status-dot ${a.status}"></div>
        </div>
        <div class="mini-agent-info">
          <div class="mini-agent-name">${escHtml(a.name)}</div>
          <div class="mini-agent-meta">${a.currentTask ? `⚙️ ${escHtml(a.currentTask)}` : `${escHtml(a.role || "Agent")} · ${a.model ? escHtml(a.model) : "—"}`}</div>
        </div>
        ${pct ? `<div class="mini-agent-usage"><div class="mini-usage-bar"><div class="mini-usage-fill" style="width:${pct}%"></div></div><span class="mini-usage-pct">${pct}%</span></div>` : ""}
      </div>`;
  }).join("");
}

function renderUsageMini(): string {
  const days = state.usageCost.slice(0, 7);
  if (!days.length) return '<div style="color:var(--text-muted);font-size:11px">No usage data</div>';
  const max = Math.max(...days.map(d => d.totalTokens || 0), 1);
  return `<div class="usage-chart-area">${days.map(d => {
    const pct = Math.max(3, Math.round((d.totalTokens || 0) / max * 100));
    const tokens = Math.round((d.totalTokens || 0) / 1000);
    const cost = (d.totalCost || 0).toFixed(2);
    const label = d.date ? d.date.slice(5) : "?";
    return `<div class="usage-row"><span class="usage-day">${label}</span><div class="usage-bar-track"><div class="usage-bar-fill" style="width:${pct}%"></div></div><span class="usage-tokens">${tokens}k</span><span class="usage-cost">$${cost}</span></div>`;
  }).join("")}</div>`;
}

// ── Agent Activity Modal ────────────────────────────────────────────

const statusLabels: Record<string, string> = {
  working: "Working", idle: "Idle", busy: "Busy", offline: "Offline", error: "Error",
};
const statusColors: Record<string, string> = {
  working: "var(--accent-green)", idle: "var(--text-muted)", busy: "var(--accent-yellow)", offline: "var(--text-muted)", error: "var(--accent-red)",
};

function showAgentActivityModal(agent: any): void {
  const m = openModal({ maxWidth: "600px" });

  const c = agentColor(agent.name);
  const emoji = agent.identEmoji || "";
  const displayName = agent.identName || agent.name;
  const status = agent.status || "idle";
  const pct = agent.percentUsed || (agent.tokenUsage?.total && agent.contextTokens ? Math.round(agent.tokenUsage.total / agent.contextTokens * 100) : 0);

  // Filter feed for this agent (by actor matching agent name, case-insensitive)
  const agentFeed = state.feed.filter(ev => {
    const actor = ((ev as any).actor || "").toLowerCase();
    return actor === agent.name.toLowerCase() || actor === (agent.identName || "").toLowerCase();
  }).slice(0, 20);

  m.body.innerHTML = `
    <div class="agent-activity-modal">
      <div class="agent-activity-header">
        <div class="agent-activity-avatar" style="background:${c}15;color:${c}">
          ${emoji ? escHtml(emoji) : initials(agent.name)}
          <div class="mini-status-dot ${status}" style="width:10px;height:10px;border-width:2px"></div>
        </div>
        <div style="flex:1;min-width:0">
          <div class="agent-activity-name">${escHtml(displayName)}</div>
          <div class="agent-activity-meta">
            <span class="agent-activity-status" style="color:${statusColors[status] || "var(--text-muted)"}">${statusLabels[status] || status}</span>
            ${agent.role ? ` · ${escHtml(agent.role)}` : ""}
            ${agent.model ? ` · ${escHtml(agent.model)}` : ""}
          </div>
          ${agent.currentTask ? `<div class="agent-activity-task">⚙️ ${escHtml(agent.currentTask)}</div>` : ""}
          ${pct ? `<div class="agent-activity-usage"><div class="mini-usage-bar" style="width:120px"><div class="mini-usage-fill" style="width:${pct}%"></div></div><span style="font-size:10px;color:var(--text-muted)">${pct}% context</span></div>` : ""}
        </div>
        <a href="#team" class="agent-activity-configure" title="Configure agent">⚙</a>
      </div>

      <div class="agent-activity-send">
        <input type="text" id="agentTaskInput" class="agent-task-input" placeholder="Ask ${escHtml(displayName)} to do something…" autocomplete="off" />
        <button class="btn btn-primary agent-task-btn" id="agentTaskSend">Send</button>
      </div>

      <div class="agent-activity-feed-header">
        <span>Recent Activity</span>
        <span style="color:var(--text-muted);font-size:10px">${agentFeed.length} events</span>
      </div>
      <div class="agent-activity-feed" id="agentActivityFeed">
        ${agentFeed.length ? renderAgentFeedItems(agentFeed) : '<div class="empty-state" style="padding:24px 0"><div class="empty-state-icon" style="font-size:20px">📡</div><div class="empty-state-text">No recent activity</div></div>'}
      </div>

      <div style="text-align:right;margin-top:16px">
        <button class="btn feed-detail-close" style="min-width:80px">Close</button>
      </div>
    </div>
  `;

  // Send task handler
  const input = m.body.querySelector("#agentTaskInput") as HTMLInputElement;
  const sendBtn = m.body.querySelector("#agentTaskSend") as HTMLButtonElement;

  async function sendTask() {
    const text = input.value.trim();
    if (!text) return;
    input.disabled = true;
    sendBtn.disabled = true;
    sendBtn.textContent = "Sending…";
    try {
      await addQueueItem({ title: text, assignee: agent.name, priority: "medium" });
      input.value = "";
      input.placeholder = "✓ Sent! Ask something else…";
    } catch (err: any) {
      input.placeholder = `Error: ${err.message || "Failed"}`;
    } finally {
      input.disabled = false;
      sendBtn.disabled = false;
      sendBtn.textContent = "Send";
      input.focus();
    }
  }

  sendBtn.addEventListener("click", sendTask);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") sendTask(); });

  // Focus input
  setTimeout(() => input.focus(), 100);

  // Click on feed items to see detail
  const feedContainer = m.body.querySelector("#agentActivityFeed") as HTMLElement;
  if (feedContainer) {
    feedContainer.addEventListener("click", (e: Event) => {
      const row = (e.target as HTMLElement).closest(".feed-item[data-feed-idx]") as HTMLElement | null;
      if (!row) return;
      const idx = parseInt(row.dataset.feedIdx || "", 10);
      if (!isNaN(idx) && idx >= 0 && idx < agentFeed.length) {
        showFeedDetailModal(agentFeed[idx]);
      }
    });
  }

  m.body.querySelector(".feed-detail-close")?.addEventListener("click", () => m.close());
  m.body.querySelector(".agent-activity-configure")?.addEventListener("click", () => m.close());
}

/** Render simple flat feed items for agent modal (no threading, simpler). */
function renderAgentFeedItems(items: any[]): string {
  const iconMap: Record<string, string> = {
    system: "⚙", plan: "📋", task: "📦", agent: "🤖", error: "⚠", pipeline: "🔄",
  };
  return items.map((ev, i) => {
    const bodyPreview = ev.body ? ev.body.slice(0, 100) : "";
    const icon = ev.icon || iconMap[ev.type] || "•";
    return `
    <div class="feed-item" data-feed-idx="${i}" style="cursor:pointer;padding:8px 6px">
      <div class="feed-icon ${ev.type || "system"}" style="width:26px;height:26px;font-size:11px">${escHtml(icon)}</div>
      <div class="feed-content">
        <div class="feed-title" style="font-size:11px">${escHtml(ev.title)}</div>
        <div class="feed-detail">${escHtml(ev.detail || "")}</div>
        ${bodyPreview ? `<div class="feed-body-preview" style="max-width:380px">${escHtml(bodyPreview)}${ev.body.length > 100 ? "…" : ""}</div>` : ""}
      </div>
      <div class="feed-time">${timeAgo(ev.timestamp)}</div>
    </div>`;
  }).join("");
}
