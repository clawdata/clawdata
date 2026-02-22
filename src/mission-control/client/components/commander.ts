/**
 * Mission Control — Commander (Cmd+K) command palette.
 */

import { state } from "../state.js";
import { $, escHtml } from "../utils.js";
import { navigate } from "../router.js";
import { AGENT_ROLES, AGENT_TEMPLATES } from "../roles.js";

export function openCommander(): void {
  state.commanderOpen = true;
  state.commanderQuery = "";
  state.commanderIndex = 0;
  const overlay = $("commanderOverlay");
  if (overlay) overlay.classList.add("open");
  const input = $("commanderInput") as HTMLInputElement;
  if (input) { input.value = ""; input.focus(); }
  renderCommanderResults();
}

export function closeCommander(): void {
  state.commanderOpen = false;
  const overlay = $("commanderOverlay");
  if (overlay) overlay.classList.remove("open");
}

interface CommanderItem {
  label: string;
  detail?: string;
  page: string;
  icon: string;
  group: string;
}

function getCommanderItems(query: string): CommanderItem[] {
  const q = query.toLowerCase().trim();

  const pages: CommanderItem[] = [
    { label: "Dashboard", page: "dashboard", icon: "🏠", group: "Pages" },
    { label: "Live Feed", page: "feed", icon: "📡", group: "Pages" },
    { label: "Tasks", page: "tasks", icon: "✅", group: "Pages" },
    { label: "Queue", page: "queue", icon: "📋", group: "Pages" },
    { label: "Agents", page: "team", icon: "👥", group: "Pages" },
    { label: "Skills", page: "skills", icon: "🔧", group: "Pages" },
    { label: "Usage", page: "usage", icon: "📊", group: "Pages" },
    { label: "Gateway", page: "gateway", icon: "🖥", group: "Pages" },
  ];

  const agentItems: CommanderItem[] = state.agents.map(a => ({
    label: a.name,
    detail: `${a.role || "Agent"} · ${a.status}`,
    page: "team",
    icon: "🤖",
    group: "Agents",
  }));

  const skillItems: CommanderItem[] = state.skills.map(s => ({
    label: s.name,
    detail: s.linked ? "linked" : s.available ? "available" : "missing",
    page: "skills",
    icon: "🔧",
    group: "Skills",
  }));

  const templateItems: CommanderItem[] = AGENT_TEMPLATES.map(t => ({
    label: t.name,
    detail: t.role,
    page: "team",
    icon: t.icon,
    group: "Templates",
  }));

  const all = [...pages, ...agentItems, ...templateItems, ...skillItems];
  if (!q) return all.slice(0, 15);
  return all.filter(i =>
    i.label.toLowerCase().includes(q) ||
    (i.detail || "").toLowerCase().includes(q) ||
    i.group.toLowerCase().includes(q),
  ).slice(0, 15);
}

export function renderCommanderResults(): void {
  const items = getCommanderItems(state.commanderQuery);
  const results = $("commanderResults");
  if (!results) return;

  if (!items.length) {
    results.innerHTML = '<div class="empty-state" style="padding:20px"><div class="empty-state-text">No results</div></div>';
    return;
  }

  let html = "";
  let lastGroup = "";
  items.forEach((item, i) => {
    if (item.group !== lastGroup) {
      lastGroup = item.group;
      html += `<div class="commander-group-label">${escHtml(item.group)}</div>`;
    }
    html += `
      <div class="commander-result ${i === state.commanderIndex ? "selected" : ""}" data-index="${i}" data-page="${item.page}">
        <div class="commander-result-icon">${item.icon}</div>
        <div class="commander-result-text">${escHtml(item.label)}</div>
        ${item.detail ? `<span class="commander-result-meta">${escHtml(item.detail)}</span>` : ""}
      </div>`;
  });
  results.innerHTML = html;
}

export function executeCommanderItem(index: number): void {
  const items = getCommanderItems(state.commanderQuery);
  const item = items[index];
  if (item) {
    closeCommander();
    navigate(item.page);
  }
}

export function initCommanderBindings(): void {
  const input = $("commanderInput") as HTMLInputElement;
  if (!input) return;

  input.addEventListener("input", () => {
    state.commanderQuery = input.value;
    state.commanderIndex = 0;
    renderCommanderResults();
  });

  input.addEventListener("keydown", (e) => {
    const items = getCommanderItems(state.commanderQuery);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      state.commanderIndex = Math.min(state.commanderIndex + 1, items.length - 1);
      renderCommanderResults();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      state.commanderIndex = Math.max(state.commanderIndex - 1, 0);
      renderCommanderResults();
    } else if (e.key === "Enter") {
      e.preventDefault();
      executeCommanderItem(state.commanderIndex);
    } else if (e.key === "Escape") {
      closeCommander();
    }
  });

  const results = $("commanderResults");
  if (results) {
    results.addEventListener("click", (e) => {
      const result = (e.target as HTMLElement).closest(".commander-result") as HTMLElement;
      if (result) executeCommanderItem(parseInt(result.dataset.index || "0", 10));
    });
  }
}
