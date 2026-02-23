/**
 * Mission Control — Navbar and sidebar badge rendering.
 */

import { state } from "./state.js";
import { $ } from "./utils.js";

export function renderNavbar(): void {
  const d = state.dashboard;
  const agents = $("statAgentsActive");
  const queue = $("statTasksQueue");
  if (agents) agents.textContent = String(d?.agents?.active || state.agents.filter(a => a.status === "working").length);
  if (queue) queue.textContent = String((d?.queue?.total || state.queue.length) - (d?.queue?.done || 0));

  const badge = $("projectBadge");
  if (d?.project && badge) badge.textContent = d.project.toUpperCase();

  const el = $("gatewayStatus");
  const text = $("gatewayStatusText");
  if (el && text) {
    el.classList.remove("online", "offline");
    if (state.gateway === "connected") {
      el.classList.add("online");
      text.textContent = "ONLINE";
    } else {
      el.classList.add("offline");
      text.textContent = state.gateway === "connecting" ? "CONNECTING" : "OFFLINE";
    }
  }
}

export function renderSidebarBadges(): void {
  const fb = $("feedBadge");
  if (fb) fb.textContent = String(state.feed.length || "");

  const tb = $("tasksBadge");
  if (tb) tb.textContent = String(state.queue.filter(q => q.status !== "done").length || "");

  const agb = $("agentsBadge");
  if (agb) agb.textContent = String(state.agents.length || "");

  const pEl = $("sidebarPresence");
  if (pEl && state.presence.length) {
    const p = state.presence[0];
    pEl.innerHTML = `<span>${p.host} · ${p.version}</span><span>${p.platform}</span>`;
  }
}
