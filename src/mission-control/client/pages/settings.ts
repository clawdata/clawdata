/**
 * Mission Control — Settings page.
 *
 * Allows users to configure:
 *  - OpenAI API key (used for Office conversations)
 *  - Conversation model selection
 */

import { escHtml } from "../utils.js";
import { setPageContent } from "../router.js";
import { API } from "../api.js";

// ── State ────────────────────────────────────────────────────────────

interface Settings {
  openaiKey: string;
  openaiKeySet: boolean;
  conversationModel: string;
}

let settings: Settings = { openaiKey: "", openaiKeySet: false, conversationModel: "gpt-4o-mini" };
let saving = false;
let saveStatus: "idle" | "saved" | "error" = "idle";
let loaded = false;

// ── Load / Save ──────────────────────────────────────────────────────

async function loadSettings(): Promise<void> {
  try {
    const res = await fetch(`${API}/api/settings`);
    if (res.ok) {
      const data = await res.json();
      settings = {
        openaiKey: "",  // never show actual key in input — just track if set
        openaiKeySet: data.openaiKeySet || false,
        conversationModel: data.conversationModel || "gpt-4o-mini",
      };
    }
    loaded = true;
  } catch {
    loaded = true;
  }
}

async function saveSettings(): Promise<void> {
  saving = true;
  saveStatus = "idle";
  renderSettingsPage();
  try {
    const res = await fetch(`${API}/api/settings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    if (!res.ok) throw new Error("Save failed");
    saveStatus = "saved";
  } catch {
    saveStatus = "error";
  }
  saving = false;
  renderSettingsPage();
  if (saveStatus === "saved") {
    setTimeout(() => { saveStatus = "idle"; renderSettingsPage(); }, 2500);
  }
}

// ── Render ───────────────────────────────────────────────────────────

export async function renderSettingsPage(): Promise<void> {
  if (!loaded) {
    await loadSettings();
  }

  const keyStatus = settings.openaiKeySet && !settings.openaiKey
    ? '<div class="settings-key-preview">✓ Key is configured (enter a new value to change)</div>'
    : "";

  setPageContent(`
    <div class="settings-page">
      <div class="page-title">Settings</div>
      <div class="page-subtitle">Configure Mission Control preferences</div>

      <div class="settings-section">
        <div class="settings-section-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          Office Conversations — AI Provider
        </div>
        <div class="settings-card">
          <div class="settings-field">
            <label class="settings-label">OpenAI API Key</label>
            <div class="settings-hint">Used for office agent conversations. When set, conversations use the OpenAI API directly. When empty, falls back to OpenClaw gateway.</div>
            <div class="settings-input-row">
              <input type="password" class="input settings-key-input" id="settingsOpenAIKey"
                     value="${escHtml(settings.openaiKey)}"
                     placeholder="${settings.openaiKeySet ? "••••••••••••••••" : "sk-..."}" autocomplete="off" />
              <button class="btn btn-sm btn-outline" id="settingsToggleKey" title="Show/hide key">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              </button>
            </div>
            ${keyStatus}
          </div>

          <div class="settings-field">
            <label class="settings-label">Model</label>
            <div class="settings-hint">OpenAI model to use for office conversations.</div>
            <select class="input settings-model-select" id="settingsModel">
              <option value="gpt-4o-mini" ${settings.conversationModel === "gpt-4o-mini" ? "selected" : ""}>gpt-4o-mini (fast & cheap)</option>
              <option value="gpt-4o" ${settings.conversationModel === "gpt-4o" ? "selected" : ""}>gpt-4o (capable)</option>
              <option value="gpt-4-turbo" ${settings.conversationModel === "gpt-4-turbo" ? "selected" : ""}>gpt-4-turbo</option>
              <option value="gpt-3.5-turbo" ${settings.conversationModel === "gpt-3.5-turbo" ? "selected" : ""}>gpt-3.5-turbo (cheapest)</option>
            </select>
          </div>

          <div class="settings-actions">
            <button class="btn btn-sm btn-accent" id="settingsSave" ${saving ? "disabled" : ""}>
              ${saving ? "Saving..." : "Save Settings"}
            </button>
            ${saveStatus === "saved" ? '<span class="settings-status settings-status-ok">✓ Saved</span>' : ""}
            ${saveStatus === "error" ? '<span class="settings-status settings-status-err">✕ Failed to save</span>' : ""}
          </div>
        </div>
      </div>

      <div class="settings-section">
        <div class="settings-section-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          About
        </div>
        <div class="settings-card">
          <div style="font-size:12px;color:var(--text-muted);line-height:1.6">
            <strong>Mission Control</strong> uses the OpenClaw gateway to manage agents and dispatch tasks.
            Adding an OpenAI API key here enables direct LLM calls for office conversations,
            providing richer and more natural agent interactions on the virtual floor plan.
            Without a key, conversations fall back to the OpenClaw CLI or simulated chat.
          </div>
        </div>
      </div>
    </div>
  `, bindSettingsEvents);
}

function bindSettingsEvents(): void {
  // Toggle key visibility
  const keyInput = document.getElementById("settingsOpenAIKey") as HTMLInputElement | null;
  document.getElementById("settingsToggleKey")?.addEventListener("click", () => {
    if (!keyInput) return;
    keyInput.type = keyInput.type === "password" ? "text" : "password";
  });

  // Track changes
  keyInput?.addEventListener("input", () => {
    settings.openaiKey = keyInput.value.trim();
  });

  const modelSelect = document.getElementById("settingsModel") as HTMLSelectElement | null;
  modelSelect?.addEventListener("change", () => {
    settings.conversationModel = modelSelect.value;
  });

  // Save
  document.getElementById("settingsSave")?.addEventListener("click", () => {
    saveSettings();
  });
}
