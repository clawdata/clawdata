/**
 * Mission Control — Team / Agents page.
 *
 * Each agent card pulls configuration from their workspace files
 * (SOUL.md, USER.md, AGENTS.md, TOOLS.md) in userdata/agents/<name>/.
 * The Agent Config modal lets you view and edit these files directly.
 */

import { state } from "../state.js";
import { escHtml, agentColor, initials } from "../utils.js";
import { showConfirm as showConfirmDialog, showAlert as showAlertDialog } from "../modal.js";
import { setPageContent, renderPage } from "../router.js";
import { AGENT_ROLES } from "../roles.js";
// Skills come from gateway via server — no localStorage needed
import {
  addAgent,
  deleteAgent as apiDeleteAgent,
  fetchAgentConfig,
  setAgentIdentity,
  applyRoleToAgent,
  fetchAgentWorkspace,
  writeAgentWorkspaceFile,
  saveAgentSkillsToServer,
} from "../api.js";
import type { WorkspaceFile } from "../state.js";

// ─── Team Page ───────────────────────────────────────────────────────

export function renderTeamPage(): void {
  const liveAgents = state.agents;
  const activeSkillNames = state.skills.filter(s => s.linked).map(s => s.name);
  const cfgMap: Record<string, any> = {};
  (state.agentConfig || []).forEach((c: any) => { cfgMap[c.id] = c; });

  const enriched = liveAgents.map(a => {
    const cfg = cfgMap[a.name] || cfgMap[(a as any).id] || {};
    const identity = cfg.identityFull || {};
    const theme = cfg.identityTheme || identity.theme || "";
    const role = AGENT_ROLES.find(r => r.theme.toLowerCase() === theme.toLowerCase());
    // Name: gateway config is source of truth (server overrides identityName from gateway)
    const identName = cfg.identityName || identity.name || a.name;
    // Skills: gateway is source of truth. null/undefined = all enabled, array = allowlist.
    const agentSkills: string[] | null = cfg.skills ?? null;
    return {
      ...a,
      identName,
      identEmoji: cfg.identityEmoji || identity.emoji || "",
      theme,
      role,
      isDefault: cfg.isDefault || false,
      agentSkills,
      workspaceFiles: cfg.workspaceFiles || [],
      soulSummary: cfg.soulSummary || "",
    };
  });

  const leader = enriched.find(a => a.isDefault) || (enriched.length ? enriched[0] : null);
  const workers = enriched.filter(a => a !== leader);

  if (!state.agentConfig.length && !state.agentConfigLoading) fetchAgentConfig();

  setPageContent(`
    <div class="team-page">
      <div class="team-hero">
        <h1 class="team-hero-title">Meet the Team</h1>
        <p class="team-hero-sub">${enriched.length} agent${enriched.length !== 1 ? "s" : ""} active.</p>
        <p class="team-hero-blurb">
          Each agent has a workspace with SOUL.md, USER.md, and memory files.
          Click any card to configure identity, skills, and personality.
        </p>
      </div>

      ${leader ? `
      <div class="team-leader-wrap">
        <div class="team-leader-label">Chief of Staff</div>
        ${renderTeamCard(leader, activeSkillNames, true)}
      </div>
      ` : ""}

      ${workers.length || leader ? `
      <div class="team-divider">
        <span class="team-divider-label">&darr; AGENTS</span>
        <div class="team-divider-line"></div>
        <span class="team-divider-label">ROLES &darr;</span>
      </div>
      ` : ""}

      ${workers.length ? `
      <div class="team-cards-grid">
        ${workers.map(a => renderTeamCard(a, activeSkillNames, false)).join("")}
      </div>
      ` : ""}

      ${enriched.length === 0 ? `
      <div class="team-empty">
        <div class="team-empty-icon">🦞</div>
        <div class="team-empty-text">No live agents detected.</div>
        <div class="team-empty-sub">Start the OpenClaw Gateway or add an agent to get started.</div>
      </div>
      ` : ""}

      <div style="text-align:center;margin-top:20px">
        <button class="team-add-btn" onclick="window.__mc.showAddAgentModal()">+ Add Agent</button>
      </div>
    </div>
  `);
}

function renderTeamCard(agent: any, activeSkillNames: string[], isHero: boolean): string {
  const role = agent.role;
  const color = role ? role.color : agentColor(agent.identName);
  const skills: string[] = Array.isArray(agent.agentSkills) ? agent.agentSkills : [];
  const wsFiles: string[] = agent.workspaceFiles || [];
  const soulLine = agent.soulSummary || "";

  const desc = soulLine
    ? soulLine
    : role
      ? role.description
      : agent.theme ? agent.theme : "No configuration yet. Click to set up this agent.";

  return `
    <div class="team-card ${isHero ? "team-card--hero" : ""}" style="--tc:${color}">
      <div class="team-card-inner">
        <div class="team-card-avatar" style="background:${color}18;color:${color}">
          ${agent.identEmoji || (role ? role.icon : initials(agent.identName))}
          <span class="team-card-status team-card-status--${agent.status === "working" ? "working" : agent.status === "idle" ? "idle" : "offline"}"></span>
        </div>
        <div class="team-card-meta">
          <div class="team-card-name">${escHtml(agent.identName)}</div>
          <div class="team-card-role">${escHtml(isHero ? (agent.theme || "Chief of Staff") : (agent.theme || "Unassigned"))}</div>
        </div>
      </div>
      <div class="team-card-desc">${agent.currentTask ? `⚙️ Working on: ${escHtml(agent.currentTask)}` : escHtml(desc)}</div>
      ${skills.length ? `
      <div class="team-card-tags">
        ${skills.map(s => `<span class="team-tag ${activeSkillNames.includes(s) ? "team-tag--on" : ""}">${escHtml(s)}</span>`).join("")}
      </div>` : ""}
      ${wsFiles.length ? `
      <div class="team-card-files">
        ${wsFiles.map(f => `<span class="team-file-tag">${escHtml(f)}</span>`).join("")}
      </div>` : ""}
      <div class="team-card-foot">
        <a class="team-card-link" onclick="event.preventDefault();window.__mc.showAgentConfigModal('${escHtml(agent.name)}')" href="#">CONFIGURE &rarr;</a>
      </div>
    </div>`;
}

// ─── Add Agent Modal ─────────────────────────────────────────────────

export async function showAddAgentModal(): Promise<void> {
  const skillChecks = state.skills.map(s => {
    const label = s.emoji ? `${s.emoji} ${s.name}` : s.name;
    return `
      <label class="skill-checkbox" title="${escHtml(s.description || "")}">
        <input type="checkbox" value="${escHtml(s.name)}" />
        <span class="skill-check-label">${escHtml(label)}</span>
        ${s.linked && s.available ? '<span class="skill-check-ok">✓</span>' : '<span class="skill-check-na">—</span>'}
      </label>`;
  }).join("");

  const overlay = document.createElement("div");
  overlay.className = "commander-overlay open";
  overlay.id = "addAgentOverlay";
  overlay.innerHTML = `
    <div class="commander-modal" style="max-width:520px">
      <div style="padding:16px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">
        <span style="font-weight:600;font-size:14px">Add Agent</span>
        <button onclick="window.__mc.closeAddAgentModal()" style="background:none;border:none;color:var(--text-muted);font-size:18px;cursor:pointer">&times;</button>
      </div>
      <div style="padding:20px;display:flex;flex-direction:column;gap:14px;max-height:70vh;overflow-y:auto">
        <div>
          <label class="modal-label">AGENT NAME *</label>
          <input id="addAgentName" type="text" placeholder="e.g. scout, pipeline, analyst" class="modal-input" />
        </div>
        <div>
          <label class="modal-label">MODEL (optional)</label>
          <input id="addAgentModel" type="text" placeholder="e.g. openai/gpt-5.1-codex, claude-sonnet-4-5" class="modal-input" />
        </div>
        <div>
          <label class="modal-label">SKILLS</label>
          <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px">Select skills to assign to this agent</div>
          <div id="addAgentSkills" class="skill-checkbox-grid">
            ${skillChecks || '<div style="color:var(--text-muted);font-size:12px">No skills loaded</div>'}
          </div>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:4px">
          <button onclick="window.__mc.closeAddAgentModal()" class="btn" style="background:var(--bg-card);color:var(--text-secondary)">Cancel</button>
          <button onclick="window.__mc.submitAddAgent()" class="btn btn-approve" style="padding:8px 20px">Add Agent</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeAddAgentModal(); });
  setTimeout(() => document.getElementById("addAgentName")?.focus(), 100);
}

export function closeAddAgentModal(): void {
  document.getElementById("addAgentOverlay")?.remove();
}

export async function submitAddAgent(): Promise<void> {
  const name = (document.getElementById("addAgentName") as HTMLInputElement | null)?.value.trim();
  const model = (document.getElementById("addAgentModel") as HTMLInputElement | null)?.value.trim();
  const skillCheckboxes = document.querySelectorAll("#addAgentSkills input[type=checkbox]:checked") as NodeListOf<HTMLInputElement>;
  const selectedSkills = Array.from(skillCheckboxes).map(cb => cb.value);

  if (!name) { showAlertDialog({ message: "Agent name is required", variant: "warning" }); return; }
  if (!/^[a-zA-Z0-9 _-]+$/.test(name)) {
    showAlertDialog({ message: "Agent name must contain only letters, numbers, spaces, hyphens, and underscores", variant: "warning" });
    return;
  }
  const folderId = name.replace(/\s+/g, "_");
  if (state.agents.some(a => a.name === name || a.id === name || a.name === folderId || a.id === folderId)) {
    showAlertDialog({ message: `Agent "${name}" already exists`, variant: "warning" });
    return;
  }

  closeAddAgentModal();

  state.agents.push({
    id: name, name, status: "idle", model: model || undefined,
    role: undefined, agentSkills: selectedSkills,
  } as any);
  renderPage();

  try {
    await addAgent(name, model || "", selectedSkills);
  } catch (err: any) {
    state.agents = state.agents.filter(a => a.name !== name);
    renderPage();
    showAlertDialog({ title: "Add Agent Failed", message: String(err.message || err), variant: "error" });
  }
}

// ─── Agent Config Modal (replaces old Role Card) ─────────────────

const TABS = [
  { id: "identity", label: "Identity", icon: "\u{1F3AD}" },
  { id: "soul",     label: "Soul",     icon: "\u2728" },
  { id: "user",     label: "User",     icon: "\u{1F464}" },
  { id: "skills",   label: "Skills",   icon: "\u{1F527}" },
  { id: "files",    label: "Files",    icon: "\u{1F4C1}" },
] as const;

type TabId = typeof TABS[number]["id"];

let _configTab: TabId = "identity";
let _configFiles: WorkspaceFile[] = [];
let _configAgent = "";

export async function showAgentConfigModal(agentName: string): Promise<void> {
  _configAgent = agentName;
  _configTab = "identity";
  _configFiles = await fetchAgentWorkspace(agentName);
  renderAgentConfigModal();
}

function renderAgentConfigModal(): void {
  document.getElementById("agentConfigOverlay")?.remove();

  const agentName = _configAgent;
  const cfg: any = (state.agentConfig || []).find((c: any) => c.id === agentName) || {};
  const identity = cfg.identityFull || {};
  // Gateway config is source of truth (server overrides identityName from gateway)
  const curName = cfg.identityName || identity.name || agentName;
  const curEmoji = cfg.identityEmoji || identity.emoji || "";
  const curTheme = cfg.identityTheme || identity.theme || "";
  // Skills from gateway config only (source of truth). null = no restriction (all checked).
  const agentSkillsList: string[] = Array.isArray(cfg.skills) ? cfg.skills : [];

  const overlay = document.createElement("div");
  overlay.className = "commander-overlay open";
  overlay.id = "agentConfigOverlay";

  overlay.innerHTML = `
    <div class="agent-config-modal">
      <div class="agent-config-header">
        <div class="agent-config-header-left">
          <span class="agent-config-avatar" style="background:${agentColor(curName)}18;color:${agentColor(curName)}">${curEmoji || initials(curName)}</span>
          <div>
            <div class="agent-config-title">${escHtml(curName)}</div>
            <div class="agent-config-subtitle">${escHtml(curTheme || "Unconfigured agent")}</div>
          </div>
        </div>
        <button onclick="window.__mc.closeAgentConfigModal()" class="agent-config-close">&times;</button>
      </div>

      <div class="agent-config-tabs">
        ${TABS.map(t => `
          <button class="agent-config-tab ${_configTab === t.id ? "active" : ""}" onclick="window.__mc.switchConfigTab('${t.id}')">
            <span>${t.icon}</span> ${t.label}
          </button>
        `).join("")}
      </div>

      <div class="agent-config-body" id="agentConfigBody">
        ${renderConfigTabContent(agentName, cfg, curName, curEmoji, curTheme, agentSkillsList)}
      </div>

      <div class="agent-config-footer">
        ${agentName !== "main" && agentName !== "Main"
          ? `<button onclick="event.stopPropagation();window.__mc.closeAgentConfigModal();setTimeout(()=>window.__mc.handleDeleteAgent('${escHtml(agentName)}'),100)" class="rolecard-btn-delete">Delete Agent</button>`
          : "<span></span>"}
        <div style="display:flex;gap:8px">
          <button onclick="window.__mc.closeAgentConfigModal()" class="rolecard-btn-cancel">Cancel</button>
          <button onclick="window.__mc.saveAgentConfig('${escHtml(agentName)}')" class="rolecard-btn-save" id="agent-config-save">Save</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeAgentConfigModal(); });
}

function renderConfigTabContent(agentName: string, cfg: any, curName: string, curEmoji: string, curTheme: string, agentSkillsList: string[]): string {
  switch (_configTab) {
    case "identity":
      return renderIdentityTab(agentName, curName, curEmoji, curTheme);
    case "soul":
      return renderFileTab("SOUL.md", "Define who this agent is \u2014 personality, values, and working style.");
    case "user":
      return renderFileTab("USER.md", "Information about the human this agent helps \u2014 built over time.");
    case "skills":
      return renderSkillsTab(agentName, agentSkillsList, cfg.skills === null || cfg.skills === undefined);
    case "files":
      return renderFilesTab();
    default:
      return "";
  }
}

function renderIdentityTab(_agentName: string, curName: string, curEmoji: string, curTheme: string): string {
  return `
    <div class="agent-config-section">
      <div class="rolecard-section-label">Identity</div>
      <div class="rolecard-row">
        <div class="rolecard-field" style="flex:0 0 70px">
          <label class="rolecard-label">Emoji</label>
          <input id="rc-emoji" class="rolecard-input" type="text" value="${escHtml(curEmoji)}" placeholder="\u{1F99E}" />
        </div>
        <div class="rolecard-field" style="flex:1">
          <label class="rolecard-label">Display Name</label>
          <input id="rc-name" class="rolecard-input" type="text" value="${escHtml(curName)}" placeholder="Agent name" />
        </div>
      </div>
      <div class="rolecard-field">
        <label class="rolecard-label">Theme / Role</label>
        <input id="rc-theme" class="rolecard-input" type="text" value="${escHtml(curTheme)}" placeholder="e.g. Data Quality, Orchestration" />
      </div>
    </div>

    <div class="agent-config-section">
      <div class="rolecard-section-label">Quick Roles</div>
      <div class="rolecard-presets" id="rc-presets">
        ${AGENT_ROLES.map(r => {
          const isActive = r.theme.toLowerCase() === curTheme.toLowerCase();
          return `<button class="rolecard-preset ${isActive ? "active" : ""}" data-role-id="${r.id}" onclick="window.__mc.selectRolePreset('${r.id}')" style="--rc:${r.color}">
            <span class="rolecard-preset-icon">${r.icon}</span>
            <span class="rolecard-preset-name">${escHtml(r.name)}</span>
          </button>`;
        }).join("")}
      </div>
    </div>

    <div class="agent-config-hint">
      Uses <code>openclaw agents set-identity</code> to persist identity to IDENTITY.md
    </div>`;
}

function renderFileTab(fileName: string, description: string): string {
  const file = _configFiles.find(f => f.name === fileName);
  const content = file ? file.content : "";
  const modified = file ? new Date(file.modified).toLocaleString() : "";

  return `
    <div class="agent-config-section">
      <div class="rolecard-section-label">${escHtml(fileName)}</div>
      <div style="font-size:11px;color:var(--text-muted);margin-bottom:8px">
        ${escHtml(description)}
        ${modified ? ` \u00B7 Last modified: ${escHtml(modified)}` : ""}
      </div>
      <textarea id="agent-file-editor" class="agent-file-editor" spellcheck="false" data-filename="${escHtml(fileName)}">${escHtml(content)}</textarea>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button onclick="window.__mc.saveAgentFile('${escHtml(_configAgent)}', '${escHtml(fileName)}')" class="btn btn-sm btn-primary">Save ${escHtml(fileName)}</button>
        <span id="agent-file-status" style="font-size:11px;color:var(--text-muted);line-height:28px"></span>
      </div>
    </div>`;
}

function renderSkillsTab(agentName: string, agentSkillsList: string[], allEnabled: boolean): string {
  // Resolve display name from agentConfig (prefer identity name over raw ID)
  const cfg: any = (state.agentConfig || []).find((c: any) => c.id === agentName) || {};
  const displayName = cfg.identityName || cfg.identityFull?.name || agentName;

  return `
    <div class="agent-config-section">
      <div class="rolecard-section-label">Agent Skills</div>
      <div style="font-size:11px;color:var(--text-muted);margin-bottom:8px">
        Select data skills to assign to <strong>${escHtml(displayName)}</strong>. Skills determine what tools and integrations this agent can use.
      </div>
      ${allEnabled ? `<div style="font-size:11px;color:var(--accent-orange);margin-bottom:8px;padding:6px 10px;background:color-mix(in srgb, var(--accent-orange) 8%, transparent);border-radius:6px;border:1px solid color-mix(in srgb, var(--accent-orange) 20%, transparent)">
        \u{1F513} All skills are currently enabled (no restriction). Uncheck skills to limit this agent.
      </div>` : ""}
      <div class="rolecard-skills" id="rc-skills">
        ${state.skills.map(s => {
          const checked = allEnabled ? "checked" : agentSkillsList.includes(s.name) ? "checked" : "";
          const label = s.emoji ? `${s.emoji} ${s.name}` : s.name;
          return `<label class="rolecard-skill-check" title="${escHtml(s.description || "")}">
            <input type="checkbox" value="${escHtml(s.name)}" ${checked} />
            <span>${escHtml(label)}</span>
            ${s.linked && s.available ? '<span style="color:var(--accent-green);font-size:10px">\u2713</span>' : ''}
          </label>`;
        }).join("")}
      </div>
    </div>`;
}

function renderFilesTab(): string {
  if (!_configFiles.length) {
    return `
      <div class="empty-state" style="padding:40px">
        <div class="empty-state-icon">\u{1F4C2}</div>
        <div class="empty-state-text">No workspace files found</div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:4px">
          Files are created when the agent is first configured.
        </div>
      </div>`;
  }

  return `
    <div class="agent-config-section">
      <div class="rolecard-section-label">Workspace Files</div>
      <div style="font-size:11px;color:var(--text-muted);margin-bottom:10px">
        All markdown files in <code>userdata/agents/${escHtml(_configAgent)}/</code>. Click to edit.
      </div>
      <div class="agent-files-list">
        ${_configFiles.map(f => {
          const icon = f.name === "SOUL.md" ? "\u2728" : f.name === "USER.md" ? "\u{1F464}" : f.name === "MEMORY.md" ? "\u{1F9E0}" : f.name === "AGENTS.md" ? "\u{1F4CB}" : f.name === "IDENTITY.md" ? "\u{1F3AD}" : f.name === "TOOLS.md" ? "\u{1F527}" : "\u{1F4C4}";
          const preview = f.content.split("\\n").filter((l: string) => l.trim() && !l.startsWith("#"))[0]?.trim().slice(0, 80) || "";
          return `
            <div class="agent-file-row" onclick="window.__mc.editAgentFile('${escHtml(f.name)}')">
              <span class="agent-file-icon">${icon}</span>
              <div class="agent-file-info">
                <span class="agent-file-name">${escHtml(f.name)}</span>
                ${preview ? `<span class="agent-file-preview">${escHtml(preview)}</span>` : ""}
              </div>
              <span class="agent-file-size">${f.size < 1024 ? f.size + " B" : (f.size / 1024).toFixed(1) + " KB"}</span>
            </div>`;
        }).join("")}
      </div>
    </div>`;
}

// ─── Config Modal Handlers ───────────────────────────────────────────

export function closeAgentConfigModal(): void {
  document.getElementById("agentConfigOverlay")?.remove();
}

export function switchConfigTab(tabId: string): void {
  _configTab = tabId as TabId;
  renderAgentConfigModal();
}

export function editAgentFile(fileName: string): void {
  if (fileName === "SOUL.md") _configTab = "soul";
  else if (fileName === "USER.md") _configTab = "user";
  else {
    _configTab = "files";
    renderAgentConfigModal();
    setTimeout(() => {
      const file = _configFiles.find(f => f.name === fileName);
      if (!file) return;
      const body = document.getElementById("agentConfigBody");
      if (!body) return;
      body.innerHTML = `
        <div class="agent-config-section">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
            <div class="rolecard-section-label" style="margin:0">${escHtml(fileName)}</div>
            <button onclick="window.__mc.switchConfigTab('files')" class="btn btn-sm btn-ghost">\u2190 Back</button>
          </div>
          <textarea id="agent-file-editor" class="agent-file-editor" spellcheck="false" data-filename="${escHtml(fileName)}">${escHtml(file.content)}</textarea>
          <div style="display:flex;gap:8px;margin-top:8px">
            <button onclick="window.__mc.saveAgentFile('${escHtml(_configAgent)}', '${escHtml(fileName)}')" class="btn btn-sm btn-primary">Save</button>
            <span id="agent-file-status" style="font-size:11px;color:var(--text-muted);line-height:28px"></span>
          </div>
        </div>`;
    }, 10);
    return;
  }
  renderAgentConfigModal();
}

export async function saveAgentFile(agentName: string, fileName: string): Promise<void> {
  const editor = document.getElementById("agent-file-editor") as HTMLTextAreaElement | null;
  const statusEl = document.getElementById("agent-file-status");
  if (!editor) return;

  const content = editor.value;
  if (statusEl) statusEl.textContent = "Saving\u2026";

  const ok = await writeAgentWorkspaceFile(agentName, fileName, content);
  if (ok) {
    const idx = _configFiles.findIndex(f => f.name === fileName);
    if (idx >= 0) {
      _configFiles[idx] = { ..._configFiles[idx], content, size: content.length, modified: new Date().toISOString() };
    } else {
      _configFiles.push({ name: fileName, content, size: content.length, modified: new Date().toISOString() });
    }
    if (statusEl) { statusEl.textContent = "\u2713 Saved"; setTimeout(() => { if (statusEl) statusEl.textContent = ""; }, 2000); }
    fetchAgentConfig();
  } else {
    if (statusEl) statusEl.textContent = "\u2717 Failed";
  }
}

export async function saveAgentConfig(agentName: string): Promise<void> {
  const btn = document.getElementById("agent-config-save") as HTMLButtonElement | null;
  if (btn) { btn.textContent = "Saving\u2026"; btn.disabled = true; }

  if (_configTab === "identity") {
    const nameVal = (document.getElementById("rc-name") as HTMLInputElement | null)?.value.trim();
    const emojiVal = (document.getElementById("rc-emoji") as HTMLInputElement | null)?.value.trim();
    const themeVal = (document.getElementById("rc-theme") as HTMLInputElement | null)?.value.trim();

    await setAgentIdentity(agentName, {
      identityName: nameVal || undefined,
      identityEmoji: emojiVal || undefined,
      identityTheme: themeVal || undefined,
    });
  }

  if (_configTab === "skills") {
    const allCheckboxes = document.querySelectorAll("#rc-skills input[type=checkbox]") as NodeListOf<HTMLInputElement>;
    const checkboxes = document.querySelectorAll("#rc-skills input[type=checkbox]:checked") as NodeListOf<HTMLInputElement>;
    const selected = Array.from(checkboxes).map(cb => cb.value);
    // If all skills are checked, send empty array → "no restriction" (skills: null)
    const skillsToSave = selected.length === allCheckboxes.length ? [] : selected;
    // Write to gateway (source of truth), then re-sync
    const ok = await saveAgentSkillsToServer(agentName, skillsToSave);
    if (btn) { btn.textContent = ok ? "Saved \u2713" : "Error"; }
    // Brief visual feedback before closing
    await new Promise(r => setTimeout(r, 600));
    await fetchAgentConfig();
  }

  if (_configTab === "soul" || _configTab === "user") {
    const editor = document.getElementById("agent-file-editor") as HTMLTextAreaElement | null;
    if (editor) {
      const fileName = editor.dataset.filename || "";
      if (fileName) await writeAgentWorkspaceFile(agentName, fileName, editor.value);
    }
  }

  closeAgentConfigModal();
  renderPage();
}

export function selectRolePreset(roleId: string): void {
  const role = AGENT_ROLES.find(r => r.id === roleId);
  if (!role) return;
  const emojiEl = document.getElementById("rc-emoji") as HTMLInputElement | null;
  const themeEl = document.getElementById("rc-theme") as HTMLInputElement | null;
  if (emojiEl) emojiEl.value = role.icon;
  if (themeEl) themeEl.value = role.theme;
  document.querySelectorAll(".rolecard-preset").forEach(el => {
    el.classList.toggle("active", (el as HTMLElement).dataset.roleId === roleId);
  });
  const checkboxes = document.querySelectorAll("#rc-skills input[type=checkbox]") as NodeListOf<HTMLInputElement>;
  checkboxes.forEach(cb => {
    if (role.skills.includes(cb.value)) cb.checked = true;
  });
}

// ─── Delete Agent ────────────────────────────────────────────────

export async function handleDeleteAgent(name: string): Promise<void> {
  const confirmed = await showConfirmDialog({
    title: "Delete Agent",
    message: `Delete agent "${name}" and all workspace files? This cannot be undone.`,
    confirmLabel: "Delete",
    cancelLabel: "Cancel",
    destructive: true,
  });
  if (!confirmed) return;

  state.agents = state.agents.filter(a => a.name !== name);
  state.agentConfig = state.agentConfig.filter((c: any) => c.id !== name);
  renderPage();

  try {
    await apiDeleteAgent(name);
  } catch (err: any) {
    showAlertDialog({ title: "Delete Agent Failed", message: String(err.message || err), variant: "error" });
  }
}

// ─── Legacy exports (keep for compatibility) ─────────────────────

export function showRoleCardModal(agentName: string): void { showAgentConfigModal(agentName); }
export function closeRoleCardModal(): void { closeAgentConfigModal(); }
export function submitRoleCard(agentName: string): Promise<void> { return saveAgentConfig(agentName); }
export function showManageSkillsModal(agentName: string): void { _configTab = "skills"; showAgentConfigModal(agentName); }
export function closeManageSkillsModal(): void { closeAgentConfigModal(); }
export async function submitManageSkills(agentName: string): Promise<void> {
  const allCheckboxes = document.querySelectorAll("#rc-skills input[type=checkbox]") as NodeListOf<HTMLInputElement>;
  const checkboxes = document.querySelectorAll("#rc-skills input[type=checkbox]:checked") as NodeListOf<HTMLInputElement>;
  const selected = Array.from(checkboxes).map(cb => cb.value);
  // If all skills are checked, send empty array → "no restriction" (skills: null)
  const skillsToSave = selected.length === allCheckboxes.length ? [] : selected;
  await saveAgentSkillsToServer(agentName, skillsToSave);
  await fetchAgentConfig();
  closeAgentConfigModal();
  if (state.currentPage === "team" || state.currentPage === "dashboard") renderPage();
}
export function toggleAgentDetail(_agentName: string): void { /* noop */ }
export async function handleApplyRole(roleId: string): Promise<void> {
  const select = document.getElementById(`role-apply-${roleId}`) as HTMLSelectElement | null;
  if (!select) return;
  const agentName = select.value;
  if (!agentName) return;
  const btn = select.nextElementSibling as HTMLButtonElement | null;
  if (btn) { btn.textContent = "Applying\u2026"; btn.disabled = true; }
  const ok = await applyRoleToAgent(agentName, roleId);
  if (ok) {
    select.value = "";
    if (btn) { btn.textContent = "Applied \u2713"; setTimeout(() => { btn.textContent = "Apply"; btn.disabled = false; }, 1500); }
  } else {
    if (btn) { btn.textContent = "Error"; btn.disabled = false; }
  }
}
export async function deployTemplate(tmpl: any): Promise<void> {
  try { await addAgent(tmpl.id, tmpl.model, tmpl.skills || []); } catch { /* alert shown */ }
}
