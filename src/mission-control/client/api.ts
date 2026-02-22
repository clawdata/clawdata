/**
 * Mission Control — API layer.
 *
 * All fetch calls to the Mission Control backend.
 */

import { state } from "./state.js";
import { renderNavbar, renderSidebarBadges } from "./navbar.js";
import { renderPage, debouncedRenderPage } from "./router.js";
import type { AgentConfig, AgentMemory, WorkspaceFile } from "./state.js";
import { AGENT_ROLES } from "./roles.js";

export const API = window.location.origin;

// ── Anti-flicker ─────────────────────────────────────────────────────

let _lastDashboardJSON = "";

// ── Dashboard ────────────────────────────────────────────────────────

export async function fetchDashboard(): Promise<void> {
  try {
    const res = await fetch(`${API}/api/dashboard`);
    if (!res.ok) throw new Error("API error");
    const data = await res.json();

    state.dashboard = data;
    state.agents = data.agents?.list || [];
    state.queue = data.queue?.items || [];
    state.feed = data.feed || [];
    state.gateway = data.gateway || "disconnected";
    state.gatewayHealth = data.gatewayHealth || null;
    state.presence = data.presence || [];
    state.usageCost = data.usageCost || [];

    const stableJson = JSON.stringify(data, (key, value) => {
      if (key === "lastSeen" || key === "tokenUsage" || key === "percentUsed" || key === "contextTokens") return undefined;
      return value;
    });

    renderNavbar();
    renderSidebarBadges();
    if (stableJson === _lastDashboardJSON) return;
    _lastDashboardJSON = stableJson;
    debouncedRenderPage();
  } catch (err) {
    console.error("Failed to fetch dashboard:", err);
    state.gateway = "disconnected";
    renderNavbar();
  }
}

// ── Skills ───────────────────────────────────────────────────────────

export async function fetchSkills(): Promise<void> {
  try {
    const res = await fetch(`${API}/api/skills`);
    if (!res.ok) return;
    const data = await res.json();
    state.skills = data.skills || [];
  } catch { /* silent */ }
}

// ── Agent Config ─────────────────────────────────────────────────────

export async function fetchAgentConfig(): Promise<void> {
  try {
    state.agentConfigLoading = true;
    const res = await fetch(`${API}/api/agents/config`);
    if (!res.ok) return;
    const data = await res.json();
    state.agentConfig = data.agents || [];
    state.agentConfigLoading = false;

    if (state.currentPage === "team") renderPage();
  } catch { state.agentConfigLoading = false; }
}

// ── Agent Management ─────────────────────────────────────────────────

export async function fetchSuggestedName(): Promise<string> {
  try {
    const res = await fetch(`${API}/api/agents/suggest-name`);
    if (!res.ok) return "";
    const data = await res.json();
    return data.name || "";
  } catch { return ""; }
}

export async function addAgent(name: string, model?: string, skills?: string[]): Promise<any> {
  const res = await fetch(`${API}/api/agents/add`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      model: model || undefined,
      skills: skills && skills.length ? skills : undefined,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to add agent");
  await fetchDashboard();
  await fetchAgentConfig();
  return data;
}

export async function saveAgentSkillsToServer(agentName: string, skills: string[]): Promise<boolean> {
  try {
    const res = await fetch(`${API}/api/agents/skills`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentName, skills }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function deleteAgent(name: string): Promise<any> {
  const res = await fetch(`${API}/api/agents/delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to delete agent");
  // Reconcile state from server
  await fetchDashboard();
  await fetchAgentConfig();
  return data;
}

export async function setAgentIdentity(
  agentName: string,
  opts: { identityName?: string; identityEmoji?: string; identityTheme?: string; identityAvatar?: string } = {},
): Promise<boolean> {
  try {
    const body: Record<string, string> = { agentName };
    if (opts.identityName !== undefined) body.identityName = opts.identityName;
    if (opts.identityEmoji !== undefined) body.identityEmoji = opts.identityEmoji;
    if (opts.identityTheme !== undefined) body.identityTheme = opts.identityTheme;
    if (opts.identityAvatar !== undefined) body.identityAvatar = opts.identityAvatar;
    const res = await fetch(`${API}/api/agents/set-identity`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error("set-identity failed");
    await fetchAgentConfig();
    return true;
  } catch (e) {
    console.error("setAgentIdentity error:", e);
    return false;
  }
}

export async function applyRoleToAgent(agentName: string, roleId: string): Promise<boolean> {
  const role = AGENT_ROLES.find(r => r.id === roleId);
  if (!role) return false;
  const ok = await setAgentIdentity(agentName, {
    identityTheme: role.theme,
    identityEmoji: role.icon,
  });
  if (ok) {
    const map = JSON.parse(localStorage.getItem("mc-agent-skills") || "{}");
    const existing: string[] = map[agentName] || [];
    const merged = [...new Set([...existing, ...role.skills])];
    map[agentName] = merged;
    localStorage.setItem("mc-agent-skills", JSON.stringify(map));
    // Sync merged skills to the gateway (source of truth)
    await saveAgentSkillsToServer(agentName, merged);
  }
  return ok;
}

// ── Memory ───────────────────────────────────────────────────────

export async function fetchMemory(): Promise<void> {
  try {
    state.memoryLoading = true;
    const res = await fetch(`${API}/api/memory`);
    if (!res.ok) return;
    const data = await res.json();
    state.memory = data.agents || [];
    state.memoryLoading = false;
    if (state.currentPage === "memory") renderPage();
  } catch { state.memoryLoading = false; }
}

export async function fetchMemoryFile(agent: string, filePath: string): Promise<string | null> {
  try {
    const res = await fetch(`${API}/api/memory/read/${encodeURIComponent(agent)}/${encodeURIComponent(filePath)}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.content || "";
  } catch { return null; }
}

export async function writeMemoryFile(agent: string, filePath: string, content: string): Promise<boolean> {
  try {
    const res = await fetch(`${API}/api/memory/write`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent, file: filePath, content }),
    });
    if (!res.ok) return false;
    await fetchMemory();
    return true;
  } catch { return false; }
}

// ── Agent Workspace Files ────────────────────────────────────────

export async function fetchAgentWorkspace(agentName: string): Promise<WorkspaceFile[]> {
  try {
    const res = await fetch(`${API}/api/agents/workspace/${encodeURIComponent(agentName)}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.files || [];
  } catch { return []; }
}

export async function writeAgentWorkspaceFile(agentName: string, fileName: string, content: string): Promise<boolean> {
  try {
    const res = await fetch(`${API}/api/agents/workspace/write`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent: agentName, file: fileName, content }),
    });
    if (!res.ok) return false;
    return true;
  } catch { return false; }
}

// ── Queue (user-created tasks) ───────────────────────────────────

export async function addQueueItem(opts: {
  title: string;
  description?: string;
  priority?: string;
  assignee?: string;
  tags?: string[];
}): Promise<any> {
  const res = await fetch(`${API}/api/queue/add`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opts),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to add task");
  await fetchDashboard();
  return data;
}

export async function assignQueueItem(id: string, assignee: string): Promise<any> {
  const res = await fetch(`${API}/api/queue/assign`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, assignee }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to assign task");
  await fetchDashboard();
  return data;
}

export async function updateQueueItem(id: string, updates: Record<string, any>): Promise<any> {
  const res = await fetch(`${API}/api/queue/update`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, ...updates }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to update task");
  await fetchDashboard();
  return data;
}

export async function deleteQueueItem(id: string): Promise<any> {
  const res = await fetch(`${API}/api/queue/delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to delete task");
  await fetchDashboard();
  return data;
}
