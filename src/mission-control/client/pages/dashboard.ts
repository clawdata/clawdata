/**
 * Mission Control — Dashboard page.
 */

import { state } from "../state.js";
import { escHtml, agentColor, initials, timeAgo } from "../utils.js";
import { setPageContent } from "../router.js";
import { renderFeedItems } from "./feed.js";

export function renderDashboardPage(): void {
  const d = state.dashboard || {};
  const agents = state.agents;
  const activeCount = agents.filter(a => a.status === "working").length;
  const totalCost = state.usageCost.reduce((s, d) => s + (d.totalCost || 0), 0).toFixed(2);
  const totalTokens = Math.round(state.usageCost.reduce((s, d) => s + (d.totalTokens || 0), 0) / 1000);

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
          <div class="stat-card-value">${(d as any).queue?.total || 0}</div>
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
            <div class="feed-list">${renderFeedItems(state.feed.slice(0, 8))}</div>
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
  `);
}

function renderMiniAgentList(agents: any[]): string {
  if (!agents.length) {
    return '<div class="empty-state"><div class="empty-state-icon">🦞</div><div class="empty-state-text">No agents detected. Start OpenClaw to begin.</div></div>';
  }
  return agents.map(a => {
    const c = agentColor(a.name);
    const pct = a.percentUsed || (a.tokenUsage?.total && a.contextTokens ? Math.round(a.tokenUsage.total / a.contextTokens * 100) : 0);
    return `
      <div class="mini-agent" onclick="window.__mc.navigate('team')">
        <div class="mini-agent-avatar" style="background:${c}15;color:${c}">
          ${initials(a.name)}
          <div class="mini-status-dot ${a.status}"></div>
        </div>
        <div class="mini-agent-info">
          <div class="mini-agent-name">${escHtml(a.name)}</div>
          <div class="mini-agent-meta">${escHtml(a.role || "Agent")} · ${a.model ? escHtml(a.model) : "—"}</div>
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
