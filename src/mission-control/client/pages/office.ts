/**
 * Mission Control — Office page.
 *
 * A quirky virtual office floor plan where agents sit at desks.
 * Users can:
 *  - Select / customise floor plans (with configurable seat positions)
 *  - Drag agents onto seats
 *  - Click "Conversations" to have agents converse based on their SOUL.md
 *  - Speech bubbles appear on-floor next to agents, truncated & clickable
 */

import { state } from "../state.js";
import { escHtml, agentColor, initials } from "../utils.js";
import { setPageContent } from "../router.js";
import { API } from "../api.js";
import { ModalInstance } from "../modal.js";

// ── Types ────────────────────────────────────────────────────────────

interface Seat {
  id: string;
  x: number;  // % from left
  y: number;  // % from top
  label?: string;
}

interface FloorPlan {
  id: string;
  name: string;
  image: string;  // URL or data-URI
  seats: Seat[];
}

interface SeatAssignment {
  [seatId: string]: string; // seatId → agentName
}

interface ChatMessage {
  from: string;
  emoji: string;
  text: string;
  timestamp: string;
}

// ── Persistence (server-backed, file: media/floorplans/office-config.json) ───

let serverConfigLoaded = false;
let availableImages: string[] = [];

function defaultPlans(): FloorPlan[] {
  return [
    {
      id: "open-office",
      name: "Open Office",
      image: "",
      seats: [
        { id: "s1", x: 12, y: 25, label: "Desk A1" },
        { id: "s2", x: 32, y: 25, label: "Desk A2" },
        { id: "s3", x: 52, y: 25, label: "Desk A3" },
        { id: "s4", x: 72, y: 25, label: "Desk A4" },
        { id: "s5", x: 12, y: 55, label: "Desk B1" },
        { id: "s6", x: 32, y: 55, label: "Desk B2" },
        { id: "s7", x: 52, y: 55, label: "Desk B3" },
        { id: "s8", x: 72, y: 55, label: "Desk B4" },
        { id: "s9", x: 42, y: 82, label: "Lounge" },
      ],
    },
    {
      id: "startup-loft",
      name: "Startup Loft",
      image: "",
      seats: [
        { id: "s1", x: 15, y: 20, label: "Standing A" },
        { id: "s2", x: 45, y: 20, label: "Standing B" },
        { id: "s3", x: 75, y: 20, label: "Standing C" },
        { id: "s4", x: 25, y: 50, label: "Pod 1" },
        { id: "s5", x: 60, y: 50, label: "Pod 2" },
        { id: "s6", x: 42, y: 80, label: "Bean Bags" },
      ],
    },
    {
      id: "corner-office",
      name: "Corner Office",
      image: "",
      seats: [
        { id: "s1", x: 50, y: 18, label: "Executive" },
        { id: "s2", x: 20, y: 45, label: "Left Wing" },
        { id: "s3", x: 80, y: 45, label: "Right Wing" },
        { id: "s4", x: 30, y: 75, label: "Bullpen 1" },
        { id: "s5", x: 50, y: 75, label: "Bullpen 2" },
        { id: "s6", x: 70, y: 75, label: "Bullpen 3" },
      ],
    },
  ];
}

// ── State ────────────────────────────────────────────────────────────

let plans: FloorPlan[] = [];
let activePlanId = "";
let assignments: Record<string, SeatAssignment> = {}; // planId → { seatId → agentName }
let chatMessages: ChatMessage[] = [];
let chatLoading = false;
let dragAgent: string | null = null;
let addingSeat = false;

// Speech bubbles shown on the floor next to agents
let seatBubbles: Record<string, ChatMessage> = {};  // agentName → current bubble
let chatAnimTimer: ReturnType<typeof setTimeout> | null = null;

// Conversation mode: always on — bubbles always show
let conversing = true;

// Chat drawer open state (persisted in memory; independent of conversing)
let chatDrawerOpen = false;

// Settings dialog open
let settingsDialogOpen = false;

// ── Load / Save ──────────────────────────────────────────────────────

function loadState(): void {
  // Synchronous part: use cached data if already loaded from server
  if (serverConfigLoaded) return;
  // On first load, trigger async fetch (page will re-render when ready)
  loadStateFromServer();
}

async function loadStateFromServer(): Promise<void> {
  try {
    const [configRes, imgRes] = await Promise.all([
      fetch(`${API}/api/office/floorplans`),
      fetch(`${API}/api/office/floorplan-images`),
    ]);
    const config = await configRes.json();
    const imgData = await imgRes.json();
    availableImages = imgData.images || [];
    plans = config.plans || [];
    if (!plans.length) plans = defaultPlans();
    activePlanId = config.activePlanId || plans[0]?.id || "";
    assignments = config.assignments || {};
    serverConfigLoaded = true;
    renderOfficePage();
  } catch {
    // Fallback to defaults if server unavailable
    plans = defaultPlans();
    activePlanId = plans[0]?.id || "";
    assignments = {};
    serverConfigLoaded = true;
    renderOfficePage();
  }
}

function saveState(): void {
  // Fire-and-forget save to server
  const config = { plans, activePlanId, assignments };
  fetch(`${API}/api/office/floorplans`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  }).catch(() => {});
}

function activePlan(): FloorPlan | undefined {
  return plans.find(p => p.id === activePlanId) || plans[0];
}

function currentAssignments(): SeatAssignment {
  const plan = activePlan();
  if (!plan) return {};
  if (!assignments[plan.id]) assignments[plan.id] = {};
  return assignments[plan.id];
}

// ── Agent enrichment ─────────────────────────────────────────────────

function enrichedAgents() {
  const cfgMap: Record<string, any> = {};
  (state.agentConfig || []).forEach((c: any) => { cfgMap[c.id] = c; });
  return state.agents.map(a => {
    const cfg = cfgMap[a.name] || cfgMap[(a as any).id] || {};
    const identity = cfg.identityFull || {};
    return {
      ...a,
      identName: cfg.identityName || identity.name || a.name,
      identEmoji: cfg.identityEmoji || identity.emoji || "",
      soulSummary: cfg.soulSummary || "",
    };
  });
}

function assignedAgentNames(): Set<string> {
  const ca = currentAssignments();
  return new Set(Object.values(ca));
}

// ── Render ───────────────────────────────────────────────────────────

export function renderOfficePage(): void {
  loadState();
  const plan = activePlan();
  const agents = enrichedAgents();
  const seated = assignedAgentNames();

  const iconSettings = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>`;
  const iconChat = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;
  const iconCollapse = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="7 13 12 18 17 13"/><polyline points="7 6 12 11 17 6"/></svg>`;
  const iconSend = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`;

  setPageContent(`
    <div class="office-canvas">
      <!-- Full-page floor plan -->
      <div class="office-floor" id="officeFloor" style="${plan?.image ? `background-image:url(${plan.image});background-size:contain;background-repeat:no-repeat;background-position:center center;` : ""}">
        ${renderFloorGrid(plan)}
        ${plan ? renderSeats(plan, agents) : '<div class="office-empty">No floor plan selected</div>'}
      </div>

      ${chatDrawerOpen ? `
      <!-- Expanded panel: agents + conversations -->
      <div class="office-panel-expanded" id="officePanel">
        <div class="office-panel-header">
          <span class="office-chat-title">Conversations</span>
          <div class="office-panel-actions">
            <button class="office-panel-icon-btn" id="officeSettingsBtn" title="Settings">${iconSettings}</button>
            <button class="office-panel-icon-btn" id="officePanelCollapse" title="Collapse">${iconCollapse}</button>
          </div>
        </div>
        <div class="office-panel-agents" id="officeAgentPool">
          ${agents.map(a => renderPoolAgent(a, seated.has(a.name))).join("")}
          ${agents.length === 0 ? '<div class="office-pool-empty">No agents</div>' : ""}
        </div>
        <div class="office-chat-messages" id="officeChatMessages">
          ${chatMessages.length ? chatMessages.map(m => renderChatBubble(m)).join("") : '<div class="office-chat-empty">Type a message to chat with your agents</div>'}
          ${chatLoading ? '<div class="office-chat-loading"><span class="office-typing">Agents are chatting…</span></div>' : ""}
        </div>
        <div class="office-chat-input-bar">
          <input type="text" class="office-chat-input" id="officeChatInput" placeholder="" autocomplete="off" />
          <button class="office-chat-send" id="officeChatSend" title="Send">${iconSend}</button>
        </div>
      </div>
      ` : `
      <!-- Collapsed: agent pool with toolbar -->
      <div class="office-fab-agents" id="officeAgentFab">
        <div class="office-fab-agents-header">
          <div class="office-fab-agents-title">Agents</div>
          <div class="office-fab-agents-actions">
            <button class="office-panel-icon-btn" id="officeSettingsBtn" title="Settings">${iconSettings}</button>
            <button class="office-panel-icon-btn" id="officeChatExpand" title="Open conversations">${iconChat}</button>
          </div>
        </div>
        <div class="office-pool-list" id="officeAgentPool">
          ${agents.map(a => renderPoolAgent(a, seated.has(a.name))).join("")}
          ${agents.length === 0 ? '<div class="office-pool-empty">No agents</div>' : ""}
        </div>
      </div>
      <div style="display:none"><div id="officeChatMessages"></div></div>
      `}

      <!-- Settings dialog -->
      ${settingsDialogOpen ? renderSettingsDialog() : ""}


    </div>
  `, bindOfficeEvents);
}

// ── Sub-renderers ────────────────────────────────────────────────────

function renderFloorGrid(plan: FloorPlan | undefined): string {
  if (!plan || plan.image) return "";
  return `<div class="office-grid-bg"></div>`;
}

function renderSeats(plan: FloorPlan, agents: any[]): string {
  const ca = currentAssignments();
  return plan.seats.map(seat => {
    const agentName = ca[seat.id];
    const agent = agentName ? agents.find(a => a.name === agentName) : null;
    const color = agent ? agentColor(agent.name) : "var(--border)";
    const ini = agent ? (agent.identEmoji || initials(agent.identName || agent.name)) : "";
    const bubble = agent && seatBubbles[agent.name] ? seatBubbles[agent.name] : null;
    // Alternate bubble direction: seats on the left half go right, right half go left
    const bubbleDir = seat.x < 50 ? "right" : "left";
    const bubbleText = bubble ? bubble.text : "";
    const truncated = bubbleText.length > 60 ? bubbleText.slice(0, 57) + "..." : bubbleText;
    const needsExpand = bubbleText.length > 60;
    return `
      <div class="office-seat ${agent ? "occupied" : "empty"}"
           style="left:${seat.x}%;top:${seat.y}%"
           data-seat-id="${seat.id}"
           title="${escHtml(seat.label || seat.id)}${agent ? " — " + escHtml(agent.identName || agent.name) : ""}">
        ${bubble ? `
        <div class="office-speech-bubble office-speech-${bubbleDir} ${needsExpand ? "office-speech-clickable" : ""}"
             style="border-color:${color}"
             ${needsExpand ? `data-bubble-from="${escHtml(bubble.from)}" data-bubble-full="${escHtml(bubbleText)}"` : ""}>
          <div class="office-speech-text">${escHtml(truncated)}</div>
          ${needsExpand ? '<div class="office-speech-more">click to read more</div>' : ""}
          <div class="office-speech-tail office-speech-tail-${bubbleDir}" style="border-top-color:${color}"></div>
        </div>
        ` : ""}
        <div class="office-seat-circle" style="border-color:${color};${agent ? `background:${color}22` : ""}">
          ${agent ? `<span class="office-seat-agent">${escHtml(ini)}</span>` : `<span class="office-seat-plus">+</span>`}
        </div>
        ${agent ? `<div class="office-seat-name">${escHtml(agent.identName || agent.name)}</div>` : ""}
        <div class="office-seat-label">${escHtml(seat.label || seat.id)}</div>
        ${agent ? `<button class="office-seat-remove" data-unseat="${seat.id}" title="Remove">×</button>` : ""}
      </div>
    `;
  }).join("");
}

function renderPoolAgent(agent: any, isSeated: boolean): string {
  const color = agentColor(agent.name);
  const emoji = agent.identEmoji || initials(agent.identName || agent.name);
  return `
    <div class="office-pool-agent ${isSeated ? "seated" : ""}"
         draggable="${isSeated ? "false" : "true"}"
         data-agent-name="${escHtml(agent.name)}"
         title="${escHtml(agent.identName || agent.name)}${agent.soulSummary ? "\n" + agent.soulSummary : ""}">
      <div class="office-pool-avatar" style="background:${color}22;border-color:${color}">
        ${escHtml(emoji)}
      </div>
      <div class="office-pool-info">
        <div class="office-pool-name">${escHtml(agent.identName || agent.name)}</div>
        <div class="office-pool-status" style="color:${agent.status === "working" ? "var(--accent-green)" : "var(--text-muted)"}">
          ${agent.status === "working" ? "● active" : "○ idle"}
        </div>
      </div>
      ${isSeated ? '<span class="office-pool-seated-badge">seated</span>' : ""}
    </div>
  `;
}

function renderChatBubble(msg: ChatMessage): string {
  const color = agentColor(msg.from);
  return `
    <div class="office-chat-bubble">
      <div class="office-chat-avatar" style="background:${color}22;border-color:${color}">${escHtml(msg.emoji)}</div>
      <div class="office-chat-content">
        <div class="office-chat-sender" style="color:${color}">${escHtml(msg.from)}</div>
        <div class="office-chat-text">${escHtml(msg.text)}</div>
      </div>
    </div>
  `;
}

function renderSettingsDialog(): string {
  const plan = activePlan();
  return `
    <div class="office-settings-overlay" id="officeSettingsOverlay">
      <div class="office-settings-dialog office-settings-wide">
        <div class="office-settings-header">
          <h3>Floor Plans</h3>
          <button class="office-settings-close" id="officeSettingsClose">&times;</button>
        </div>
        <div class="office-settings-body">
          <!-- Plan list -->
          <div class="office-settings-plan-list">
            ${plans.map(p => `
              <div class="office-settings-plan-item ${p.id === activePlanId ? "active" : ""}" data-plan-id="${escHtml(p.id)}">
                <div class="office-settings-plan-thumb" style="${p.image ? `background-image:url(${p.image});background-size:cover;background-position:center;` : "background:var(--bg-surface);"}">
                  ${p.image ? "" : '<span style="font-size:18px;opacity:0.3">⊞</span>'}
                </div>
                <div class="office-settings-plan-info">
                  <div class="office-settings-plan-name">${escHtml(p.name)}</div>
                  <div class="office-settings-plan-meta">${p.seats.length} seats${p.image ? " · custom image" : " · grid"}</div>
                </div>
                ${p.id === activePlanId ? '<span class="office-settings-plan-active">Active</span>' : ""}
              </div>
            `).join("")}
          </div>

          <!-- Quick edit for active plan -->
          ${plan ? `
          <div class="office-settings-edit-section">
            <div class="office-settings-field">
              <label>Plan Name</label>
              <input type="text" class="office-settings-input" id="officeSettingsName" value="${escHtml(plan.name)}" />
            </div>
            <div class="office-settings-field">
              <label>Background Image</label>
              <select class="office-settings-select" id="officeSettingsImage">
                <option value="" ${!plan.image ? "selected" : ""}>None (grid)</option>
                ${availableImages.map(img => `<option value="${escHtml(img)}" ${plan.image === img ? "selected" : ""}>${escHtml(img.split("/").pop() || img)}</option>`).join("")}
              </select>
              ${plan.image ? `<div class="office-settings-preview" style="background-image:url(${plan.image})"></div>` : ""}
            </div>
            <div class="office-settings-field">
              <label>Seats (${plan.seats.length})</label>
              <div class="office-settings-seats">
                ${plan.seats.map((s, i) => `
                  <div class="office-settings-seat-row">
                    <input class="office-settings-seat-label" value="${escHtml(s.label || "")}" data-seat-idx="${i}" placeholder="Label" />
                    <span class="office-settings-seat-pos">x:${s.x}% y:${s.y}%</span>
                    <button class="office-settings-seat-del" data-delete-seat="${i}" title="Remove">&times;</button>
                  </div>
                `).join("")}
              </div>
              <button class="btn btn-sm btn-outline" id="officeSettingsAddSeat" style="margin-top:6px">+ Add Seat (click on floor)</button>
            </div>
          </div>
          ` : ""}

          <div class="office-settings-bottom-actions">
            <button class="btn btn-sm btn-accent" id="officeSettingsSave">Save</button>
            <button class="btn btn-sm btn-outline" id="officeAddPlan">+ New Plan</button>
            ${plans.length > 1 ? '<button class="btn btn-sm btn-danger" id="officeDeletePlan">Delete Plan</button>' : ""}
          </div>
        </div>
      </div>
    </div>
  `;
}

// ── Event bindings ───────────────────────────────────────────────────

function bindOfficeEvents(): void {
  // Settings button (present in both collapsed + expanded views)
  document.getElementById("officeSettingsBtn")?.addEventListener("click", () => {
    settingsDialogOpen = !settingsDialogOpen;
    renderOfficePage();
  });

  // Chat expand (collapsed → expanded)
  document.getElementById("officeChatExpand")?.addEventListener("click", () => {
    chatDrawerOpen = true;
    renderOfficePage();
  });

  // Panel collapse (expanded → collapsed)
  document.getElementById("officePanelCollapse")?.addEventListener("click", () => {
    chatDrawerOpen = false;
    renderOfficePage();
  });

  // Chat input: send on Enter or button click
  const chatInput = document.getElementById("officeChatInput") as HTMLInputElement | null;
  const sendMsg = () => {
    if (!chatInput) return;
    const text = chatInput.value.trim();
    if (!text) return;
    chatInput.value = "";
    handleUserMessage(text);
  };
  chatInput?.addEventListener("keydown", (e) => { if (e.key === "Enter") sendMsg(); });
  document.getElementById("officeChatSend")?.addEventListener("click", sendMsg);

  // Settings dialog events
  if (settingsDialogOpen) {
    bindSettingsDialogEvents();
  }

  // Speech bubble click-to-expand
  bindBubbleClicks();

  // Floor click to add seat
  document.getElementById("officeFloor")?.addEventListener("click", (e) => {
    if (!addingSeat) return;
    const floor = document.getElementById("officeFloor")!;
    const rect = floor.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * 100);
    const y = Math.round(((e.clientY - rect.top) / rect.height) * 100);
    const plan = activePlan();
    if (!plan) return;
    const id = "s" + (plan.seats.length + 1) + "-" + Date.now();
    plan.seats.push({ id, x, y, label: `Seat ${plan.seats.length + 1}` });
    addingSeat = false;
    floor.style.cursor = "";
    saveState();
    renderOfficePage();
  });

  // Drag & drop from agent pool
  bindDragDrop();

  // Unseat buttons
  document.querySelectorAll("[data-unseat]").forEach(el => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      const seatId = (el as HTMLElement).dataset.unseat!;
      const ca = currentAssignments();
      delete ca[seatId];
      saveState();
      renderOfficePage();
    });
  });
}

function bindSettingsDialogEvents(): void {
  // Close button
  document.getElementById("officeSettingsClose")?.addEventListener("click", () => {
    settingsDialogOpen = false;
    renderOfficePage();
  });
  // Click outside dialog to close
  document.getElementById("officeSettingsOverlay")?.addEventListener("click", (e) => {
    if ((e.target as HTMLElement).id === "officeSettingsOverlay") {
      settingsDialogOpen = false;
      renderOfficePage();
    }
  });
  // Click plan items to switch
  document.querySelectorAll("[data-plan-id]").forEach(el => {
    el.addEventListener("click", () => {
      activePlanId = (el as HTMLElement).dataset.planId!;
      saveState();
      renderOfficePage();
    });
  });
  // Save active plan edits
  document.getElementById("officeSettingsSave")?.addEventListener("click", () => {
    const plan = activePlan();
    if (!plan) return;
    const nameInput = document.getElementById("officeSettingsName") as HTMLInputElement;
    const imgSelect = document.getElementById("officeSettingsImage") as HTMLSelectElement;
    if (nameInput) plan.name = nameInput.value || plan.name;
    if (imgSelect) plan.image = imgSelect.value;
    // Update seat labels
    document.querySelectorAll(".office-settings-seat-label").forEach(el => {
      const idx = parseInt((el as HTMLElement).dataset.seatIdx!, 10);
      if (plan.seats[idx]) plan.seats[idx].label = (el as HTMLInputElement).value;
    });
    saveState();
    renderOfficePage();
  });
  // Delete individual seats
  document.querySelectorAll("[data-delete-seat]").forEach(el => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      const plan = activePlan();
      if (!plan) return;
      const idx = parseInt((el as HTMLElement).dataset.deleteSeat!, 10);
      const seat = plan.seats[idx];
      if (seat) {
        const ca = currentAssignments();
        delete ca[seat.id];
      }
      plan.seats.splice(idx, 1);
      saveState();
      renderOfficePage();
    });
  });
  // Add seat (click on floor)
  document.getElementById("officeSettingsAddSeat")?.addEventListener("click", () => {
    addingSeat = true;
    settingsDialogOpen = false;
    const floor = document.getElementById("officeFloor");
    if (floor) floor.style.cursor = "crosshair";
    renderOfficePage();
  });
  // Add new plan
  document.getElementById("officeAddPlan")?.addEventListener("click", () => {
    const id = "plan-" + Date.now();
    plans.push({
      id,
      name: "New Floor Plan",
      image: "",
      seats: [
        { id: "s1", x: 30, y: 30, label: "Seat 1" },
        { id: "s2", x: 60, y: 30, label: "Seat 2" },
        { id: "s3", x: 45, y: 65, label: "Seat 3" },
      ],
    });
    activePlanId = id;
    saveState();
    renderOfficePage();
  });
  // Delete plan
  document.getElementById("officeDeletePlan")?.addEventListener("click", () => {
    const plan = activePlan();
    if (!plan) return;
    if (!confirm(`Delete floor plan "${plan.name}"?`)) return;
    plans = plans.filter(p => p.id !== plan.id);
    delete assignments[plan.id];
    activePlanId = plans[0]?.id || "";
    if (!plans.length) plans = defaultPlans();
    saveState();
    renderOfficePage();
  });
}

function bindDragDrop(): void {
  // Make pool agents draggable
  document.querySelectorAll(".office-pool-agent[draggable='true']").forEach(el => {
    el.addEventListener("dragstart", (e) => {
      dragAgent = (el as HTMLElement).dataset.agentName || null;
      (e as DragEvent).dataTransfer?.setData("text/plain", dragAgent || "");
      (el as HTMLElement).classList.add("dragging");
    });
    el.addEventListener("dragend", () => {
      dragAgent = null;
      (el as HTMLElement).classList.remove("dragging");
      document.querySelectorAll(".office-seat").forEach(s => s.classList.remove("drag-over"));
    });
  });

  // Make seats droppable
  document.querySelectorAll(".office-seat").forEach(el => {
    el.addEventListener("dragover", (e) => {
      e.preventDefault();
      (el as HTMLElement).classList.add("drag-over");
    });
    el.addEventListener("dragleave", () => {
      (el as HTMLElement).classList.remove("drag-over");
    });
    el.addEventListener("drop", (e) => {
      e.preventDefault();
      (el as HTMLElement).classList.remove("drag-over");
      const agentName = (e as DragEvent).dataTransfer?.getData("text/plain");
      const seatId = (el as HTMLElement).dataset.seatId;
      if (!agentName || !seatId) return;

      const ca = currentAssignments();
      // Remove agent from any previous seat
      for (const [sid, name] of Object.entries(ca)) {
        if (name === agentName) delete ca[sid];
      }
      ca[seatId] = agentName;
      saveState();
      renderOfficePage();
    });
  });
}

// ── Chat feature ─────────────────────────────────────────────────────

/** Handle a user-typed message (plain chat or /task command). */
async function handleUserMessage(text: string): Promise<void> {
  const ca = currentAssignments();
  const seatedNames = Object.values(ca);

  // Add the user's message to the log
  chatMessages.push({ from: "You", emoji: "👤", text, timestamp: new Date().toISOString() });
  const wasDrawerOpen = chatDrawerOpen;
  chatDrawerOpen = true;
  if (!wasDrawerOpen) {
    // Switch from collapsed to expanded panel
    renderOfficePage();
  } else {
    updateChatLog();
  }

  // /task command → create a task
  if (text.startsWith("/task ")) {
    const taskTitle = text.slice(6).trim();
    if (!taskTitle) return;
    chatLoading = true;
    updateChatLog();
    try {
      const r = await fetch(`${API}/api/queue/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: taskTitle }),
      });
      const data = await r.json();
      chatLoading = false;
      if (data.ok) {
        chatMessages.push({ from: "System", emoji: "✅", text: `Task created: ${taskTitle}${data.item?.assignee ? " → " + data.item.assignee : ""}`, timestamp: new Date().toISOString() });
      } else {
        chatMessages.push({ from: "System", emoji: "❌", text: data.error || "Failed to create task", timestamp: new Date().toISOString() });
      }
    } catch (err: any) {
      chatLoading = false;
      chatMessages.push({ from: "System", emoji: "❌", text: `Error: ${err.message}`, timestamp: new Date().toISOString() });
    }
    updateChatLog();
    return;
  }

  // Otherwise send to a seated agent for a reply
  if (seatedNames.length === 0) {
    chatMessages.push({ from: "System", emoji: "🔔", text: "Seat an agent on the floor to chat!", timestamp: new Date().toISOString() });
    updateChatLog();
    return;
  }

  chatLoading = true;
  updateChatLog();

  try {
    const r = await fetch(`${API}/api/office/userchat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, agents: seatedNames }),
    });
    const data = await r.json();
    chatLoading = false;
    if (data.reply) {
      // Use raw agent ID for seat matching, display name for UI
      const rawId = data.agentId || seatedNames[0];
      const displayName = data.agent || rawId;
      const msg: ChatMessage = {
        from: displayName,
        emoji: data.emoji || displayName.slice(0, 1).toUpperCase(),
        text: data.reply,
        timestamp: new Date().toISOString(),
      };
      chatMessages.push(msg);
      // Show as speech bubble on the floor using the raw agent ID
      const isSeated = Object.values(ca).includes(rawId);
      if (isSeated) {
        seatBubbles[rawId] = msg;
      }
    } else if (data.error) {
      chatMessages.push({ from: "System", emoji: "❌", text: data.error, timestamp: new Date().toISOString() });
    }
  } catch (err: any) {
    chatLoading = false;
    chatMessages.push({ from: "System", emoji: "❌", text: `Error: ${err.message}`, timestamp: new Date().toISOString() });
  }
  // Update both chat log and floor bubbles
  updateFloorBubbles();
  updateChatLog();
}

async function triggerChat(): Promise<void> {
  const ca = currentAssignments();
  const seatedNames = Object.values(ca);
  if (seatedNames.length < 2) {
    chatMessages = [{ from: "System", emoji: "🔔", text: "Place at least 2 agents on the floor to start a conversation!", timestamp: new Date().toISOString() }];
    seatBubbles = {};
    renderOfficePage();
    return;
  }

  // Clear any running animation
  if (chatAnimTimer) { clearTimeout(chatAnimTimer); chatAnimTimer = null; }
  seatBubbles = {};
  conversing = true;

  chatLoading = true;
  chatMessages = [{ from: "System", emoji: "☕", text: "The agents gather around the office...", timestamp: new Date().toISOString() }];
  renderOfficePage();

  // The converse endpoint handles fallback: OpenAI → Gateway → Simulated
  try {
    const res = await fetch(`${API}/api/office/converse`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agents: seatedNames }),
    });
    if (!res.ok) throw new Error("Conversation API error");
    const data = await res.json();
    const incoming: ChatMessage[] = data.messages || [];

    chatLoading = false;
    _lastConvoMessages = incoming;
    _convoFirstPass = true;
    animateBubbles(incoming, 0);
  } catch (err: any) {
    chatLoading = false;
    chatMessages.push({ from: "System", emoji: "❌", text: `Conversation failed: ${err.message}`, timestamp: new Date().toISOString() });
    conversing = false;
    renderOfficePage();
  }
}

function stopConversation(): void {
  if (chatAnimTimer) { clearTimeout(chatAnimTimer); chatAnimTimer = null; }
  conversing = false;
  seatBubbles = {};
  _lastConvoMessages = [];
  _convoFirstPass = true;
  renderOfficePage();
}

/** Show chat messages one at a time as speech bubbles on the floor plan. */
let _lastConvoMessages: ChatMessage[] = [];
let _convoFirstPass = true;

function animateBubbles(messages: ChatMessage[], idx: number): void {
  if (idx >= messages.length) {
    // First pass done — keep last bubbles visible, then loop
    _convoFirstPass = false;
    chatAnimTimer = setTimeout(() => {
      seatBubbles = {};
      updateFloorBubbles();
      // After a brief pause with no bubbles, cycle again
      chatAnimTimer = setTimeout(() => {
        if (conversing) animateBubbles(_lastConvoMessages, 0);
      }, 3000);
    }, 12000);
    return;
  }

  const msg = messages[idx];
  // Only add to the chat log on the first pass
  if (_convoFirstPass) {
    chatMessages.push(msg);
  }

  // Set this agent's floor bubble (only for seated agents, skip System)
  const ca = currentAssignments();
  const isSeated = Object.values(ca).includes(msg.from);
  if (isSeated) {
    seatBubbles[msg.from] = msg;
  }

  // Update just the floor bubbles + chat log without full re-render
  updateFloorBubbles();
  if (_convoFirstPass) updateChatLog();

  // Schedule next message
  chatAnimTimer = setTimeout(() => animateBubbles(messages, idx + 1), 1800);
}

/** Re-render only the seat elements on the floor to show/hide speech bubbles. */
function updateFloorBubbles(): void {
  const plan = activePlan();
  if (!plan) return;
  const agents = enrichedAgents();
  const floor = document.getElementById("officeFloor");
  if (!floor) return;

  // Replace seat elements
  floor.querySelectorAll(".office-seat").forEach(el => el.remove());
  floor.insertAdjacentHTML("beforeend", renderSeats(plan, agents));

  // Re-bind drop targets, unseat buttons, and bubble clicks
  bindSeatDropTargets();
  bindUnseatButtons();
  bindBubbleClicks();
}

/** Re-render only the chat sidebar log. */
function updateChatLog(): void {
  // Auto-open panel when first messages arrive
  if (chatMessages.length && !chatDrawerOpen) {
    chatDrawerOpen = true;
    renderOfficePage();
    return;
  }
  const el = document.getElementById("officeChatMessages");
  if (!el) return;
  el.innerHTML = chatMessages.map(m => renderChatBubble(m)).join("") +
    (chatLoading ? '<div class="office-chat-loading"><span class="office-typing">Agents are chatting…</span></div>' : "");
  el.scrollTop = el.scrollHeight;
}

/** Bind only seat drop targets (used after partial DOM updates). */
function bindSeatDropTargets(): void {
  document.querySelectorAll(".office-seat").forEach(el => {
    el.addEventListener("dragover", (e) => {
      e.preventDefault();
      (el as HTMLElement).classList.add("drag-over");
    });
    el.addEventListener("dragleave", () => {
      (el as HTMLElement).classList.remove("drag-over");
    });
    el.addEventListener("drop", (e) => {
      e.preventDefault();
      (el as HTMLElement).classList.remove("drag-over");
      const agentName = (e as DragEvent).dataTransfer?.getData("text/plain");
      const seatId = (el as HTMLElement).dataset.seatId;
      if (!agentName || !seatId) return;
      const ca = currentAssignments();
      for (const [sid, name] of Object.entries(ca)) {
        if (name === agentName) delete ca[sid];
      }
      ca[seatId] = agentName;
      saveState();
      renderOfficePage();
    });
  });
}

/** Bind unseat (×) buttons on seats. */
function bindUnseatButtons(): void {
  document.querySelectorAll("[data-unseat]").forEach(el => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      const seatId = (el as HTMLElement).dataset.unseat!;
      const ca = currentAssignments();
      delete ca[seatId];
      saveState();
      renderOfficePage();
    });
  });
}

// ── Bubble click-to-expand ────────────────────────────────────────────

function bindBubbleClicks(): void {
  document.querySelectorAll(".office-speech-clickable").forEach(el => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      const from = (el as HTMLElement).dataset.bubbleFrom || "Agent";
      const full = (el as HTMLElement).dataset.bubbleFull || "";
      showBubbleModal(from, full);
    });
  });
}

function showBubbleModal(from: string, text: string): void {
  const color = agentColor(from);
  const m = new ModalInstance({ maxWidth: "480px" });
  m.body.innerHTML = `
    <div style="padding:20px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
        <div style="width:32px;height:32px;border-radius:50%;border:2px solid ${color};background:${color}22;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:600">${escHtml(initials(from))}</div>
        <div style="font-weight:600;color:${color};font-size:14px">${escHtml(from)}</div>
      </div>
      <div style="font-size:13px;color:var(--text-primary);line-height:1.6;white-space:pre-wrap;max-height:400px;overflow-y:auto">${escHtml(text)}</div>
      <div style="margin-top:16px;text-align:right">
        <button class="btn btn-sm btn-outline" id="officeBubbleClose">Close</button>
      </div>
    </div>
  `;
  m.overlay.querySelector("#officeBubbleClose")?.addEventListener("click", () => m.close());
  document.body.appendChild(m.overlay);
}

// ── Exported handlers for __mc ───────────────────────────────────────

export function officeSelectPlan(planId: string): void {
  activePlanId = planId;
  saveState();
  renderOfficePage();
}
