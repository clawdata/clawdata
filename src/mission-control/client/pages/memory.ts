/**
 * Mission Control — Memory page.
 *
 * Browse and edit agent memory files (MEMORY.md long-term + memory/YYYY-MM-DD.md daily notes).
 * Integrates with OpenClaw's memory system — these are the same files agents read/write.
 */

import { state } from "../state.js";
import { escHtml } from "../utils.js";
import { setPageContent } from "../router.js";
import { fetchMemory, fetchMemoryFile, writeMemoryFile } from "../api.js";
import type { AgentMemory, MemoryFile } from "../state.js";

// ── Helpers ──────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function renderMarkdown(md: string): string {
  // Minimal markdown: headers, bold, italic, code, lists, links
  return escHtml(md)
    .replace(/^### (.+)$/gm, '<h4 style="margin:12px 0 6px;font-size:13px;font-weight:600;color:var(--text)">$1</h4>')
    .replace(/^## (.+)$/gm, '<h3 style="margin:16px 0 8px;font-size:14px;font-weight:600;color:var(--text)">$1</h3>')
    .replace(/^# (.+)$/gm, '<h2 style="margin:18px 0 8px;font-size:16px;font-weight:700;color:var(--text)">$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code style="background:var(--bg-tertiary);padding:1px 4px;border-radius:3px;font-size:11px">$1</code>')
    .replace(/^- (.+)$/gm, '<div style="padding-left:12px;margin:2px 0">• $1</div>')
    .replace(/\n/g, '<br>');
}

// ── Render: Agent list (left panel) ──────────────────────────────

function renderAgentList(): string {
  const { memory, memorySelectedAgent } = state;

  if (!memory.length) {
    return `
      <div class="empty-state" style="padding:40px 20px">
        <div class="empty-state-icon">🧠</div>
        <div class="empty-state-text">No agent memory yet</div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:6px">
          Agents write memory as they work.<br>
          Add agents from the Team page to get started.
        </div>
      </div>`;
  }

  return memory.map(agent => {
    const isSelected = memorySelectedAgent === agent.name;
    const dailyCount = agent.files.filter(f => f.type === "daily").length;
    const hasLongTerm = agent.files.some(f => f.type === "long-term");
    return `
      <div class="memory-agent-item ${isSelected ? "selected" : ""}" onclick="window.__mc.selectMemoryAgent('${escHtml(agent.name)}')">
        <div style="display:flex;align-items:center;justify-content:space-between">
          <span class="memory-agent-name">${escHtml(agent.name)}</span>
          <span class="memory-agent-count">${agent.totalFiles} file${agent.totalFiles !== 1 ? "s" : ""}</span>
        </div>
        <div class="memory-agent-meta">
          ${hasLongTerm ? '<span class="memory-tag long-term">MEMORY.md</span>' : ""}
          ${dailyCount ? `<span class="memory-tag daily">${dailyCount} daily</span>` : ""}
          <span style="margin-left:auto;font-size:10px;color:var(--text-muted)">${formatBytes(agent.totalSize)}</span>
        </div>
      </div>`;
  }).join("");
}

// ── Render: File list (center panel) ─────────────────────────────

function renderFileList(): string {
  const agent = state.memory.find(a => a.name === state.memorySelectedAgent);
  if (!agent) {
    return `<div style="padding:30px;text-align:center;color:var(--text-muted);font-size:12px">
      Select an agent to view memory files
    </div>`;
  }

  if (!agent.files.length) {
    return `<div class="empty-state" style="padding:30px">
      <div class="empty-state-icon">📝</div>
      <div class="empty-state-text">No memory files yet</div>
      <div style="font-size:11px;color:var(--text-muted);margin-top:4px">
        This agent hasn't written any memory.
      </div>
    </div>`;
  }

  // Group: long-term first, then daily (newest first)
  const longTerm = agent.files.filter(f => f.type === "long-term");
  const daily = agent.files.filter(f => f.type === "daily");

  let html = "";

  if (longTerm.length) {
    html += '<div class="memory-file-section-label">Long-term Memory</div>';
    html += longTerm.map(f => renderFileItem(agent.name, f)).join("");
  }

  if (daily.length) {
    html += '<div class="memory-file-section-label">Daily Notes</div>';
    html += daily.map(f => renderFileItem(agent.name, f)).join("");
  }

  return html;
}

function renderFileItem(agentName: string, file: MemoryFile): string {
  const isSelected = state.memorySelectedFile === file.path && state.memorySelectedAgent === agentName;
  const icon = file.type === "long-term" ? "🧠" : "📅";
  return `
    <div class="memory-file-item ${isSelected ? "selected" : ""}" onclick="window.__mc.selectMemoryFile('${escHtml(agentName)}', '${escHtml(file.path)}')">
      <div style="display:flex;align-items:center;gap:6px">
        <span style="font-size:14px">${icon}</span>
        <span class="memory-file-name">${escHtml(file.name)}</span>
      </div>
      <div class="memory-file-meta">
        <span>${formatBytes(file.size)}</span>
        <span>·</span>
        <span>${timeAgo(file.modified)}</span>
      </div>
      ${file.preview ? `<div class="memory-file-preview">${escHtml(file.preview.slice(0, 80))}${file.preview.length > 80 ? "…" : ""}</div>` : ""}
    </div>`;
}

// ── Render: File content (right panel) ───────────────────────────

function renderFileContent(): string {
  if (!state.memorySelectedFile || !state.memorySelectedAgent) {
    return `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-muted);font-size:12px">
      Select a file to view its contents
    </div>`;
  }

  if (state.memoryFileContent === null) {
    return `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-muted)">
      <div class="loading-spinner"></div>
    </div>`;
  }

  const agent = state.memorySelectedAgent;
  const file = state.memorySelectedFile;
  const content = state.memoryFileContent;

  return `
    <div class="memory-content-header">
      <div>
        <div class="memory-content-title">${escHtml(file)}</div>
        <div class="memory-content-subtitle">${escHtml(agent)}</div>
      </div>
      <div style="display:flex;gap:6px">
        <button class="btn btn-sm btn-ghost" onclick="window.__mc.toggleMemoryEdit()" id="memoryEditBtn">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          Edit
        </button>
      </div>
    </div>
    <div class="memory-content-body" id="memoryContentBody">
      <div class="memory-rendered" id="memoryRendered">${renderMarkdown(content)}</div>
      <textarea class="memory-editor" id="memoryEditor" style="display:none" spellcheck="false">${escHtml(content)}</textarea>
    </div>
    <div class="memory-editor-actions" id="memoryEditorActions" style="display:none">
      <button class="btn btn-sm btn-primary" onclick="window.__mc.saveMemoryFile()">Save</button>
      <button class="btn btn-sm btn-ghost" onclick="window.__mc.cancelMemoryEdit()">Cancel</button>
    </div>`;
}

// ── Page renderer ────────────────────────────────────────────────

export function renderMemoryPage(): void {
  const totalFiles = state.memory.reduce((s, a) => s + a.totalFiles, 0);
  const totalAgents = state.memory.length;

  setPageContent(`
    <div class="page">
      <div class="page-header">
        <div>
          <div class="page-title">Memory</div>
          <div class="page-subtitle">
            ${totalAgents} agent${totalAgents !== 1 ? "s" : ""} · ${totalFiles} file${totalFiles !== 1 ? "s" : ""}
            <span style="color:var(--text-muted);font-size:11px;margin-left:8px">
              OpenClaw workspace memory — MEMORY.md (long-term) + daily notes
            </span>
          </div>
        </div>
        <button class="btn btn-sm btn-ghost" onclick="window.__mc.refreshMemory()">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
          Refresh
        </button>
      </div>

      ${state.memoryLoading && !state.memory.length
        ? '<div class="empty-state" style="margin-top:60px"><div class="loading-spinner"></div><div class="empty-state-text" style="margin-top:12px">Loading memory...</div></div>'
        : `
      <div class="memory-layout">
        <div class="memory-panel memory-agents-panel">
          <div class="memory-panel-header">Agents</div>
          <div class="memory-panel-body">${renderAgentList()}</div>
        </div>
        <div class="memory-panel memory-files-panel">
          <div class="memory-panel-header">Files</div>
          <div class="memory-panel-body">${renderFileList()}</div>
        </div>
        <div class="memory-panel memory-content-panel">
          <div class="memory-panel-header">Content</div>
          <div class="memory-panel-body">${renderFileContent()}</div>
        </div>
      </div>`}
    </div>
  `, () => {
    // onMount: fetch memory data if not loaded
    if (!state.memory.length && !state.memoryLoading) {
      fetchMemory();
    }
  });
}

// ── Handlers exposed on window.__mc ──────────────────────────────

export async function selectMemoryAgent(agentName: string): Promise<void> {
  state.memorySelectedAgent = agentName;
  state.memorySelectedFile = null;
  state.memoryFileContent = null;
  renderMemoryPage();
}

export async function selectMemoryFile(agentName: string, filePath: string): Promise<void> {
  state.memorySelectedAgent = agentName;
  state.memorySelectedFile = filePath;
  state.memoryFileContent = null;
  renderMemoryPage();

  const content = await fetchMemoryFile(agentName, filePath);
  state.memoryFileContent = content ?? "";
  renderMemoryPage();
}

export function toggleMemoryEdit(): void {
  const rendered = document.getElementById("memoryRendered");
  const editor = document.getElementById("memoryEditor") as HTMLTextAreaElement | null;
  const actions = document.getElementById("memoryEditorActions");
  const btn = document.getElementById("memoryEditBtn");

  if (!rendered || !editor || !actions) return;

  const isEditing = editor.style.display !== "none";
  if (isEditing) {
    // Switch back to view
    rendered.style.display = "";
    editor.style.display = "none";
    actions.style.display = "none";
    if (btn) btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> Edit`;
  } else {
    // Switch to edit
    rendered.style.display = "none";
    editor.style.display = "";
    editor.value = state.memoryFileContent || "";
    actions.style.display = "";
    if (btn) btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> View`;
    editor.focus();
  }
}

export function cancelMemoryEdit(): void {
  toggleMemoryEdit();
}

export async function saveMemoryFile(): Promise<void> {
  const editor = document.getElementById("memoryEditor") as HTMLTextAreaElement | null;
  if (!editor || !state.memorySelectedAgent || !state.memorySelectedFile) return;

  const content = editor.value;
  const ok = await writeMemoryFile(state.memorySelectedAgent, state.memorySelectedFile, content);
  if (ok) {
    state.memoryFileContent = content;
    // Switch back to view mode
    toggleMemoryEdit();
    renderMemoryPage();
  }
}

export async function refreshMemory(): Promise<void> {
  state.memorySelectedFile = null;
  state.memoryFileContent = null;
  await fetchMemory();
}
