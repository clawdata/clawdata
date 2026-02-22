/**
 * Mission Control — Gateway page.
 */

import { state } from "../state.js";
import { escHtml } from "../utils.js";
import { setPageContent } from "../router.js";

export function renderGatewayPage(): void {
  const gh = state.gatewayHealth;
  const presence = state.presence;

  setPageContent(`
    <div class="page">
      <div class="page-header">
        <div>
          <div class="page-title">Gateway</div>
          <div class="page-subtitle">OpenClaw Gateway status and configuration</div>
        </div>
        <div class="navbar-status ${state.gateway === "connected" ? "online" : "offline"}">
          <div class="status-dot"></div>
          <span>${state.gateway === "connected" ? "ONLINE" : state.gateway === "connecting" ? "CONNECTING" : "OFFLINE"}</span>
        </div>
      </div>

      <div class="gateway-grid">
        <div class="card">
          <div class="card-header"><span class="card-title">System Presence</span></div>
          <div class="card-body">
            ${presence.length ? presence.map(p => `
              <div class="gateway-detail-row"><span class="gateway-label">Host</span><span class="gateway-value">${escHtml(p.host)}</span></div>
              <div class="gateway-detail-row"><span class="gateway-label">IP</span><span class="gateway-value">${escHtml(p.ip)}</span></div>
              <div class="gateway-detail-row"><span class="gateway-label">Version</span><span class="gateway-value">${escHtml(p.version)}</span></div>
              <div class="gateway-detail-row"><span class="gateway-label">Platform</span><span class="gateway-value">${escHtml(p.platform)}</span></div>
              <div class="gateway-detail-row"><span class="gateway-label">Mode</span><span class="gateway-value">${escHtml(p.mode)}</span></div>
            `).join("") : '<div style="color:var(--text-muted)">No presence data</div>'}
          </div>
        </div>

        <div class="card">
          <div class="card-header"><span class="card-title">Configuration</span></div>
          <div class="card-body">
            ${gh ? `
              <div class="gateway-detail-row"><span class="gateway-label">OK</span><span class="gateway-value">${gh.ok ? "✓" : "✗"}</span></div>
              <div class="gateway-detail-row"><span class="gateway-label">Default Agent</span><span class="gateway-value">${escHtml(gh.defaultAgentId || "main")}</span></div>
              <div class="gateway-detail-row"><span class="gateway-label">Heartbeat</span><span class="gateway-value">${gh.heartbeatSeconds ? Math.round(gh.heartbeatSeconds / 60) + "m" : "—"}</span></div>
            ` : '<div style="color:var(--text-muted)">No health data</div>'}
          </div>
        </div>

        <div class="card" style="grid-column:1/-1">
          <div class="card-header"><span class="card-title">Channels</span></div>
          <div class="card-body">
            ${gh?.channelOrder?.length ? gh.channelOrder.map((chName: string) => {
              const ch = gh.channels[chName];
              if (!ch) return "";
              const ok = ch.probe?.ok;
              return `<div class="channel-card">
                <div class="channel-status-dot" style="background:${ok ? "var(--accent-green)" : ch.configured ? "var(--accent-yellow)" : "var(--text-muted)"}"></div>
                <span class="channel-name">${escHtml(ch.botName || chName)}</span>
                <span style="font-size:11px;color:var(--text-muted)">${escHtml(chName)}</span>
                <span class="channel-latency">${ok ? ch.probe?.elapsedMs + "ms" : ch.configured ? "configured" : "off"}</span>
              </div>`;
            }).join("") : '<div style="color:var(--text-muted)">No channels configured</div>'}
          </div>
        </div>
      </div>
    </div>
  `);
}
