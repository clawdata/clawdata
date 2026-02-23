"use strict";
(() => {
  var __defProp = Object.defineProperty;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

  // src/mission-control/client/state.ts
  var state = {
    dashboard: null,
    agents: [],
    queue: [],
    feed: [],
    skills: [],
    gateway: "connecting",
    gatewayHealth: null,
    presence: [],
    usageCost: [],
    currentPage: "dashboard",
    activeFeedTab: "all",
    sidebarCollapsed: false,
    commanderOpen: false,
    commanderQuery: "",
    commanderIndex: 0,
    agentConfig: [],
    agentConfigLoading: false,
    selectedAgentId: null,
    roleApplyTarget: null,
    memory: [],
    memoryLoading: false,
    memorySelectedAgent: null,
    memorySelectedFile: null,
    memoryFileContent: null,
    hideDebug: true
  };

  // src/mission-control/client/utils.ts
  function $(id) {
    return document.getElementById(id);
  }
  function escHtml(s) {
    if (!s) return "";
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }
  var AGENT_COLORS = [
    "#e8724a",
    "#34d399",
    "#60a5fa",
    "#a78bfa",
    "#fbbf24",
    "#f472b6",
    "#22d3ee",
    "#fb923c",
    "#818cf8",
    "#2dd4bf"
  ];
  function agentColor(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return AGENT_COLORS[Math.abs(hash) % AGENT_COLORS.length];
  }
  function initials(name) {
    return name.split(/[\s_-]+/).map((w) => w[0]).join("").toUpperCase().slice(0, 2);
  }
  function timeAgo(iso) {
    if (!iso) return "";
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 6e4);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }
  function formatTime(d) {
    return d.toLocaleTimeString("en-US", { hour12: false });
  }
  function formatDate(d) {
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }).toUpperCase();
  }
  function initTheme() {
    const saved = localStorage.getItem("mc-theme") || "dark";
    document.documentElement.setAttribute("data-theme", saved);
  }
  function toggleTheme() {
    const current = document.documentElement.getAttribute("data-theme");
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("mc-theme", next);
  }
  function updateClock() {
    const now = /* @__PURE__ */ new Date();
    const time = $("clockTime");
    const date = $("clockDate");
    if (time) time.textContent = formatTime(now);
    if (date) date.textContent = formatDate(now);
  }

  // src/mission-control/client/skills-store.ts
  var _agentSkills = {};
  function loadAgentSkills() {
    try {
      const raw = localStorage.getItem("mc-agent-skills");
      if (raw) _agentSkills = JSON.parse(raw);
    } catch {
      _agentSkills = {};
    }
  }

  // src/mission-control/client/navbar.ts
  function renderNavbar() {
    const d = state.dashboard;
    const agents = $("statAgentsActive");
    const queue = $("statTasksQueue");
    if (agents) agents.textContent = String(d?.agents?.active || state.agents.filter((a) => a.status === "working").length);
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
  function renderSidebarBadges() {
    const fb = $("feedBadge");
    if (fb) fb.textContent = String(state.feed.length || "");
    const tb = $("tasksBadge");
    if (tb) tb.textContent = String(state.queue.filter((q) => q.status !== "done").length || "");
    const agb = $("agentsBadge");
    if (agb) agb.textContent = String(state.agents.length || "");
    const pEl = $("sidebarPresence");
    if (pEl && state.presence.length) {
      const p = state.presence[0];
      pEl.innerHTML = `<span>${p.host} \xB7 ${p.version}</span><span>${p.platform}</span>`;
    }
  }

  // src/mission-control/client/router.ts
  var PAGES = {};
  function registerPage(name, renderer) {
    PAGES[name] = renderer;
  }
  function navigate(page) {
    if (!PAGES[page]) page = "dashboard";
    state.currentPage = page;
    window.location.hash = page;
    document.querySelectorAll(".sidebar-item").forEach((el) => {
      el.classList.toggle("active", el.dataset.page === page);
    });
    const main = $("mainContent");
    if (main) main._lastPageHTML = "";
    renderPage();
  }
  function setPageContent(html, onMount) {
    const main = $("mainContent");
    if (!main) return;
    if (main._lastPageHTML === html) return;
    main._lastPageHTML = html;
    main.innerHTML = html;
    if (onMount) onMount();
  }
  function renderPage() {
    const fn = PAGES[state.currentPage];
    if (fn) fn();
  }
  var _renderDebounce = null;
  var _renderSuppressed = false;
  var _pendingRender = false;
  function suppressRender() {
    _renderSuppressed = true;
    _pendingRender = false;
  }
  function resumeRender() {
    _renderSuppressed = false;
    if (_pendingRender) {
      _pendingRender = false;
      debouncedRenderPage();
    }
  }
  function debouncedRenderPage() {
    if (_renderSuppressed) {
      _pendingRender = true;
      return;
    }
    if (_renderDebounce) clearTimeout(_renderDebounce);
    _renderDebounce = setTimeout(() => {
      _renderDebounce = null;
      renderPage();
    }, 100);
  }
  function initRouter() {
    const hash = window.location.hash.slice(1) || "dashboard";
    navigate(hash);
    window.addEventListener("hashchange", () => {
      const h = window.location.hash.slice(1) || "dashboard";
      if (h !== state.currentPage) navigate(h);
    });
  }

  // src/mission-control/client/roles.ts
  var AGENT_ROLES = [
    {
      id: "data-discovery",
      name: "Scout",
      theme: "Data Discovery",
      description: "Explores data sources, profiles datasets, discovers schemas and relationships.",
      skills: ["duckdb", "s3", "postgres"],
      model: "claude-sonnet-4-5",
      icon: "\u{1F50D}",
      color: "#22d3ee",
      tier: "specialist"
    },
    {
      id: "data-modeling",
      name: "Architect",
      theme: "Data Modeling",
      description: "Designs dimensional models, builds dbt transformations, manages silver/gold layers.",
      skills: ["dbt", "duckdb", "snowflake"],
      model: "claude-opus-4-6",
      icon: "\u{1F3D7}",
      color: "#a78bfa",
      tier: "specialist"
    },
    {
      id: "orchestration",
      name: "Pipeline",
      theme: "Orchestration",
      description: "Manages ETL/ELT workflows, schedules DAGs, monitors pipeline health.",
      skills: ["airflow", "dagster", "fivetran", "dlt"],
      model: "claude-sonnet-4-5",
      icon: "\u{1F504}",
      color: "#60a5fa",
      tier: "specialist"
    },
    {
      id: "data-quality",
      name: "Guardian",
      theme: "Data Quality",
      description: "Enforces data contracts, runs quality tests, monitors anomalies and SLA compliance.",
      skills: ["great-expectations", "dbt"],
      model: "claude-sonnet-4-5",
      icon: "\u{1F6E1}",
      color: "#34d399",
      tier: "specialist"
    },
    {
      id: "analytics",
      name: "Analyst",
      theme: "Analytics & Insights",
      description: "Runs ad-hoc queries, generates reports, builds dashboards and visualizations.",
      skills: ["duckdb", "metabase", "postgres"],
      model: "claude-sonnet-4-5",
      icon: "\u{1F4CA}",
      color: "#fbbf24",
      tier: "specialist"
    },
    {
      id: "infrastructure",
      name: "Ops",
      theme: "Infrastructure",
      description: "Manages cloud warehouses, handles scaling, monitors infrastructure costs.",
      skills: ["snowflake", "bigquery", "databricks", "spark", "kafka"],
      model: "claude-sonnet-4-5",
      icon: "\u2699",
      color: "#f472b6",
      tier: "support"
    },
    {
      id: "coding-agent",
      name: "Coder",
      theme: "Coding Agent",
      description: "Delegates coding tasks to sub-agents, writes scripts, automates development workflows.",
      skills: ["coding-agent", "github", "gh-issues"],
      model: "claude-sonnet-4-5",
      icon: "\u{1F9E9}",
      color: "#818cf8",
      tier: "specialist"
    },
    {
      id: "comms",
      name: "Comms",
      theme: "Communications",
      description: "Manages Slack, Discord, and notification channels. Routes messages across the team.",
      skills: ["slack", "discord"],
      model: "claude-sonnet-4-5",
      icon: "\u{1F4AC}",
      color: "#fb923c",
      tier: "support"
    }
  ];
  var AGENT_TEMPLATES = AGENT_ROLES.map((r) => ({ ...r, role: r.theme }));

  // src/mission-control/client/api.ts
  var API = window.location.origin;
  var _lastDashboardJSON = "";
  async function fetchDashboard() {
    try {
      const res = await fetch(`${API}/api/dashboard`);
      if (!res.ok) throw new Error("API error");
      const data = await res.json();
      state.dashboard = data;
      state.agents = data.agents?.list || [];
      state.queue = data.queue?.items || [];
      state.gateway = data.gateway || "disconnected";
      state.gatewayHealth = data.gatewayHealth || null;
      state.presence = data.presence || [];
      state.usageCost = data.usageCost || [];
      const serverFeed = data.feed || [];
      if (state.feed.length === 0) {
        state.feed = serverFeed;
      } else {
        const existingIds = new Set(state.feed.map((e) => e.id || `${e.timestamp}|${e.title}`));
        for (const ev of serverFeed) {
          const key = ev.id || `${ev.timestamp}|${ev.title}`;
          if (!existingIds.has(key)) {
            state.feed.push(ev);
            existingIds.add(key);
          }
        }
        state.feed.sort(
          (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
        if (state.feed.length > 200) state.feed.length = 200;
      }
      const stableJson = JSON.stringify(data, (key, value) => {
        if (key === "lastSeen" || key === "tokenUsage" || key === "percentUsed" || key === "contextTokens") return void 0;
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
  async function fetchSkills() {
    try {
      const res = await fetch(`${API}/api/skills`);
      if (!res.ok) return;
      const data = await res.json();
      state.skills = data.skills || [];
    } catch {
    }
  }
  async function fetchAgentConfig() {
    try {
      state.agentConfigLoading = true;
      const res = await fetch(`${API}/api/agents/config`);
      if (!res.ok) return;
      const data = await res.json();
      state.agentConfig = data.agents || [];
      state.agentConfigLoading = false;
      if (state.currentPage === "team") renderPage();
    } catch {
      state.agentConfigLoading = false;
    }
  }
  async function addAgent(name, model, skills) {
    const res = await fetch(`${API}/api/agents/add`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        model: model || void 0,
        skills: skills && skills.length ? skills : void 0
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to add agent");
    await fetchDashboard();
    await fetchAgentConfig();
    return data;
  }
  async function saveAgentSkillsToServer(agentName, skills) {
    try {
      const res = await fetch(`${API}/api/agents/skills`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentName, skills })
      });
      return res.ok;
    } catch {
      return false;
    }
  }
  async function deleteAgent(name) {
    const res = await fetch(`${API}/api/agents/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to delete agent");
    await fetchDashboard();
    await fetchAgentConfig();
    return data;
  }
  async function setAgentIdentity(agentName, opts = {}) {
    try {
      const body = { agentName };
      if (opts.identityName !== void 0) body.identityName = opts.identityName;
      if (opts.identityEmoji !== void 0) body.identityEmoji = opts.identityEmoji;
      if (opts.identityTheme !== void 0) body.identityTheme = opts.identityTheme;
      if (opts.identityAvatar !== void 0) body.identityAvatar = opts.identityAvatar;
      const res = await fetch(`${API}/api/agents/set-identity`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!res.ok) throw new Error("set-identity failed");
      await fetchAgentConfig();
      return true;
    } catch (e) {
      console.error("setAgentIdentity error:", e);
      return false;
    }
  }
  async function applyRoleToAgent(agentName, roleId) {
    const role = AGENT_ROLES.find((r) => r.id === roleId);
    if (!role) return false;
    const ok = await setAgentIdentity(agentName, {
      identityTheme: role.theme,
      identityEmoji: role.icon
    });
    if (ok) {
      const map = JSON.parse(localStorage.getItem("mc-agent-skills") || "{}");
      const existing = map[agentName] || [];
      const merged = [.../* @__PURE__ */ new Set([...existing, ...role.skills])];
      map[agentName] = merged;
      localStorage.setItem("mc-agent-skills", JSON.stringify(map));
      await saveAgentSkillsToServer(agentName, merged);
    }
    return ok;
  }
  async function fetchMemory() {
    try {
      state.memoryLoading = true;
      const res = await fetch(`${API}/api/memory`);
      if (!res.ok) return;
      const data = await res.json();
      state.memory = data.agents || [];
      state.memoryLoading = false;
      if (state.currentPage === "memory") renderPage();
    } catch {
      state.memoryLoading = false;
    }
  }
  async function fetchMemoryFile(agent, filePath) {
    try {
      const res = await fetch(`${API}/api/memory/read/${encodeURIComponent(agent)}/${encodeURIComponent(filePath)}`);
      if (!res.ok) return null;
      const data = await res.json();
      return data.content || "";
    } catch {
      return null;
    }
  }
  async function writeMemoryFile(agent, filePath, content) {
    try {
      const res = await fetch(`${API}/api/memory/write`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent, file: filePath, content })
      });
      if (!res.ok) return false;
      await fetchMemory();
      return true;
    } catch {
      return false;
    }
  }
  async function fetchAgentWorkspace(agentName) {
    try {
      const res = await fetch(`${API}/api/agents/workspace/${encodeURIComponent(agentName)}`);
      if (!res.ok) return [];
      const data = await res.json();
      return data.files || [];
    } catch {
      return [];
    }
  }
  async function writeAgentWorkspaceFile(agentName, fileName, content) {
    try {
      const res = await fetch(`${API}/api/agents/workspace/write`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent: agentName, file: fileName, content })
      });
      if (!res.ok) return false;
      return true;
    } catch {
      return false;
    }
  }
  async function addQueueItem(opts) {
    const res = await fetch(`${API}/api/queue/add`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(opts)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to add task");
    await fetchDashboard();
    return data;
  }
  async function assignQueueItem(id, assignee) {
    const res = await fetch(`${API}/api/queue/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, assignee })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to assign task");
    await fetchDashboard();
    return data;
  }
  async function updateQueueItem(id, updates) {
    const res = await fetch(`${API}/api/queue/update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...updates })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to update task");
    await fetchDashboard();
    return data;
  }
  async function deleteQueueItem(id) {
    const res = await fetch(`${API}/api/queue/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to delete task");
    await fetchDashboard();
    return data;
  }
  async function dispatchQueueItem(id) {
    const res = await fetch(`${API}/api/queue/dispatch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to dispatch task");
    await fetchDashboard();
    return data;
  }
  async function completeQueueItem(id, actor, summary) {
    const res = await fetch(`${API}/api/queue/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, actor, summary })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to complete task");
    await fetchDashboard();
    return data;
  }
  async function assignAndDispatchQueueItem(id, assignee) {
    const res = await fetch(`${API}/api/queue/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, assignee, autoDispatch: true })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to assign and dispatch task");
    await fetchDashboard();
    return data;
  }
  async function clearQueueItemActivity(id) {
    const res = await fetch(`${API}/api/queue/clear-activity`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to clear activity");
    await fetchDashboard();
    return data;
  }
  async function clearAllQueueItems() {
    const res = await fetch(`${API}/api/queue/clear-all`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to clear all tasks");
    await fetchDashboard();
    return data;
  }

  // src/mission-control/client/modal.ts
  var _stack = [];
  function _globalKeyHandler(e) {
    if (e.key === "Escape" && _stack.length) {
      e.preventDefault();
      e.stopPropagation();
      _stack[_stack.length - 1].close();
    }
  }
  var _keyBound = false;
  function _ensureKeyBinding() {
    if (_keyBound) return;
    document.addEventListener("keydown", _globalKeyHandler, true);
    _keyBound = true;
  }
  function _maybeUnbindKey() {
    if (_stack.length === 0 && _keyBound) {
      document.removeEventListener("keydown", _globalKeyHandler, true);
      _keyBound = false;
    }
  }
  var ModalInstance = class {
    constructor(opts = {}) {
      __publicField(this, "overlay");
      __publicField(this, "body");
      __publicField(this, "_closed", false);
      __publicField(this, "_onClose", []);
      const overlay = document.createElement("div");
      overlay.className = "confirm-overlay";
      overlay.style.pointerEvents = "none";
      const dialog = document.createElement("div");
      dialog.className = "confirm-dialog";
      dialog.style.maxWidth = opts.maxWidth || "460px";
      dialog.style.textAlign = "left";
      overlay.appendChild(dialog);
      this.overlay = overlay;
      this.body = dialog;
      let downOnBackdrop = false;
      overlay.addEventListener("pointerdown", (e) => {
        downOnBackdrop = e.target === overlay;
      }, true);
      overlay.addEventListener("pointerup", (e) => {
        if (downOnBackdrop && e.target === overlay && !opts.persistent) {
          this.close();
        }
        downOnBackdrop = false;
      }, true);
      dialog.addEventListener("pointerdown", (e) => e.stopPropagation());
      dialog.addEventListener("pointerup", (e) => e.stopPropagation());
      dialog.addEventListener("click", (e) => e.stopPropagation());
      document.body.appendChild(overlay);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          overlay.classList.add("open");
          overlay.style.pointerEvents = "";
        });
      });
      _ensureKeyBinding();
      _stack.push(this);
    }
    /** Register a callback to fire when the modal is closed. */
    onClose(fn) {
      this._onClose.push(fn);
    }
    close() {
      if (this._closed) return;
      this._closed = true;
      const idx = _stack.indexOf(this);
      if (idx !== -1) _stack.splice(idx, 1);
      _maybeUnbindKey();
      this.overlay.classList.remove("open");
      this.overlay.style.pointerEvents = "none";
      setTimeout(() => this.overlay.remove(), 180);
      for (const fn of this._onClose) {
        try {
          fn();
        } catch (e) {
          console.error("Modal onClose error:", e);
        }
      }
    }
    get isClosed() {
      return this._closed;
    }
  };
  function openModal(opts) {
    return new ModalInstance(opts);
  }
  function showConfirm(opts) {
    return new Promise((resolve) => {
      const m = openModal({ maxWidth: "380px" });
      m.body.style.textAlign = "center";
      m.body.innerHTML = `
      <div class="confirm-icon">${opts.destructive ? "\u26A0" : "\u2139"}</div>
      <div class="confirm-title">${esc(opts.title || "Confirm")}</div>
      <div class="confirm-message">${esc(opts.message || "Are you sure?")}</div>
      <div class="confirm-actions">
        <button class="btn confirm-cancel">${esc(opts.cancelLabel || "Cancel")}</button>
        <button class="btn ${opts.destructive ? "confirm-destructive" : "btn-approve"} confirm-ok">${esc(opts.confirmLabel || "Confirm")}</button>
      </div>
    `;
      const done = (val) => {
        resolve(val);
        m.close();
      };
      m.onClose(() => resolve(false));
      m.body.querySelector(".confirm-cancel").addEventListener("click", () => done(false));
      m.body.querySelector(".confirm-ok").addEventListener("click", () => done(true));
      setTimeout(() => m.body.querySelector(".confirm-cancel")?.focus(), 60);
    });
  }
  function showAlert(opts) {
    const o = typeof opts === "string" ? { message: opts } : opts;
    const variant = o.variant || "info";
    const icon = variant === "error" ? "\u274C" : variant === "warning" ? "\u26A0" : "\u2139\uFE0F";
    return new Promise((resolve) => {
      const m = openModal({ maxWidth: "380px" });
      m.body.style.textAlign = "center";
      m.body.innerHTML = `
      <div class="confirm-icon">${icon}</div>
      <div class="confirm-title">${esc(o.title || (variant === "error" ? "Error" : "Notice"))}</div>
      <div class="confirm-message">${esc(o.message)}</div>
      <div class="confirm-actions">
        <button class="btn btn-approve confirm-ok">${esc(o.buttonLabel || "OK")}</button>
      </div>
    `;
      m.onClose(() => resolve());
      m.body.querySelector(".confirm-ok").addEventListener("click", () => {
        resolve();
        m.close();
      });
      setTimeout(() => m.body.querySelector(".confirm-ok")?.focus(), 60);
    });
  }
  function esc(s) {
    if (!s) return "";
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  // src/mission-control/client/pages/feed.ts
  function findAgentForEvent(ev) {
    const actor = (ev.actor || "").toLowerCase();
    if (!actor || actor === "system" || actor === "human") return void 0;
    return state.agents.find((a) => a.name.toLowerCase() === actor || (a.identName || "").toLowerCase() === actor);
  }
  function agentIcon(ev, fallback) {
    const agent = findAgentForEvent(ev);
    if (agent && agent.identEmoji) return agent.identEmoji;
    return fallback;
  }
  function extractTaskTitle(ev) {
    const title = ev.title || "";
    const m = title.match(/^(?:Task (?:created|assigned|dispatched|updated|completed)|Agent completed):\s*(.+)$/i);
    if (m) return m[1].trim();
    if (/^Task dispatched to\s+/i.test(title) && ev.detail) {
      const dm = ev.detail.match(/^"(.+?)"\s+sent to/);
      if (dm) return dm[1].trim();
    }
    return null;
  }
  function groupIntoThreads(items) {
    const threads = [];
    const taskIndex = /* @__PURE__ */ new Map();
    const actorIndex = /* @__PURE__ */ new Map();
    for (const ev of items) {
      const taskTitle = extractTaskTitle(ev);
      if (taskTitle) {
        const key = taskTitle.toLowerCase();
        const existing = taskIndex.get(key);
        if (existing) {
          existing.events.push(ev);
          existing.count++;
          continue;
        }
        const thread = {
          key: `task:${key}`,
          events: [ev],
          count: 1,
          threadTitle: taskTitle,
          threadType: "task"
        };
        taskIndex.set(key, thread);
        threads.push(thread);
        continue;
      }
      if (ev.detail?.includes("responded to task") && ev.actor) {
        const evTime = new Date(ev.timestamp).getTime();
        let matched = false;
        for (const [, t] of taskIndex) {
          const leadTime = new Date(t.events[0].timestamp).getTime();
          if (Math.abs(evTime - leadTime) < 10 * 60 * 1e3 && t.events.some((e) => (e.actor || "").toLowerCase() === ev.actor.toLowerCase())) {
            t.events.push(ev);
            t.count++;
            t.events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
            matched = true;
            break;
          }
        }
        if (matched) continue;
      }
      if (ev.actor && ev.actor !== "system" && ev.actor !== "human") {
        const actorKey = ev.actor.toLowerCase();
        const existing = actorIndex.get(actorKey);
        if (existing) {
          const oldestInBurst = new Date(existing.events[existing.events.length - 1].timestamp).getTime();
          const evTime = new Date(ev.timestamp).getTime();
          if (oldestInBurst - evTime < 5 * 60 * 1e3 && oldestInBurst - evTime >= 0) {
            existing.events.push(ev);
            existing.count++;
            continue;
          }
        }
        const thread = {
          key: `actor:${actorKey}:${ev.id}`,
          events: [ev],
          count: 1,
          threadTitle: ev.actor,
          threadType: "actor"
        };
        actorIndex.set(actorKey, thread);
        threads.push(thread);
        continue;
      }
      threads.push({
        key: `single:${ev.id}`,
        events: [ev],
        count: 1,
        threadTitle: ev.title,
        threadType: "single"
      });
    }
    return threads;
  }
  function renderFeedPage() {
    const filteredCount = getFilteredFeed().length;
    setPageContent(`
    <div class="page">
      <div class="page-header" style="display:flex;align-items:center;justify-content:space-between">
        <div>
          <div class="page-title">Live Feed</div>
          <div class="page-subtitle">${filteredCount} events</div>
        </div>
        <label class="debug-toggle" style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:12px;color:var(--text-secondary);user-select:none">
          <input type="checkbox" id="debugToggle" ${state.hideDebug ? "" : "checked"} style="cursor:pointer" />
          Show debug
        </label>
      </div>

      <div class="feed-tabs" id="feedTabs">
        <div class="feed-tab ${state.activeFeedTab === "all" ? "active" : ""}" data-feed="all">All</div>
        <div class="feed-tab ${state.activeFeedTab === "agent" ? "active" : ""}" data-feed="agent">Agents</div>
        <div class="feed-tab ${state.activeFeedTab === "task" ? "active" : ""}" data-feed="task">Tasks</div>
        <div class="feed-tab ${state.activeFeedTab === "pipeline" ? "active" : ""}" data-feed="pipeline">Pipelines</div>
        <div class="feed-tab ${state.activeFeedTab === "system" ? "active" : ""}" data-feed="system">System</div>
        <div class="feed-tab ${state.activeFeedTab === "error" ? "active" : ""}" data-feed="error">Errors</div>
      </div>

      <div class="feed-list" id="feedListContainer">
        ${renderFeedItems(getFilteredFeed())}
      </div>
    </div>
  `, () => {
      $("feedTabs")?.addEventListener("click", (e) => {
        const tab = e.target.closest(".feed-tab");
        if (!tab) return;
        state.activeFeedTab = tab.dataset.feed || "all";
        $("feedTabs")?.querySelectorAll(".feed-tab").forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        refreshFeedList();
      });
      $("debugToggle")?.addEventListener("change", () => {
        state.hideDebug = !$("debugToggle").checked;
        refreshFeedList();
      });
      bindFeedClicks();
    });
  }
  function getFilteredFeed() {
    let items = state.feed;
    if (state.hideDebug) {
      items = items.filter((f) => {
        const ev = f;
        if (ev._isLog && ev._logLevel === "debug") return false;
        if (ev.detail && typeof ev.detail === "string" && ev.detail.endsWith("\xB7 debug")) return false;
        return true;
      });
    }
    if (state.activeFeedTab !== "all") {
      items = items.filter((f) => f.type === state.activeFeedTab);
    }
    return items.slice(0, 100);
  }
  var iconMap = {
    system: "\u2699",
    plan: "\u{1F4CB}",
    task: "\u{1F4E6}",
    agent: "\u{1F916}",
    error: "\u26A0",
    pipeline: "\u{1F504}"
  };
  function cleanResponseText(text) {
    return text.replace(/\bq_\d+_\w+\b/gi, "").replace(/^Task\s+complete\s*:\s*/i, "").replace(/^Task\s+\S*\s*complete\s*:\s*/i, "").replace(/\s{2,}/g, " ").trim();
  }
  function renderFeedItems(items) {
    if (!items.length) {
      return '<div class="empty-state"><div class="empty-state-icon">\u{1F4E1}</div><div class="empty-state-text">Waiting for events...</div></div>';
    }
    const threads = groupIntoThreads(items);
    return threads.map((thread, ti) => {
      const ev = thread.events[0];
      const bodyPreview = ev.body ? cleanResponseText(ev.body).slice(0, 140) : "";
      const defaultIcon = ev.icon ? escHtml(ev.icon) : iconMap[ev.type] || "\u2022";
      const displayIcon = agentIcon(ev, defaultIcon);
      const isThread = thread.count > 1;
      return `
    <div class="feed-item${ti === 0 ? " new" : ""}${isThread ? " feed-thread-head" : ""}" data-thread-idx="${ti}" style="cursor:pointer">
      <div class="feed-icon ${ev.type || "system"}">${displayIcon}</div>
      <div class="feed-content">
        <div class="feed-title">${escHtml(ev.title)}</div>
        <div class="feed-detail">${escHtml(ev.detail || "")}</div>
        ${bodyPreview ? `<div class="feed-body-preview">${escHtml(bodyPreview)}${ev.body.length > 140 ? "\u2026" : ""}</div>` : ""}
        ${isThread ? `<div class="feed-thread-badge"><span class="feed-thread-count">${thread.count}</span> events in thread \u25B8</div>` : ""}
      </div>
      <div class="feed-time">${timeAgo(ev.timestamp)}</div>
    </div>`;
    }).join("");
  }
  var _feedPageItems = [];
  function bindFeedClicks() {
    _feedPageItems = getFilteredFeed();
    const container = $("feedListContainer");
    if (!container) return;
    container.addEventListener("click", onFeedPageClick);
  }
  function onFeedPageClick(e) {
    handleFeedClick(e, _feedPageItems);
  }
  function handleFeedClick(e, items) {
    const row = e.target.closest(".feed-item[data-thread-idx]");
    if (!row) return;
    const idx = parseInt(row.dataset.threadIdx || "", 10);
    const threads = groupIntoThreads(items);
    if (isNaN(idx) || idx < 0 || idx >= threads.length) return;
    const thread = threads[idx];
    if (thread.count > 1) showThreadDetailModal(thread);
    else showFeedDetailModal(thread.events[0]);
  }
  var typeLabels = {
    system: "System",
    agent: "Agent",
    task: "Task",
    pipeline: "Pipeline",
    error: "Error",
    plan: "Plan"
  };
  var typeBadgeColors = {
    system: "var(--accent-cyan)",
    agent: "var(--accent-green)",
    task: "var(--accent-blue)",
    pipeline: "var(--accent-purple)",
    error: "var(--accent-red)",
    plan: "var(--accent-yellow)"
  };
  function showFeedDetailModal(ev) {
    const m = openModal({ maxWidth: "520px" });
    const type = ev.type || "system";
    const rawIcon = ev.icon || iconMap[type] || "\u2022";
    const icon = agentIcon(ev, rawIcon);
    const label = typeLabels[type] || type;
    const color = typeBadgeColors[type] || "var(--text-secondary)";
    const actor = ev.actor || "";
    const ts = ev.timestamp ? new Date(ev.timestamp) : null;
    const timeStr = ts ? ts.toLocaleString("en-AU", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }) : "";
    const relTime2 = ev.timestamp ? timeAgo(ev.timestamp) : "";
    const isLog = ev._isLog;
    const logLevel = ev._logLevel || "";
    const subsystem = ev.detail?.match(/^([\w/:-]+)\s*·/)?.[1] || "";
    const bodyText = ev.body ? cleanResponseText(ev.body) : "";
    m.body.innerHTML = `
    <div class="feed-detail-modal">
      <div class="feed-detail-header">
        <div class="feed-detail-icon ${type}" style="font-size:20px;width:40px;height:40px">${escHtml(icon)}</div>
        <div style="flex:1;min-width:0">
          <div class="feed-detail-title">${escHtml(ev.title)}</div>
          <div style="display:flex;gap:8px;align-items:center;margin-top:4px;flex-wrap:wrap">
            <span class="feed-detail-badge" style="--badge-color:${color}">${escHtml(label)}</span>
            ${actor ? `<span class="feed-detail-badge" style="--badge-color:var(--text-secondary)">${escHtml(actor)}</span>` : ""}
            ${isLog && logLevel ? `<span class="feed-detail-badge" style="--badge-color:${logLevel === "error" ? "var(--accent-red)" : logLevel === "warn" ? "var(--accent-yellow)" : "var(--text-muted)"}">${escHtml(logLevel)}</span>` : ""}
          </div>
        </div>
      </div>

      ${bodyText ? `
      <div class="feed-detail-section">
        <div class="feed-detail-label">RESPONSE</div>
        <div class="feed-detail-value feed-detail-body">${escHtml(bodyText)}</div>
      </div>` : ""}

      ${ev.detail ? `
      <div class="feed-detail-section">
        <div class="feed-detail-label">DETAIL</div>
        <div class="feed-detail-value">${escHtml(ev.detail)}</div>
      </div>` : ""}

      ${subsystem ? `
      <div class="feed-detail-section">
        <div class="feed-detail-label">SUBSYSTEM</div>
        <div class="feed-detail-value" style="font-family:var(--font-mono);font-size:11px">${escHtml(subsystem)}</div>
      </div>` : ""}

      <div class="feed-detail-section">
        <div class="feed-detail-label">TIMESTAMP</div>
        <div class="feed-detail-value">${escHtml(timeStr)}${relTime2 ? ` <span style="color:var(--text-muted);margin-left:8px">(${escHtml(relTime2)})</span>` : ""}</div>
      </div>

      <div style="text-align:right;margin-top:20px">
        <button class="btn feed-detail-close" style="min-width:80px">Close</button>
      </div>
    </div>
  `;
    m.body.querySelector(".feed-detail-close")?.addEventListener("click", () => m.close());
  }
  function showThreadDetailModal(thread) {
    const m = openModal({ maxWidth: "580px" });
    const lead = thread.events[0];
    const type = lead.type || "system";
    const icon = agentIcon(lead, lead.icon || iconMap[type] || "\u2022");
    const color = typeBadgeColors[type] || "var(--text-secondary)";
    const label = thread.threadType === "task" ? "Task Thread" : thread.threadType === "actor" ? "Activity" : typeLabels[type] || type;
    const timeRange = (() => {
      const newest = new Date(thread.events[0].timestamp).getTime();
      const oldest = new Date(thread.events[thread.events.length - 1].timestamp).getTime();
      const diff = newest - oldest;
      if (diff < 6e4) return "< 1 min";
      if (diff < 36e5) return `${Math.round(diff / 6e4)} min`;
      return `${(diff / 36e5).toFixed(1)} hr`;
    })();
    m.body.innerHTML = `
    <div class="feed-detail-modal">
      <div class="feed-detail-header">
        <div class="feed-detail-icon ${type}" style="font-size:20px;width:40px;height:40px">${escHtml(icon)}</div>
        <div style="flex:1;min-width:0">
          <div class="feed-detail-title">${escHtml(thread.threadTitle)}</div>
          <div style="display:flex;gap:8px;align-items:center;margin-top:4px;flex-wrap:wrap">
            <span class="feed-detail-badge" style="--badge-color:${color}">${escHtml(label)}</span>
            <span class="feed-detail-badge" style="--badge-color:var(--accent-orange)">${thread.count} events</span>
            <span class="feed-detail-badge" style="--badge-color:var(--text-muted)">span: ${timeRange}</span>
          </div>
        </div>
      </div>

      <div class="feed-thread-timeline">
        ${thread.events.map((ev, i) => {
      const evIcon = agentIcon(ev, ev.icon || iconMap[ev.type] || "\u2022");
      const evColor = typeBadgeColors[ev.type] || "var(--text-secondary)";
      const evBody = ev.body ? cleanResponseText(ev.body).slice(0, 200) : "";
      return `
          <div class="feed-thread-event" data-evt-idx="${i}">
            <div class="feed-thread-dot" style="background:${evColor}"></div>
            <div class="feed-thread-event-content">
              <div class="feed-thread-event-header">
                <span class="feed-thread-event-icon">${escHtml(evIcon)}</span>
                <span class="feed-thread-event-title">${escHtml(ev.title)}</span>
              </div>
              ${ev.detail ? `<div class="feed-thread-event-detail">${escHtml(ev.detail)}</div>` : ""}
              ${evBody ? `<div class="feed-thread-event-body">${escHtml(evBody)}${ev.body.length > 200 ? "\u2026" : ""}</div>` : ""}
              <div class="feed-thread-event-time">${timeAgo(ev.timestamp)}</div>
            </div>
          </div>`;
    }).join("")}
      </div>

      <div style="text-align:right;margin-top:20px">
        <button class="btn feed-detail-close" style="min-width:80px">Close</button>
      </div>
    </div>
  `;
    m.body.querySelectorAll(".feed-thread-event").forEach((el) => {
      el.addEventListener("click", () => {
        const idx = parseInt(el.dataset.evtIdx || "", 10);
        if (!isNaN(idx) && idx >= 0 && idx < thread.events.length) {
          showFeedDetailModal(thread.events[idx]);
        }
      });
    });
    m.body.querySelector(".feed-detail-close")?.addEventListener("click", () => m.close());
  }
  function refreshFeedList() {
    const container = $("feedListContainer");
    if (!container) return;
    const filtered = getFilteredFeed();
    container.innerHTML = renderFeedItems(filtered);
    _feedPageItems = filtered;
    const subtitle = document.querySelector(".page-subtitle");
    if (subtitle) subtitle.textContent = `${filtered.length} events`;
  }

  // src/mission-control/client/sse.ts
  var _softRefreshInFlight = false;
  async function softRefresh() {
    if (_softRefreshInFlight) return;
    _softRefreshInFlight = true;
    try {
      await fetchDashboard();
    } finally {
      _softRefreshInFlight = false;
    }
  }
  function connectSSE() {
    const evtSource = new EventSource(`${API}/api/events`);
    evtSource.addEventListener("connected", () => console.log("SSE connected"));
    evtSource.addEventListener("feed:new", (e) => {
      try {
        const event = JSON.parse(e.data);
        state.feed.unshift(event);
        if (state.feed.length > 200) state.feed.length = 200;
        renderSidebarBadges();
        if (state.currentPage === "feed") refreshFeedList();
      } catch {
      }
    });
    evtSource.addEventListener("log:entry", (e) => {
      try {
        const entry = JSON.parse(e.data);
        const subsystem = entry.subsystem || "";
        const isAgent = subsystem.startsWith("agent");
        const syntheticEvent = {
          id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          type: isAgent ? "agent" : entry.level === "error" || entry.level === "fatal" ? "error" : "system",
          title: (entry.message || "").slice(0, 200),
          detail: `${subsystem ? `[${subsystem}]` : ""} \xB7 ${entry.level || ""}`,
          timestamp: entry.time || (/* @__PURE__ */ new Date()).toISOString(),
          actor: subsystem || "system",
          _isLog: true,
          _logLevel: entry.level
        };
        state.feed.unshift(syntheticEvent);
        if (state.feed.length > 200) state.feed.length = 200;
        if (state.currentPage === "feed") refreshFeedList();
      } catch {
      }
    });
    evtSource.addEventListener("state:refresh", () => softRefresh());
    evtSource.addEventListener("agents:changed", () => softRefresh());
    evtSource.onerror = () => {
      evtSource.close();
      setTimeout(connectSSE, 5e3);
    };
  }

  // src/mission-control/client/components/commander.ts
  function openCommander() {
    state.commanderOpen = true;
    state.commanderQuery = "";
    state.commanderIndex = 0;
    const overlay = $("commanderOverlay");
    if (overlay) overlay.classList.add("open");
    const input = $("commanderInput");
    if (input) {
      input.value = "";
      input.focus();
    }
    renderCommanderResults();
  }
  function closeCommander() {
    state.commanderOpen = false;
    const overlay = $("commanderOverlay");
    if (overlay) overlay.classList.remove("open");
  }
  function getCommanderItems(query) {
    const q = query.toLowerCase().trim();
    const pages = [
      { label: "Dashboard", page: "dashboard", icon: "\u{1F3E0}", group: "Pages" },
      { label: "Live Feed", page: "feed", icon: "\u{1F4E1}", group: "Pages" },
      { label: "Tasks", page: "tasks", icon: "\u2705", group: "Pages" },
      { label: "Queue", page: "queue", icon: "\u{1F4CB}", group: "Pages" },
      { label: "Agents", page: "team", icon: "\u{1F465}", group: "Pages" },
      { label: "Skills", page: "skills", icon: "\u{1F527}", group: "Pages" },
      { label: "Usage", page: "usage", icon: "\u{1F4CA}", group: "Pages" },
      { label: "Gateway", page: "gateway", icon: "\u{1F5A5}", group: "Pages" }
    ];
    const agentItems = state.agents.map((a) => ({
      label: a.name,
      detail: `${a.role || "Agent"} \xB7 ${a.status}`,
      page: "team",
      icon: "\u{1F916}",
      group: "Agents"
    }));
    const skillItems = state.skills.map((s) => ({
      label: s.name,
      detail: s.linked ? "linked" : s.available ? "available" : "missing",
      page: "skills",
      icon: "\u{1F527}",
      group: "Skills"
    }));
    const templateItems = AGENT_TEMPLATES.map((t) => ({
      label: t.name,
      detail: t.role,
      page: "team",
      icon: t.icon,
      group: "Templates"
    }));
    const all = [...pages, ...agentItems, ...templateItems, ...skillItems];
    if (!q) return all.slice(0, 15);
    return all.filter(
      (i) => i.label.toLowerCase().includes(q) || (i.detail || "").toLowerCase().includes(q) || i.group.toLowerCase().includes(q)
    ).slice(0, 15);
  }
  function renderCommanderResults() {
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
  function executeCommanderItem(index) {
    const items = getCommanderItems(state.commanderQuery);
    const item = items[index];
    if (item) {
      closeCommander();
      navigate(item.page);
    }
  }
  function initCommanderBindings() {
    const input = $("commanderInput");
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
        const result = e.target.closest(".commander-result");
        if (result) executeCommanderItem(parseInt(result.dataset.index || "0", 10));
      });
    }
  }

  // src/mission-control/client/pages/dashboard.ts
  function renderDashboardPage() {
    const d = state.dashboard || {};
    const agents = state.agents;
    const activeCount = agents.filter((a) => a.status === "working").length;
    const totalCost = state.usageCost.reduce((s, d2) => s + (d2.totalCost || 0), 0).toFixed(2);
    const totalTokens = Math.round(state.usageCost.reduce((s, d2) => s + (d2.totalTokens || 0), 0) / 1e3);
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
          <div class="stat-card-value">${(d.queue?.total || 0) - (d.queue?.done || 0)}</div>
          <div class="stat-card-label">Queue Items</div>
          <div class="stat-card-delta">${d.queue?.inProgress || 0} in progress</div>
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
            <a href="#team" style="font-size:11px;color:var(--accent-orange)">View all \u2192</a>
          </div>
          <div class="card-body no-pad">
            <div class="mini-agent-list" id="dashAgents">${renderMiniAgentList(agents)}</div>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <span class="card-title">Live Feed</span>
            <a href="#feed" style="font-size:11px;color:var(--accent-orange)">View all \u2192</a>
          </div>
          <div class="card-body no-pad">
            <div class="feed-list" id="dashFeedList">${renderFeedItems(state.feed.slice(0, 8))}</div>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <span class="card-title">Skills</span>
            <a href="#skills" style="font-size:11px;color:var(--accent-orange)">View all \u2192</a>
          </div>
          <div class="card-body">
            <div style="display:flex;flex-wrap:wrap;gap:4px;">
              ${state.skills.map((s) => `<span class="skill-tag ${s.linked ? "active" : ""}">${escHtml(s.name)}</span>`).join("")}
              ${state.skills.length === 0 ? '<span class="skill-tag">Loading...</span>' : ""}
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <span class="card-title">Usage (7d)</span>
            <a href="#usage" style="font-size:11px;color:var(--accent-orange)">Details \u2192</a>
          </div>
          <div class="card-body">
            ${renderUsageMini()}
          </div>
        </div>
      </div>
    </div>
  `, () => {
      const feedContainer = document.getElementById("dashFeedList");
      if (feedContainer) {
        feedContainer.addEventListener("click", (e) => handleFeedClick(e, dashFeedItems));
      }
      const agentContainer = document.getElementById("dashAgents");
      if (agentContainer) {
        agentContainer.addEventListener("click", (e) => {
          const row = e.target.closest(".mini-agent[data-agent-name]");
          if (!row) return;
          const name = row.dataset.agentName || "";
          const agent = state.agents.find((a) => a.name === name);
          if (agent) showAgentActivityModal(agent);
        });
      }
    });
  }
  function renderMiniAgentList(agents) {
    if (!agents.length) {
      return '<div class="empty-state"><div class="empty-state-icon">\u{1F99E}</div><div class="empty-state-text">No agents detected. Start OpenClaw to begin.</div></div>';
    }
    return agents.map((a) => {
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
          <div class="mini-agent-meta">${a.currentTask ? `\u2699\uFE0F ${escHtml(a.currentTask)}` : `${escHtml(a.role || "Agent")} \xB7 ${a.model ? escHtml(a.model) : "\u2014"}`}</div>
        </div>
        ${pct ? `<div class="mini-agent-usage"><div class="mini-usage-bar"><div class="mini-usage-fill" style="width:${pct}%"></div></div><span class="mini-usage-pct">${pct}%</span></div>` : ""}
      </div>`;
    }).join("");
  }
  function renderUsageMini() {
    const days = state.usageCost.slice(0, 7);
    if (!days.length) return '<div style="color:var(--text-muted);font-size:11px">No usage data</div>';
    const max = Math.max(...days.map((d) => d.totalTokens || 0), 1);
    return `<div class="usage-chart-area">${days.map((d) => {
      const pct = Math.max(3, Math.round((d.totalTokens || 0) / max * 100));
      const tokens = Math.round((d.totalTokens || 0) / 1e3);
      const cost = (d.totalCost || 0).toFixed(2);
      const label = d.date ? d.date.slice(5) : "?";
      return `<div class="usage-row"><span class="usage-day">${label}</span><div class="usage-bar-track"><div class="usage-bar-fill" style="width:${pct}%"></div></div><span class="usage-tokens">${tokens}k</span><span class="usage-cost">$${cost}</span></div>`;
    }).join("")}</div>`;
  }
  var statusLabels = {
    working: "Working",
    idle: "Idle",
    busy: "Busy",
    offline: "Offline",
    error: "Error"
  };
  var statusColors = {
    working: "var(--accent-green)",
    idle: "var(--text-muted)",
    busy: "var(--accent-yellow)",
    offline: "var(--text-muted)",
    error: "var(--accent-red)"
  };
  function showAgentActivityModal(agent) {
    const m = openModal({ maxWidth: "600px" });
    suppressRender();
    m.onClose(() => resumeRender());
    const c = agentColor(agent.name);
    const emoji = agent.identEmoji || "";
    const displayName = agent.identName || agent.name;
    const status = agent.status || "idle";
    const pct = agent.percentUsed || (agent.tokenUsage?.total && agent.contextTokens ? Math.round(agent.tokenUsage.total / agent.contextTokens * 100) : 0);
    const agentFeed = state.feed.filter((ev) => {
      const actor = (ev.actor || "").toLowerCase();
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
            ${agent.role ? ` \xB7 ${escHtml(agent.role)}` : ""}
            ${agent.model ? ` \xB7 ${escHtml(agent.model)}` : ""}
          </div>
          ${agent.currentTask ? `<div class="agent-activity-task">\u2699\uFE0F ${escHtml(agent.currentTask)}</div>` : ""}
          ${pct ? `<div class="agent-activity-usage"><div class="mini-usage-bar" style="width:120px"><div class="mini-usage-fill" style="width:${pct}%"></div></div><span style="font-size:10px;color:var(--text-muted)">${pct}% context</span></div>` : ""}
        </div>
        <a href="#team" class="agent-activity-configure" title="Configure agent">\u2699</a>
      </div>

      <div class="agent-activity-send">
        <input type="text" id="agentTaskInput" class="agent-task-input" placeholder="Ask ${escHtml(displayName)} to do something\u2026" autocomplete="off" />
        <button class="btn btn-primary agent-task-btn" id="agentTaskSend">Send</button>
      </div>

      <div class="agent-activity-feed-header">
        <span>Recent Activity</span>
        <span style="color:var(--text-muted);font-size:10px">${agentFeed.length} events</span>
      </div>
      <div class="agent-activity-feed" id="agentActivityFeed">
        ${agentFeed.length ? renderAgentFeedItems(agentFeed) : '<div class="empty-state" style="padding:24px 0"><div class="empty-state-icon" style="font-size:20px">\u{1F4E1}</div><div class="empty-state-text">No recent activity</div></div>'}
      </div>

      <div style="text-align:right;margin-top:16px">
        <button class="btn feed-detail-close" style="min-width:80px">Close</button>
      </div>
    </div>
  `;
    const input = m.body.querySelector("#agentTaskInput");
    const sendBtn = m.body.querySelector("#agentTaskSend");
    async function sendTask() {
      const text = input.value.trim();
      if (!text) return;
      input.disabled = true;
      sendBtn.disabled = true;
      sendBtn.textContent = "Sending\u2026";
      try {
        const res = await fetch(`${API}/api/queue/add`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: text, assignee: agent.name, priority: "medium" })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to add task");
        input.value = "";
        input.placeholder = "\u2713 Sent! Ask something else\u2026";
      } catch (err) {
        input.placeholder = `Error: ${err.message || "Failed"}`;
      } finally {
        input.disabled = false;
        sendBtn.disabled = false;
        sendBtn.textContent = "Send";
        input.focus();
      }
    }
    sendBtn.addEventListener("click", sendTask);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") sendTask();
    });
    setTimeout(() => input.focus(), 100);
    const feedContainer = m.body.querySelector("#agentActivityFeed");
    if (feedContainer) {
      feedContainer.addEventListener("click", (e) => {
        const row = e.target.closest(".feed-item[data-feed-idx]");
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
  function renderAgentFeedItems(items) {
    const iconMap2 = {
      system: "\u2699",
      plan: "\u{1F4CB}",
      task: "\u{1F4E6}",
      agent: "\u{1F916}",
      error: "\u26A0",
      pipeline: "\u{1F504}"
    };
    return items.map((ev, i) => {
      const bodyPreview = ev.body ? ev.body.slice(0, 100) : "";
      const icon = ev.icon || iconMap2[ev.type] || "\u2022";
      return `
    <div class="feed-item" data-feed-idx="${i}" style="cursor:pointer;padding:8px 6px">
      <div class="feed-icon ${ev.type || "system"}" style="width:26px;height:26px;font-size:11px">${escHtml(icon)}</div>
      <div class="feed-content">
        <div class="feed-title" style="font-size:11px">${escHtml(ev.title)}</div>
        <div class="feed-detail">${escHtml(ev.detail || "")}</div>
        ${bodyPreview ? `<div class="feed-body-preview" style="max-width:380px">${escHtml(bodyPreview)}${ev.body.length > 100 ? "\u2026" : ""}</div>` : ""}
      </div>
      <div class="feed-time">${timeAgo(ev.timestamp)}</div>
    </div>`;
    }).join("");
  }

  // src/mission-control/client/pages/tasks.ts
  function relTime(iso) {
    if (!iso) return "";
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 0 || diff < 6e4) return "just now";
    if (diff < 36e5) return `${Math.floor(diff / 6e4)}m ago`;
    if (diff < 864e5) return `${Math.floor(diff / 36e5)}h ago`;
    return `${Math.floor(diff / 864e5)}d ago`;
  }
  var ACTIVITY_ICONS = {
    created: "\u{1F4DD}",
    assigned: "\u{1F464}",
    reassigned: "\u{1F504}",
    dispatched: "\u{1F680}",
    started: "\u25B6\uFE0F",
    review: "\u{1F440}",
    completed: "\u2705",
    dispatch_error: "\u26A0\uFE0F",
    summary: "\u{1F4CB}",
    working: "\u2699\uFE0F",
    responded: "\u{1F4AC}"
  };
  function fmtTimestamp(iso) {
    if (!iso) return "";
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) + " \xB7 " + d.toLocaleDateString([], { month: "short", day: "numeric" });
    } catch {
      return relTime(iso);
    }
  }
  function agentOptions() {
    return (state.agents || []).map((a) => ({
      value: a.identName || a.name,
      label: a.identName || a.name
    }));
  }
  function renderTasksPage() {
    const items = state.queue;
    const counts = { inbox: 0, assigned: 0, in_progress: 0, review: 0, done: 0 };
    items.forEach((i) => {
      if (counts[i.status] !== void 0) counts[i.status]++;
    });
    setPageContent(`
    <div class="page">
      <div class="page-header" style="display:flex;align-items:center;justify-content:space-between">
        <div>
          <div class="page-title">Tasks & Missions</div>
          <div class="page-subtitle">${items.length} items \xB7 ${counts.in_progress} in progress \xB7 ${counts.done} done</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          ${items.length > 0 ? `<button class="btn btn-reject" id="clearAllBtn" style="font-size:11px;padding:6px 14px;opacity:0.7">Clear All</button>` : ""}
          <button class="btn btn-approve" id="addTaskBtn" style="font-size:12px;padding:8px 18px;display:flex;align-items:center;gap:6px">
            <span style="font-size:15px;line-height:1">+</span> Add Task
          </button>
        </div>
      </div>

      <div class="queue-columns">
        ${renderCol("Inbox", "inbox", "dot-muted", items.filter((i) => i.status === "inbox"))}
        ${renderCol("Assigned", "assigned", "dot-blue", items.filter((i) => i.status === "assigned"))}
        ${renderCol("In Progress", "in_progress", "dot-cyan", items.filter((i) => i.status === "in_progress"))}
        ${renderCol("Review", "review", "dot-yellow", items.filter((i) => i.status === "review"))}
        ${renderCol("Done", "done", "dot-green", items.filter((i) => i.status === "done"))}
      </div>
    </div>
  `, bindPageEvents);
  }
  function renderQueuePage() {
    renderTasksPage();
  }
  function bindPageEvents() {
    document.getElementById("addTaskBtn")?.addEventListener("click", () => showAddTaskModal());
    document.getElementById("clearAllBtn")?.addEventListener("click", () => showClearAllModal());
    document.querySelectorAll("[data-assign-id]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        showAssignModal(btn.dataset.assignId);
      });
    });
    document.querySelectorAll("[data-dispatch-id]").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        btn.textContent = "Sending\u2026";
        btn.classList.add("disabled");
        try {
          await dispatchQueueItem(btn.dataset.dispatchId);
        } catch {
          btn.textContent = "\u{1F680} Dispatch";
          btn.classList.remove("disabled");
        }
      });
    });
    document.querySelectorAll("[data-move-id]").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        try {
          await updateQueueItem(btn.dataset.moveId, { status: btn.dataset.moveStatus });
        } catch (err) {
          console.error("Status update failed:", err);
        }
      });
    });
    document.querySelectorAll("[data-delete-id]").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        try {
          await deleteQueueItem(btn.dataset.deleteId);
        } catch (err) {
          console.error(err);
        }
      });
    });
    document.querySelectorAll("[data-task-id]").forEach((card) => {
      card.addEventListener("click", (e) => {
        if (e.target.closest("button")) return;
        showTaskDetailModal(card.dataset.taskId);
      });
    });
  }
  function showClearAllModal() {
    const count = state.queue.length;
    const m = openModal({ maxWidth: "400px" });
    m.body.innerHTML = `
    <div class="confirm-title" style="margin-bottom:12px">Clear All Tasks</div>
    <div class="confirm-message" style="text-align:left;margin-bottom:20px">
      This will permanently delete <strong>${count} task(s)</strong> from the queue, including all activity history. This cannot be undone.
    </div>
    <div class="confirm-actions" style="justify-content:flex-end">
      <button class="btn" id="modalCancel">Cancel</button>
      <button class="btn btn-reject" id="modalOk">Delete All</button>
    </div>
  `;
    m.body.querySelector("#modalCancel").addEventListener("click", () => m.close());
    m.body.querySelector("#modalOk").addEventListener("click", () => {
      m.close();
      clearAllQueueItems().catch((err) => console.error("Failed to clear all tasks:", err));
    });
  }
  function showAddTaskModal() {
    const agents = agentOptions();
    const m = openModal({ maxWidth: "460px" });
    m.body.innerHTML = `
    <div class="confirm-title" style="margin-bottom:16px">New Task</div>
    <div class="task-form">
      <div class="task-form-group">
        <label class="task-form-label">Title <span style="color:var(--accent-red)">*</span></label>
        <input type="text" id="taskTitle" class="task-form-input" placeholder="What needs to be done?" autocomplete="off" />
      </div>
      <div class="task-form-group">
        <label class="task-form-label">Description</label>
        <textarea id="taskDesc" class="task-form-input" rows="3" placeholder="Optional details\u2026"></textarea>
      </div>
      <div style="display:flex;gap:12px">
        <div class="task-form-group" style="flex:1">
          <label class="task-form-label">Priority</label>
          <select id="taskPriority" class="task-form-input">
            <option value="low">Low</option>
            <option value="medium" selected>Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </div>
        <div class="task-form-group" style="flex:1">
          <label class="task-form-label">Assign to Agent</label>
          <select id="taskAssignee" class="task-form-input">
            <option value="">Auto (Chief of Staff)</option>
            ${agents.map((a) => `<option value="${escHtml(a.value)}">${escHtml(a.label)}</option>`).join("")}
          </select>
        </div>
      </div>
      <div class="task-form-hint" style="margin-top:4px;font-size:11px;color:var(--text-muted)">
        Tasks are automatically dispatched to the agent after creation.
      </div>
    </div>
    <div class="confirm-actions" style="margin-top:20px;justify-content:flex-end">
      <button class="btn" id="modalCancel">Cancel</button>
      <button class="btn btn-approve" id="modalOk">Create Task</button>
    </div>
  `;
    const titleInput = m.body.querySelector("#taskTitle");
    m.body.querySelector("#modalCancel").addEventListener("click", () => m.close());
    m.body.querySelector("#modalOk").addEventListener("click", () => {
      const title = titleInput.value.trim();
      if (!title) {
        titleInput.focus();
        return;
      }
      const desc = m.body.querySelector("#taskDesc").value.trim();
      const priority = m.body.querySelector("#taskPriority").value;
      const assignee = m.body.querySelector("#taskAssignee").value;
      m.close();
      addQueueItem({ title, description: desc || void 0, priority, assignee: assignee || void 0 }).catch((err) => console.error("Failed to create task:", err));
    });
    setTimeout(() => titleInput.focus(), 80);
  }
  function showAssignModal(taskId) {
    const item = state.queue.find((q) => q.id === taskId);
    if (!item) return;
    const agents = agentOptions();
    const m = openModal({ maxWidth: "380px" });
    m.body.innerHTML = `
    <div class="confirm-title" style="margin-bottom:4px">Assign Task</div>
    <div class="confirm-message" style="text-align:left;margin-bottom:16px">${escHtml(item.title)}</div>
    <div class="task-form-group">
      <label class="task-form-label">Assign to Agent</label>
      <select id="assignAgent" class="task-form-input">
        <option value="">Unassigned</option>
        ${agents.map((a) => {
      const selected = item.assignee === a.value ? "selected" : "";
      return `<option value="${escHtml(a.value)}" ${selected}>${escHtml(a.label)}</option>`;
    }).join("")}
      </select>
    </div>
    <div class="task-form-group" style="margin-top:8px">
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:12px;color:var(--text-secondary)">
        <input type="checkbox" id="assignAutoDispatch" checked />
        Send to agent immediately (dispatch)
      </label>
    </div>
    <div class="task-form-hint" style="margin-top:8px">
      Dispatching sends the task to the agent's OpenClaw session so they start working on it.
    </div>
    <div class="confirm-actions" style="margin-top:20px;justify-content:flex-end">
      <button class="btn" id="modalCancel">Cancel</button>
      <button class="btn btn-approve" id="modalOk">Assign</button>
    </div>
  `;
    m.body.querySelector("#modalCancel").addEventListener("click", () => m.close());
    m.body.querySelector("#modalOk").addEventListener("click", () => {
      const agent = m.body.querySelector("#assignAgent").value;
      if (!agent) {
        m.close();
        return;
      }
      const autoDispatch = m.body.querySelector("#assignAutoDispatch").checked;
      m.close();
      const op = autoDispatch ? assignAndDispatchQueueItem(taskId, agent) : assignQueueItem(taskId, agent);
      op.catch((err) => console.error("Assign failed:", err));
    });
  }
  function showTaskDetailModal(taskId) {
    const item = state.queue.find((q) => q.id === taskId);
    if (!item) return;
    const STATUS_LABEL = {
      inbox: "Inbox",
      assigned: "Assigned",
      in_progress: "In Progress",
      review: "Review",
      done: "Done"
    };
    const activity = item.activity || [];
    const m = openModal({ maxWidth: "560px" });
    m.body.innerHTML = `
    <div class="confirm-title" style="margin-bottom:8px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      <span>${escHtml(item.title)}</span>
      <span class="task-status-pill" style="font-size:10px">${STATUS_LABEL[item.status] || item.status}</span>
      ${item.dispatchedAt ? `<span class="task-dispatched-tag" style="font-size:10px">\u{1F680} Dispatched</span>` : ""}
    </div>
    ${item.description ? `<div style="color:var(--text-secondary);font-size:13px;margin-bottom:16px;line-height:1.5">${escHtml(item.description)}</div>` : ""}

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
      <div>
        <div class="task-form-label">Priority</div>
        <div style="font-size:13px;text-transform:capitalize;margin-top:4px">${item.priority}</div>
      </div>
      <div>
        <div class="task-form-label">Assignee</div>
        <div style="font-size:13px;margin-top:4px">${item.assignee ? `<span style="display:inline-flex;align-items:center;gap:6px"><span class="mini-avatar" style="background:${agentColor(item.assignee)}15;color:${agentColor(item.assignee)};width:20px;height:20px;font-size:9px">${initials(item.assignee)}</span>${escHtml(item.assignee)}</span>` : "Unassigned"}</div>
      </div>
      <div>
        <div class="task-form-label">Created</div>
        <div style="font-size:13px;margin-top:4px">${relTime(item.createdAt)}</div>
      </div>
      ${item.dispatchedAt ? `<div><div class="task-form-label">Dispatched</div><div style="font-size:13px;margin-top:4px">${relTime(item.dispatchedAt)}</div></div>` : ""}
      ${item.completedAt ? `<div><div class="task-form-label">Completed</div><div style="font-size:13px;margin-top:4px">${relTime(item.completedAt)}</div></div>` : ""}
    </div>

    ${activity.length ? `
    <div style="margin-bottom:16px">
      <div class="task-form-label" style="margin-bottom:8px">Activity Timeline (${activity.length})</div>
      <div class="task-activity-list" style="max-height:320px;overflow-y:auto">
        ${[...activity].reverse().map((a) => {
      const hasLongDetail = a.detail && a.detail.length > 80;
      const detailPreview = a.detail ? escHtml(a.detail.slice(0, 200)) : "";
      const detailFull = a.detail ? escHtml(a.detail) : "";
      const isAgent = a.actor !== "human" && a.actor !== "system";
      const actorStyle = isAgent ? `color:var(--accent-primary)` : a.actor === "system" ? `color:var(--text-muted)` : ``;
      return `
          <div class="task-activity-item" style="align-items:flex-start">
            <span class="task-activity-icon" style="margin-top:2px">${ACTIVITY_ICONS[a.action] || "\u2022"}</span>
            <span class="task-activity-detail" style="flex:1;min-width:0">
              <strong style="${actorStyle}">${escHtml(a.actor)}</strong> <span style="opacity:0.5">${escHtml(a.action)}</span>
              ${a.detail ? `<div style="margin-top:3px;opacity:0.7;font-size:11px;line-height:1.4;word-break:break-word;white-space:pre-wrap">${hasLongDetail ? detailPreview + "\u2026" : detailFull}</div>` : ""}
            </span>
            <span class="task-activity-time" style="white-space:nowrap;flex-shrink:0" title="${a.timestamp ? escHtml(fmtTimestamp(a.timestamp)) : ""}">${relTime(a.timestamp)}</span>
          </div>`;
    }).join("")}
      </div>
    </div>
    ` : `
    <div style="margin-bottom:16px;padding:16px;text-align:center;color:var(--text-muted);font-size:12px;border:1px dashed var(--border);border-radius:8px">
      No activity recorded yet
    </div>
    `}

    <div class="confirm-actions" style="margin-top:20px;justify-content:space-between">
      <div style="display:flex;gap:8px">
        ${item.status !== "done" && item.assignee && !item.dispatchedAt ? `<button class="btn btn-sm" id="modalDispatch" style="font-size:11px">\u{1F680} Dispatch</button>` : ""}
        ${item.status !== "done" ? `<button class="btn btn-sm btn-approve" id="modalComplete" style="font-size:11px">\u2713 Complete</button>` : ""}
        <button class="btn btn-reject btn-sm" id="modalDelete" style="font-size:11px">Delete</button>
        ${activity.length ? `<button class="btn btn-sm" id="modalClearActivity" style="opacity:0.6;font-size:11px">Clear Log</button>` : ""}
      </div>
      <button class="btn" id="modalClose">Close</button>
    </div>
  `;
    m.body.querySelector("#modalClose").addEventListener("click", () => m.close());
    m.body.querySelector("#modalDelete")?.addEventListener("click", async () => {
      m.close();
      try {
        await deleteQueueItem(taskId);
      } catch (err) {
        console.error(err);
      }
    });
    m.body.querySelector("#modalComplete")?.addEventListener("click", async () => {
      m.close();
      try {
        await completeQueueItem(taskId, item.assignee || "human");
      } catch (err) {
        console.error(err);
      }
    });
    m.body.querySelector("#modalDispatch")?.addEventListener("click", async () => {
      const btn = m.body.querySelector("#modalDispatch");
      btn.textContent = "Sending\u2026";
      btn.classList.add("disabled");
      try {
        await dispatchQueueItem(taskId);
        m.close();
      } catch {
        btn.textContent = "\u{1F680} Dispatch";
        btn.classList.remove("disabled");
      }
    });
    m.body.querySelector("#modalClearActivity")?.addEventListener("click", async () => {
      m.close();
      try {
        await clearQueueItemActivity(taskId);
      } catch (err) {
        console.error(err);
      }
    });
  }
  var PILL_MAP = {
    inbox: "pill-inbox",
    assigned: "pill-assigned",
    in_progress: "pill-in-progress",
    review: "pill-review",
    done: "pill-done"
  };
  function renderCol(label, key, dotClass, items) {
    return `
    <div class="queue-col">
      <div class="queue-col-header">
        <span class="queue-col-title"><span class="dot ${dotClass}"></span>${label}</span>
        <span class="queue-col-count">${items.length}</span>
      </div>
      <div class="queue-cards-list">
        ${items.length ? items.map((i) => renderCard(i)).join("") : `<div class="empty-state" style="padding:20px"><div class="empty-state-text" style="opacity:0.4">No ${label.toLowerCase()} items</div></div>`}
      </div>
    </div>`;
  }
  function renderCard(item) {
    const STATUS_LABEL = {
      inbox: "Inbox",
      assigned: "Assigned",
      in_progress: "In Progress",
      review: "Review",
      done: "Done"
    };
    const priClass = item.priority === "critical" ? "critical" : item.priority === "high" ? "high-priority" : "";
    const actions = [];
    if (item.status !== "done") {
      const label = item.assignee ? "Reassign" : "Assign";
      actions.push(`<button class="btn btn-sm" data-assign-id="${item.id}" title="${label}">${label}</button>`);
    }
    if (item.status === "assigned" && item.assignee && !item.dispatchedAt) {
      actions.push(`<button class="btn btn-sm btn-dispatch" data-dispatch-id="${item.id}" title="Send to agent">\u{1F680} Dispatch</button>`);
    }
    if (item.status === "inbox" || item.status === "assigned") {
      actions.push(`<button class="btn btn-sm btn-approve" data-move-id="${item.id}" data-move-status="in_progress">\u25B8 Start</button>`);
    } else if (item.status === "in_progress") {
      actions.push(`<button class="btn btn-sm" data-move-id="${item.id}" data-move-status="review">Review</button>`);
      actions.push(`<button class="btn btn-sm btn-approve" data-move-id="${item.id}" data-move-status="done">\u2713 Done</button>`);
    } else if (item.status === "review") {
      actions.push(`<button class="btn btn-sm btn-approve" data-move-id="${item.id}" data-move-status="done">\u2713 Done</button>`);
    }
    if (item.status === "done") {
      actions.push(`<button class="btn btn-sm btn-reject" data-delete-id="${item.id}" title="Remove">\u2715</button>`);
    }
    const dispatchedTag = item.dispatchedAt ? `<span class="task-dispatched-tag" title="Dispatched ${relTime(item.dispatchedAt)}">\u{1F680} Dispatched</span>` : "";
    const activity = item.activity || [];
    const recentActivity = activity.length > 0 ? (() => {
      const last = activity[activity.length - 1];
      return `<div style="font-size:10px;color:var(--text-muted);margin-top:6px;display:flex;align-items:center;gap:4px">
          <span>${ACTIVITY_ICONS[last.action] || "\u2022"}</span>
          <span>${escHtml(last.actor)}: ${escHtml(last.action)}</span>
          <span style="margin-left:auto">${relTime(last.timestamp)}</span>
        </div>`;
    })() : "";
    return `
    <div class="task-card ${priClass}" data-task-id="${item.id}" style="cursor:pointer">
      <div class="task-card-header">
        <span class="task-status-pill ${PILL_MAP[item.status] || ""}">${STATUS_LABEL[item.status] || item.status}</span>
        ${dispatchedTag}
        ${item.riskLevel ? `<span class="approval-risk risk-${item.riskLevel}">Risk: ${item.riskLevel}</span>` : ""}
      </div>
      <div class="task-card-title">${escHtml(item.title)}</div>
      ${item.description ? `<div class="task-card-desc">${escHtml(item.description)}</div>` : ""}
      <div class="task-card-footer">
        ${item.assignee ? `<div class="task-assignee"><div class="mini-avatar" style="background:${agentColor(item.assignee)}15;color:${agentColor(item.assignee)}">${initials(item.assignee)}</div>${escHtml(item.assignee)}</div>` : `<div class="task-assignee" style="color:var(--text-muted)">Unassigned</div>`}
        <span class="task-priority priority-${item.priority}">${item.priority}</span>
      </div>
      ${recentActivity}
      ${actions.length ? `<div class="task-card-actions">${actions.join("")}</div>` : ""}
    </div>`;
  }

  // src/mission-control/client/pages/team.ts
  function renderTeamPage() {
    const liveAgents = state.agents;
    const activeSkillNames = state.skills.filter((s) => s.linked).map((s) => s.name);
    const cfgMap = {};
    (state.agentConfig || []).forEach((c) => {
      cfgMap[c.id] = c;
    });
    const enriched = liveAgents.map((a) => {
      const cfg = cfgMap[a.name] || cfgMap[a.id] || {};
      const identity = cfg.identityFull || {};
      const theme = cfg.identityTheme || identity.theme || "";
      const role = AGENT_ROLES.find((r) => r.theme.toLowerCase() === theme.toLowerCase());
      const identName = cfg.identityName || identity.name || a.name;
      const agentSkills = cfg.skills ?? null;
      return {
        ...a,
        identName,
        identEmoji: cfg.identityEmoji || identity.emoji || "",
        theme,
        role,
        isDefault: cfg.isDefault || false,
        agentSkills,
        workspaceFiles: cfg.workspaceFiles || [],
        soulSummary: cfg.soulSummary || ""
      };
    });
    const leader = enriched.find((a) => a.isDefault) || (enriched.length ? enriched[0] : null);
    const workers = enriched.filter((a) => a !== leader);
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
        ${workers.map((a) => renderTeamCard(a, activeSkillNames, false)).join("")}
      </div>
      ` : ""}

      ${enriched.length === 0 ? `
      <div class="team-empty">
        <div class="team-empty-icon">\u{1F99E}</div>
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
  function renderTeamCard(agent, activeSkillNames, isHero) {
    const role = agent.role;
    const color = role ? role.color : agentColor(agent.identName);
    const skills = Array.isArray(agent.agentSkills) ? agent.agentSkills : [];
    const wsFiles = agent.workspaceFiles || [];
    const soulLine = agent.soulSummary || "";
    const desc = soulLine ? soulLine : role ? role.description : agent.theme ? agent.theme : "No configuration yet. Click to set up this agent.";
    return `
    <div class="team-card ${isHero ? "team-card--hero" : ""}" style="--tc:${color}">
      <div class="team-card-inner">
        <div class="team-card-avatar" style="background:${color}18;color:${color}">
          ${agent.identEmoji || (role ? role.icon : initials(agent.identName))}
          <span class="team-card-status team-card-status--${agent.status === "working" ? "working" : agent.status === "idle" ? "idle" : "offline"}"></span>
        </div>
        <div class="team-card-meta">
          <div class="team-card-name">${escHtml(agent.identName)}</div>
          <div class="team-card-role">${escHtml(isHero ? agent.theme || "Chief of Staff" : agent.theme || "Unassigned")}</div>
        </div>
      </div>
      <div class="team-card-desc">${agent.currentTask ? `\u2699\uFE0F Working on: ${escHtml(agent.currentTask)}` : escHtml(desc)}</div>
      ${skills.length ? `
      <div class="team-card-tags">
        ${skills.map((s) => `<span class="team-tag ${activeSkillNames.includes(s) ? "team-tag--on" : ""}">${escHtml(s)}</span>`).join("")}
      </div>` : ""}
      ${wsFiles.length ? `
      <div class="team-card-files">
        ${wsFiles.map((f) => `<span class="team-file-tag">${escHtml(f)}</span>`).join("")}
      </div>` : ""}
      <div class="team-card-foot">
        <a class="team-card-link" onclick="event.preventDefault();window.__mc.showAgentConfigModal('${escHtml(agent.name)}')" href="#">CONFIGURE &rarr;</a>
      </div>
    </div>`;
  }
  async function showAddAgentModal() {
    const skillChecks = state.skills.map((s) => {
      const label = s.emoji ? `${s.emoji} ${s.name}` : s.name;
      return `
      <label class="skill-checkbox" title="${escHtml(s.description || "")}">
        <input type="checkbox" value="${escHtml(s.name)}" />
        <span class="skill-check-label">${escHtml(label)}</span>
        ${s.linked && s.available ? '<span class="skill-check-ok">\u2713</span>' : '<span class="skill-check-na">\u2014</span>'}
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
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeAddAgentModal();
    });
    setTimeout(() => document.getElementById("addAgentName")?.focus(), 100);
  }
  function closeAddAgentModal() {
    document.getElementById("addAgentOverlay")?.remove();
  }
  async function submitAddAgent() {
    const name = document.getElementById("addAgentName")?.value.trim();
    const model = document.getElementById("addAgentModel")?.value.trim();
    const skillCheckboxes = document.querySelectorAll("#addAgentSkills input[type=checkbox]:checked");
    const selectedSkills = Array.from(skillCheckboxes).map((cb) => cb.value);
    if (!name) {
      showAlert({ message: "Agent name is required", variant: "warning" });
      return;
    }
    if (!/^[a-zA-Z0-9 _-]+$/.test(name)) {
      showAlert({ message: "Agent name must contain only letters, numbers, spaces, hyphens, and underscores", variant: "warning" });
      return;
    }
    const folderId = name.replace(/\s+/g, "_");
    if (state.agents.some((a) => a.name === name || a.id === name || a.name === folderId || a.id === folderId)) {
      showAlert({ message: `Agent "${name}" already exists`, variant: "warning" });
      return;
    }
    closeAddAgentModal();
    state.agents.push({
      id: name,
      name,
      status: "idle",
      model: model || void 0,
      role: void 0,
      agentSkills: selectedSkills
    });
    renderPage();
    try {
      await addAgent(name, model || "", selectedSkills);
    } catch (err) {
      state.agents = state.agents.filter((a) => a.name !== name);
      renderPage();
      showAlert({ title: "Add Agent Failed", message: String(err.message || err), variant: "error" });
    }
  }
  var TABS = [
    { id: "identity", label: "Identity", icon: "\u{1F3AD}" },
    { id: "soul", label: "Soul", icon: "\u2728" },
    { id: "user", label: "User", icon: "\u{1F464}" },
    { id: "skills", label: "Skills", icon: "\u{1F527}" },
    { id: "files", label: "Files", icon: "\u{1F4C1}" }
  ];
  var _configTab = "identity";
  var _configFiles = [];
  var _configAgent = "";
  async function showAgentConfigModal(agentName) {
    _configAgent = agentName;
    _configTab = "identity";
    _configFiles = await fetchAgentWorkspace(agentName);
    renderAgentConfigModal();
  }
  function renderAgentConfigModal() {
    document.getElementById("agentConfigOverlay")?.remove();
    const agentName = _configAgent;
    const cfg = (state.agentConfig || []).find((c) => c.id === agentName) || {};
    const identity = cfg.identityFull || {};
    const curName = cfg.identityName || identity.name || agentName;
    const curEmoji = cfg.identityEmoji || identity.emoji || "";
    const curTheme = cfg.identityTheme || identity.theme || "";
    const agentSkillsList = Array.isArray(cfg.skills) ? cfg.skills : [];
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
        ${TABS.map((t) => `
          <button class="agent-config-tab ${_configTab === t.id ? "active" : ""}" onclick="window.__mc.switchConfigTab('${t.id}')">
            <span>${t.icon}</span> ${t.label}
          </button>
        `).join("")}
      </div>

      <div class="agent-config-body" id="agentConfigBody">
        ${renderConfigTabContent(agentName, cfg, curName, curEmoji, curTheme, agentSkillsList)}
      </div>

      <div class="agent-config-footer">
        ${agentName !== "main" && agentName !== "Main" ? `<button onclick="event.stopPropagation();window.__mc.closeAgentConfigModal();setTimeout(()=>window.__mc.handleDeleteAgent('${escHtml(agentName)}'),100)" class="rolecard-btn-delete">Delete Agent</button>` : "<span></span>"}
        <div style="display:flex;gap:8px">
          <button onclick="window.__mc.closeAgentConfigModal()" class="rolecard-btn-cancel">Cancel</button>
          <button onclick="window.__mc.saveAgentConfig('${escHtml(agentName)}')" class="rolecard-btn-save" id="agent-config-save">Save</button>
        </div>
      </div>
    </div>
  `;
    document.body.appendChild(overlay);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeAgentConfigModal();
    });
  }
  function renderConfigTabContent(agentName, cfg, curName, curEmoji, curTheme, agentSkillsList) {
    switch (_configTab) {
      case "identity":
        return renderIdentityTab(agentName, curName, curEmoji, curTheme);
      case "soul":
        return renderFileTab("SOUL.md", "Define who this agent is \u2014 personality, values, and working style.");
      case "user":
        return renderFileTab("USER.md", "Information about the human this agent helps \u2014 built over time.");
      case "skills":
        return renderSkillsTab(agentName, agentSkillsList, cfg.skills === null || cfg.skills === void 0);
      case "files":
        return renderFilesTab();
      default:
        return "";
    }
  }
  function renderIdentityTab(_agentName, curName, curEmoji, curTheme) {
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
        ${AGENT_ROLES.map((r) => {
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
  function renderFileTab(fileName, description) {
    const file = _configFiles.find((f) => f.name === fileName);
    const content = file ? file.content : "";
    const modified = file ? new Date(file.modified).toLocaleString() : "";
    return `
    <div class="agent-config-section">
      <div class="rolecard-section-label">${escHtml(fileName)}</div>
      <div style="font-size:11px;color:var(--text-muted);margin-bottom:8px">
        ${escHtml(description)}
        ${modified ? ` \xB7 Last modified: ${escHtml(modified)}` : ""}
      </div>
      <textarea id="agent-file-editor" class="agent-file-editor" spellcheck="false" data-filename="${escHtml(fileName)}">${escHtml(content)}</textarea>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button onclick="window.__mc.saveAgentFile('${escHtml(_configAgent)}', '${escHtml(fileName)}')" class="btn btn-sm btn-primary">Save ${escHtml(fileName)}</button>
        <span id="agent-file-status" style="font-size:11px;color:var(--text-muted);line-height:28px"></span>
      </div>
    </div>`;
  }
  function renderSkillsTab(agentName, agentSkillsList, allEnabled) {
    const cfg = (state.agentConfig || []).find((c) => c.id === agentName) || {};
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
        ${state.skills.map((s) => {
      const checked = allEnabled ? "checked" : agentSkillsList.includes(s.name) ? "checked" : "";
      const label = s.emoji ? `${s.emoji} ${s.name}` : s.name;
      return `<label class="rolecard-skill-check" title="${escHtml(s.description || "")}">
            <input type="checkbox" value="${escHtml(s.name)}" ${checked} />
            <span>${escHtml(label)}</span>
            ${s.linked && s.available ? '<span style="color:var(--accent-green);font-size:10px">\u2713</span>' : ""}
          </label>`;
    }).join("")}
      </div>
    </div>`;
  }
  function renderFilesTab() {
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
        ${_configFiles.map((f) => {
      const icon = f.name === "SOUL.md" ? "\u2728" : f.name === "USER.md" ? "\u{1F464}" : f.name === "MEMORY.md" ? "\u{1F9E0}" : f.name === "AGENTS.md" ? "\u{1F4CB}" : f.name === "IDENTITY.md" ? "\u{1F3AD}" : f.name === "TOOLS.md" ? "\u{1F527}" : "\u{1F4C4}";
      const preview = f.content.split("\\n").filter((l) => l.trim() && !l.startsWith("#"))[0]?.trim().slice(0, 80) || "";
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
  function closeAgentConfigModal() {
    document.getElementById("agentConfigOverlay")?.remove();
  }
  function switchConfigTab(tabId) {
    _configTab = tabId;
    renderAgentConfigModal();
  }
  function editAgentFile(fileName) {
    if (fileName === "SOUL.md") _configTab = "soul";
    else if (fileName === "USER.md") _configTab = "user";
    else {
      _configTab = "files";
      renderAgentConfigModal();
      setTimeout(() => {
        const file = _configFiles.find((f) => f.name === fileName);
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
  async function saveAgentFile(agentName, fileName) {
    const editor = document.getElementById("agent-file-editor");
    const statusEl = document.getElementById("agent-file-status");
    if (!editor) return;
    const content = editor.value;
    if (statusEl) statusEl.textContent = "Saving\u2026";
    const ok = await writeAgentWorkspaceFile(agentName, fileName, content);
    if (ok) {
      const idx = _configFiles.findIndex((f) => f.name === fileName);
      if (idx >= 0) {
        _configFiles[idx] = { ..._configFiles[idx], content, size: content.length, modified: (/* @__PURE__ */ new Date()).toISOString() };
      } else {
        _configFiles.push({ name: fileName, content, size: content.length, modified: (/* @__PURE__ */ new Date()).toISOString() });
      }
      if (statusEl) {
        statusEl.textContent = "\u2713 Saved";
        setTimeout(() => {
          if (statusEl) statusEl.textContent = "";
        }, 2e3);
      }
      fetchAgentConfig();
    } else {
      if (statusEl) statusEl.textContent = "\u2717 Failed";
    }
  }
  async function saveAgentConfig(agentName) {
    const btn = document.getElementById("agent-config-save");
    if (btn) {
      btn.textContent = "Saving\u2026";
      btn.disabled = true;
    }
    if (_configTab === "identity") {
      const nameVal = document.getElementById("rc-name")?.value.trim();
      const emojiVal = document.getElementById("rc-emoji")?.value.trim();
      const themeVal = document.getElementById("rc-theme")?.value.trim();
      await setAgentIdentity(agentName, {
        identityName: nameVal || void 0,
        identityEmoji: emojiVal || void 0,
        identityTheme: themeVal || void 0
      });
    }
    if (_configTab === "skills") {
      const allCheckboxes = document.querySelectorAll("#rc-skills input[type=checkbox]");
      const checkboxes = document.querySelectorAll("#rc-skills input[type=checkbox]:checked");
      const selected = Array.from(checkboxes).map((cb) => cb.value);
      const skillsToSave = selected.length === allCheckboxes.length ? [] : selected;
      const ok = await saveAgentSkillsToServer(agentName, skillsToSave);
      if (btn) {
        btn.textContent = ok ? "Saved \u2713" : "Error";
      }
      await new Promise((r) => setTimeout(r, 600));
      await fetchAgentConfig();
    }
    if (_configTab === "soul" || _configTab === "user") {
      const editor = document.getElementById("agent-file-editor");
      if (editor) {
        const fileName = editor.dataset.filename || "";
        if (fileName) await writeAgentWorkspaceFile(agentName, fileName, editor.value);
      }
    }
    closeAgentConfigModal();
    renderPage();
  }
  function selectRolePreset(roleId) {
    const role = AGENT_ROLES.find((r) => r.id === roleId);
    if (!role) return;
    const emojiEl = document.getElementById("rc-emoji");
    const themeEl = document.getElementById("rc-theme");
    if (emojiEl) emojiEl.value = role.icon;
    if (themeEl) themeEl.value = role.theme;
    document.querySelectorAll(".rolecard-preset").forEach((el) => {
      el.classList.toggle("active", el.dataset.roleId === roleId);
    });
    const checkboxes = document.querySelectorAll("#rc-skills input[type=checkbox]");
    checkboxes.forEach((cb) => {
      if (role.skills.includes(cb.value)) cb.checked = true;
    });
  }
  async function handleDeleteAgent(name) {
    const confirmed = await showConfirm({
      title: "Delete Agent",
      message: `Delete agent "${name}" and all workspace files? This cannot be undone.`,
      confirmLabel: "Delete",
      cancelLabel: "Cancel",
      destructive: true
    });
    if (!confirmed) return;
    state.agents = state.agents.filter((a) => a.name !== name);
    state.agentConfig = state.agentConfig.filter((c) => c.id !== name);
    renderPage();
    try {
      await deleteAgent(name);
    } catch (err) {
      showAlert({ title: "Delete Agent Failed", message: String(err.message || err), variant: "error" });
    }
  }
  function showRoleCardModal(agentName) {
    showAgentConfigModal(agentName);
  }
  function closeRoleCardModal() {
    closeAgentConfigModal();
  }
  function submitRoleCard(agentName) {
    return saveAgentConfig(agentName);
  }
  function showManageSkillsModal(agentName) {
    _configTab = "skills";
    showAgentConfigModal(agentName);
  }
  function closeManageSkillsModal() {
    closeAgentConfigModal();
  }
  async function submitManageSkills(agentName) {
    const allCheckboxes = document.querySelectorAll("#rc-skills input[type=checkbox]");
    const checkboxes = document.querySelectorAll("#rc-skills input[type=checkbox]:checked");
    const selected = Array.from(checkboxes).map((cb) => cb.value);
    const skillsToSave = selected.length === allCheckboxes.length ? [] : selected;
    await saveAgentSkillsToServer(agentName, skillsToSave);
    await fetchAgentConfig();
    closeAgentConfigModal();
    if (state.currentPage === "team" || state.currentPage === "dashboard") renderPage();
  }
  function toggleAgentDetail(_agentName) {
  }
  async function handleApplyRole(roleId) {
    const select = document.getElementById(`role-apply-${roleId}`);
    if (!select) return;
    const agentName = select.value;
    if (!agentName) return;
    const btn = select.nextElementSibling;
    if (btn) {
      btn.textContent = "Applying\u2026";
      btn.disabled = true;
    }
    const ok = await applyRoleToAgent(agentName, roleId);
    if (ok) {
      select.value = "";
      if (btn) {
        btn.textContent = "Applied \u2713";
        setTimeout(() => {
          btn.textContent = "Apply";
          btn.disabled = false;
        }, 1500);
      }
    } else {
      if (btn) {
        btn.textContent = "Error";
        btn.disabled = false;
      }
    }
  }
  async function deployTemplate(tmpl) {
    try {
      await addAgent(tmpl.id, tmpl.model, tmpl.skills || []);
    } catch {
    }
  }

  // src/mission-control/client/pages/skills.ts
  function renderSkillsPage() {
    const skills = state.skills;
    const linkedCount = skills.filter((s) => s.linked && s.available).length;
    setPageContent(`
    <div class="page">
      <div class="page-header">
        <div>
          <div class="page-title">Skills Registry</div>
          <div class="page-subtitle">${skills.length} skills \xB7 ${linkedCount} available</div>
        </div>
      </div>

      <div class="skills-grid-page">
        ${skills.length === 0 ? '<div class="empty-state" style="grid-column:1/-1"><div class="empty-state-text">Loading skills...</div></div>' : skills.map((s) => {
      const statusLabel = s.linked && s.available ? "AVAILABLE" : s.linked ? "LINKED" : s.installed ? "INSTALLED" : "MISSING";
      const statusClass = s.linked && s.available ? "skill-linked" : s.linked ? "skill-available" : s.installed ? "skill-available" : "skill-missing";
      return `
            <div class="skill-card">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
                <div class="skill-card-name">${s.emoji ? s.emoji + " " : ""}${escHtml(s.name)}</div>
                <span class="skill-card-status ${statusClass}">${statusLabel}</span>
              </div>
              ${s.description ? `<div class="skill-card-desc">${escHtml(s.description)}</div>` : ""}
              <div style="display:flex;align-items:center;gap:6px;margin-top:6px;flex-wrap:wrap">
                ${s.source ? `<span class="skill-tag">${escHtml(s.source)}</span>` : ""}
                ${(s.tags || []).map((t) => `<span class="skill-tag">${escHtml(t)}</span>`).join("")}
              </div>
            </div>
          `;
    }).join("")}
      </div>
    </div>
  `);
  }

  // src/mission-control/client/pages/usage.ts
  function renderUsagePage() {
    const days = state.usageCost || [];
    const totalTokens = days.reduce((s, d) => s + (d.totalTokens || 0), 0);
    const totalCost = days.reduce((s, d) => s + (d.totalCost || 0), 0);
    const max = Math.max(...days.map((d) => d.totalTokens || 0), 1);
    setPageContent(`
    <div class="page">
      <div class="page-header">
        <div>
          <div class="page-title">Usage & Costs</div>
          <div class="page-subtitle">Token consumption and cost breakdown</div>
        </div>
      </div>

      <div class="grid-3" style="margin-bottom:24px">
        <div class="stat-card">
          <div class="stat-card-value">${Math.round(totalTokens / 1e3)}k</div>
          <div class="stat-card-label">Total Tokens</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-value">$${totalCost.toFixed(2)}</div>
          <div class="stat-card-label">Total Cost</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-value">${days.length}</div>
          <div class="stat-card-label">Days Tracked</div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <span class="card-title">Daily Breakdown</span>
        </div>
        <div class="card-body">
          ${days.length === 0 ? '<div class="empty-state"><div class="empty-state-text">No usage data available</div></div>' : `<div class="usage-chart-area">
                ${days.map((d) => {
      const pct = Math.max(3, Math.round((d.totalTokens || 0) / max * 100));
      const tokens = Math.round((d.totalTokens || 0) / 1e3);
      const cost = (d.totalCost || 0).toFixed(2);
      return `<div class="usage-row"><span class="usage-day">${d.date || "?"}</span><div class="usage-bar-track"><div class="usage-bar-fill" style="width:${pct}%"></div></div><span class="usage-tokens">${tokens}k</span><span class="usage-cost">$${cost}</span></div>`;
    }).join("")}
                <div class="usage-total-row">
                  <span style="color:var(--text-secondary)">${Math.round(totalTokens / 1e3)}k tokens</span>
                  <span style="color:var(--accent-green)">$${totalCost.toFixed(2)} total</span>
                </div>
              </div>`}
        </div>
      </div>
    </div>
  `);
  }

  // src/mission-control/client/pages/gateway.ts
  function renderGatewayPage() {
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
            ${presence.length ? presence.map((p) => `
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
              <div class="gateway-detail-row"><span class="gateway-label">OK</span><span class="gateway-value">${gh.ok ? "\u2713" : "\u2717"}</span></div>
              <div class="gateway-detail-row"><span class="gateway-label">Default Agent</span><span class="gateway-value">${escHtml(gh.defaultAgentId || "main")}</span></div>
              <div class="gateway-detail-row"><span class="gateway-label">Heartbeat</span><span class="gateway-value">${gh.heartbeatSeconds ? Math.round(gh.heartbeatSeconds / 60) + "m" : "\u2014"}</span></div>
            ` : '<div style="color:var(--text-muted)">No health data</div>'}
          </div>
        </div>

        <div class="card" style="grid-column:1/-1">
          <div class="card-header"><span class="card-title">Channels</span></div>
          <div class="card-body">
            ${gh?.channelOrder?.length ? gh.channelOrder.map((chName) => {
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

  // src/mission-control/client/pages/memory.ts
  function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  function timeAgo2(iso) {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 6e4);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  }
  function renderMarkdown(md) {
    return escHtml(md).replace(/^### (.+)$/gm, '<h4 style="margin:12px 0 6px;font-size:13px;font-weight:600;color:var(--text)">$1</h4>').replace(/^## (.+)$/gm, '<h3 style="margin:16px 0 8px;font-size:14px;font-weight:600;color:var(--text)">$1</h3>').replace(/^# (.+)$/gm, '<h2 style="margin:18px 0 8px;font-size:16px;font-weight:700;color:var(--text)">$1</h2>').replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\*(.+?)\*/g, "<em>$1</em>").replace(/`([^`]+)`/g, '<code style="background:var(--bg-tertiary);padding:1px 4px;border-radius:3px;font-size:11px">$1</code>').replace(/^- (.+)$/gm, '<div style="padding-left:12px;margin:2px 0">\u2022 $1</div>').replace(/\n/g, "<br>");
  }
  function renderAgentList() {
    const { memory, memorySelectedAgent } = state;
    if (!memory.length) {
      return `
      <div class="empty-state" style="padding:40px 20px">
        <div class="empty-state-icon">\u{1F9E0}</div>
        <div class="empty-state-text">No agent memory yet</div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:6px">
          Agents write memory as they work.<br>
          Add agents from the Team page to get started.
        </div>
      </div>`;
    }
    return memory.map((agent) => {
      const isSelected = memorySelectedAgent === agent.name;
      const dailyCount = agent.files.filter((f) => f.type === "daily").length;
      const hasLongTerm = agent.files.some((f) => f.type === "long-term");
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
  function renderFileList() {
    const agent = state.memory.find((a) => a.name === state.memorySelectedAgent);
    if (!agent) {
      return `<div style="padding:30px;text-align:center;color:var(--text-muted);font-size:12px">
      Select an agent to view memory files
    </div>`;
    }
    if (!agent.files.length) {
      return `<div class="empty-state" style="padding:30px">
      <div class="empty-state-icon">\u{1F4DD}</div>
      <div class="empty-state-text">No memory files yet</div>
      <div style="font-size:11px;color:var(--text-muted);margin-top:4px">
        This agent hasn't written any memory.
      </div>
    </div>`;
    }
    const longTerm = agent.files.filter((f) => f.type === "long-term");
    const daily = agent.files.filter((f) => f.type === "daily");
    let html = "";
    if (longTerm.length) {
      html += '<div class="memory-file-section-label">Long-term Memory</div>';
      html += longTerm.map((f) => renderFileItem(agent.name, f)).join("");
    }
    if (daily.length) {
      html += '<div class="memory-file-section-label">Daily Notes</div>';
      html += daily.map((f) => renderFileItem(agent.name, f)).join("");
    }
    return html;
  }
  function renderFileItem(agentName, file) {
    const isSelected = state.memorySelectedFile === file.path && state.memorySelectedAgent === agentName;
    const icon = file.type === "long-term" ? "\u{1F9E0}" : "\u{1F4C5}";
    return `
    <div class="memory-file-item ${isSelected ? "selected" : ""}" onclick="window.__mc.selectMemoryFile('${escHtml(agentName)}', '${escHtml(file.path)}')">
      <div style="display:flex;align-items:center;gap:6px">
        <span style="font-size:14px">${icon}</span>
        <span class="memory-file-name">${escHtml(file.name)}</span>
      </div>
      <div class="memory-file-meta">
        <span>${formatBytes(file.size)}</span>
        <span>\xB7</span>
        <span>${timeAgo2(file.modified)}</span>
      </div>
      ${file.preview ? `<div class="memory-file-preview">${escHtml(file.preview.slice(0, 80))}${file.preview.length > 80 ? "\u2026" : ""}</div>` : ""}
    </div>`;
  }
  function renderFileContent() {
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
  function renderMemoryPage() {
    const totalFiles = state.memory.reduce((s, a) => s + a.totalFiles, 0);
    const totalAgents = state.memory.length;
    setPageContent(`
    <div class="page">
      <div class="page-header">
        <div>
          <div class="page-title">Memory</div>
          <div class="page-subtitle">
            ${totalAgents} agent${totalAgents !== 1 ? "s" : ""} \xB7 ${totalFiles} file${totalFiles !== 1 ? "s" : ""}
            <span style="color:var(--text-muted);font-size:11px;margin-left:8px">
              OpenClaw workspace memory \u2014 MEMORY.md (long-term) + daily notes
            </span>
          </div>
        </div>
        <button class="btn btn-sm btn-ghost" onclick="window.__mc.refreshMemory()">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
          Refresh
        </button>
      </div>

      ${state.memoryLoading && !state.memory.length ? '<div class="empty-state" style="margin-top:60px"><div class="loading-spinner"></div><div class="empty-state-text" style="margin-top:12px">Loading memory...</div></div>' : `
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
      if (!state.memory.length && !state.memoryLoading) {
        fetchMemory();
      }
    });
  }
  async function selectMemoryAgent(agentName) {
    state.memorySelectedAgent = agentName;
    state.memorySelectedFile = null;
    state.memoryFileContent = null;
    renderMemoryPage();
  }
  async function selectMemoryFile(agentName, filePath) {
    state.memorySelectedAgent = agentName;
    state.memorySelectedFile = filePath;
    state.memoryFileContent = null;
    renderMemoryPage();
    const content = await fetchMemoryFile(agentName, filePath);
    state.memoryFileContent = content ?? "";
    renderMemoryPage();
  }
  function toggleMemoryEdit() {
    const rendered = document.getElementById("memoryRendered");
    const editor = document.getElementById("memoryEditor");
    const actions = document.getElementById("memoryEditorActions");
    const btn = document.getElementById("memoryEditBtn");
    if (!rendered || !editor || !actions) return;
    const isEditing = editor.style.display !== "none";
    if (isEditing) {
      rendered.style.display = "";
      editor.style.display = "none";
      actions.style.display = "none";
      if (btn) btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> Edit`;
    } else {
      rendered.style.display = "none";
      editor.style.display = "";
      editor.value = state.memoryFileContent || "";
      actions.style.display = "";
      if (btn) btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> View`;
      editor.focus();
    }
  }
  function cancelMemoryEdit() {
    toggleMemoryEdit();
  }
  async function saveMemoryFile() {
    const editor = document.getElementById("memoryEditor");
    if (!editor || !state.memorySelectedAgent || !state.memorySelectedFile) return;
    const content = editor.value;
    const ok = await writeMemoryFile(state.memorySelectedAgent, state.memorySelectedFile, content);
    if (ok) {
      state.memoryFileContent = content;
      toggleMemoryEdit();
      renderMemoryPage();
    }
  }
  async function refreshMemory() {
    state.memorySelectedFile = null;
    state.memoryFileContent = null;
    await fetchMemory();
  }

  // src/mission-control/client/pages/office.ts
  var serverConfigLoaded = false;
  var availableImages = [];
  function defaultPlans() {
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
          { id: "s9", x: 42, y: 82, label: "Lounge" }
        ]
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
          { id: "s6", x: 42, y: 80, label: "Bean Bags" }
        ]
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
          { id: "s6", x: 70, y: 75, label: "Bullpen 3" }
        ]
      }
    ];
  }
  var plans = [];
  var activePlanId = "";
  var assignments = {};
  var chatMessages = [];
  var chatLoading = false;
  var dragAgent = null;
  var addingSeat = false;
  var seatBubbles = {};
  var chatDrawerOpen = false;
  var settingsDialogOpen = false;
  function loadState() {
    if (serverConfigLoaded) return;
    loadStateFromServer();
  }
  async function loadStateFromServer() {
    try {
      const [configRes, imgRes] = await Promise.all([
        fetch(`${API}/api/office/floorplans`),
        fetch(`${API}/api/office/floorplan-images`)
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
      plans = defaultPlans();
      activePlanId = plans[0]?.id || "";
      assignments = {};
      serverConfigLoaded = true;
      renderOfficePage();
    }
  }
  function saveState() {
    const config = { plans, activePlanId, assignments };
    fetch(`${API}/api/office/floorplans`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config)
    }).catch(() => {
    });
  }
  function activePlan() {
    return plans.find((p) => p.id === activePlanId) || plans[0];
  }
  function currentAssignments() {
    const plan = activePlan();
    if (!plan) return {};
    if (!assignments[plan.id]) assignments[plan.id] = {};
    return assignments[plan.id];
  }
  function enrichedAgents() {
    const cfgMap = {};
    (state.agentConfig || []).forEach((c) => {
      cfgMap[c.id] = c;
    });
    return state.agents.map((a) => {
      const cfg = cfgMap[a.name] || cfgMap[a.id] || {};
      const identity = cfg.identityFull || {};
      return {
        ...a,
        identName: cfg.identityName || identity.name || a.name,
        identEmoji: cfg.identityEmoji || identity.emoji || "",
        soulSummary: cfg.soulSummary || ""
      };
    });
  }
  function assignedAgentNames() {
    const ca = currentAssignments();
    return new Set(Object.values(ca));
  }
  function renderOfficePage() {
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
          ${agents.map((a) => renderPoolAgent(a, seated.has(a.name))).join("")}
          ${agents.length === 0 ? '<div class="office-pool-empty">No agents</div>' : ""}
        </div>
        <div class="office-chat-messages" id="officeChatMessages">
          ${chatMessages.length ? chatMessages.map((m) => renderChatBubble(m)).join("") : '<div class="office-chat-empty">Type a message to chat with your agents</div>'}
          ${chatLoading ? '<div class="office-chat-loading"><span class="office-typing">Agents are chatting\u2026</span></div>' : ""}
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
          ${agents.map((a) => renderPoolAgent(a, seated.has(a.name))).join("")}
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
  function renderFloorGrid(plan) {
    if (!plan || plan.image) return "";
    return `<div class="office-grid-bg"></div>`;
  }
  function renderSeats(plan, agents) {
    const ca = currentAssignments();
    return plan.seats.map((seat) => {
      const agentName = ca[seat.id];
      const agent = agentName ? agents.find((a) => a.name === agentName) : null;
      const color = agent ? agentColor(agent.name) : "var(--border)";
      const ini = agent ? agent.identEmoji || initials(agent.identName || agent.name) : "";
      const bubble = agent && seatBubbles[agent.name] ? seatBubbles[agent.name] : null;
      const bubbleDir = seat.x < 50 ? "right" : "left";
      const bubbleText = bubble ? bubble.text : "";
      const truncated = bubbleText.length > 60 ? bubbleText.slice(0, 57) + "..." : bubbleText;
      const needsExpand = bubbleText.length > 60;
      return `
      <div class="office-seat ${agent ? "occupied" : "empty"}"
           style="left:${seat.x}%;top:${seat.y}%"
           data-seat-id="${seat.id}"
           title="${escHtml(seat.label || seat.id)}${agent ? " \u2014 " + escHtml(agent.identName || agent.name) : ""}">
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
        ${agent ? `<button class="office-seat-remove" data-unseat="${seat.id}" title="Remove">\xD7</button>` : ""}
      </div>
    `;
    }).join("");
  }
  function renderPoolAgent(agent, isSeated) {
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
          ${agent.status === "working" ? "\u25CF active" : "\u25CB idle"}
        </div>
      </div>
      ${isSeated ? '<span class="office-pool-seated-badge">seated</span>' : ""}
    </div>
  `;
  }
  function renderChatBubble(msg) {
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
  function renderSettingsDialog() {
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
            ${plans.map((p) => `
              <div class="office-settings-plan-item ${p.id === activePlanId ? "active" : ""}" data-plan-id="${escHtml(p.id)}">
                <div class="office-settings-plan-thumb" style="${p.image ? `background-image:url(${p.image});background-size:cover;background-position:center;` : "background:var(--bg-surface);"}">
                  ${p.image ? "" : '<span style="font-size:18px;opacity:0.3">\u229E</span>'}
                </div>
                <div class="office-settings-plan-info">
                  <div class="office-settings-plan-name">${escHtml(p.name)}</div>
                  <div class="office-settings-plan-meta">${p.seats.length} seats${p.image ? " \xB7 custom image" : " \xB7 grid"}</div>
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
                ${availableImages.map((img) => `<option value="${escHtml(img)}" ${plan.image === img ? "selected" : ""}>${escHtml(img.split("/").pop() || img)}</option>`).join("")}
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
  function bindOfficeEvents() {
    document.getElementById("officeSettingsBtn")?.addEventListener("click", () => {
      settingsDialogOpen = !settingsDialogOpen;
      renderOfficePage();
    });
    document.getElementById("officeChatExpand")?.addEventListener("click", () => {
      chatDrawerOpen = true;
      renderOfficePage();
    });
    document.getElementById("officePanelCollapse")?.addEventListener("click", () => {
      chatDrawerOpen = false;
      renderOfficePage();
    });
    const chatInput = document.getElementById("officeChatInput");
    const sendMsg = () => {
      if (!chatInput) return;
      const text = chatInput.value.trim();
      if (!text) return;
      chatInput.value = "";
      handleUserMessage(text);
    };
    chatInput?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") sendMsg();
    });
    document.getElementById("officeChatSend")?.addEventListener("click", sendMsg);
    if (settingsDialogOpen) {
      bindSettingsDialogEvents();
    }
    bindBubbleClicks();
    document.getElementById("officeFloor")?.addEventListener("click", (e) => {
      if (!addingSeat) return;
      const floor = document.getElementById("officeFloor");
      const rect = floor.getBoundingClientRect();
      const x = Math.round((e.clientX - rect.left) / rect.width * 100);
      const y = Math.round((e.clientY - rect.top) / rect.height * 100);
      const plan = activePlan();
      if (!plan) return;
      const id = "s" + (plan.seats.length + 1) + "-" + Date.now();
      plan.seats.push({ id, x, y, label: `Seat ${plan.seats.length + 1}` });
      addingSeat = false;
      floor.style.cursor = "";
      saveState();
      renderOfficePage();
    });
    bindDragDrop();
    document.querySelectorAll("[data-unseat]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const seatId = el.dataset.unseat;
        const ca = currentAssignments();
        delete ca[seatId];
        saveState();
        renderOfficePage();
      });
    });
  }
  function bindSettingsDialogEvents() {
    document.getElementById("officeSettingsClose")?.addEventListener("click", () => {
      settingsDialogOpen = false;
      renderOfficePage();
    });
    document.getElementById("officeSettingsOverlay")?.addEventListener("click", (e) => {
      if (e.target.id === "officeSettingsOverlay") {
        settingsDialogOpen = false;
        renderOfficePage();
      }
    });
    document.querySelectorAll("[data-plan-id]").forEach((el) => {
      el.addEventListener("click", () => {
        activePlanId = el.dataset.planId;
        saveState();
        renderOfficePage();
      });
    });
    document.getElementById("officeSettingsSave")?.addEventListener("click", () => {
      const plan = activePlan();
      if (!plan) return;
      const nameInput = document.getElementById("officeSettingsName");
      const imgSelect = document.getElementById("officeSettingsImage");
      if (nameInput) plan.name = nameInput.value || plan.name;
      if (imgSelect) plan.image = imgSelect.value;
      document.querySelectorAll(".office-settings-seat-label").forEach((el) => {
        const idx = parseInt(el.dataset.seatIdx, 10);
        if (plan.seats[idx]) plan.seats[idx].label = el.value;
      });
      saveState();
      renderOfficePage();
    });
    document.querySelectorAll("[data-delete-seat]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const plan = activePlan();
        if (!plan) return;
        const idx = parseInt(el.dataset.deleteSeat, 10);
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
    document.getElementById("officeSettingsAddSeat")?.addEventListener("click", () => {
      addingSeat = true;
      settingsDialogOpen = false;
      const floor = document.getElementById("officeFloor");
      if (floor) floor.style.cursor = "crosshair";
      renderOfficePage();
    });
    document.getElementById("officeAddPlan")?.addEventListener("click", () => {
      const id = "plan-" + Date.now();
      plans.push({
        id,
        name: "New Floor Plan",
        image: "",
        seats: [
          { id: "s1", x: 30, y: 30, label: "Seat 1" },
          { id: "s2", x: 60, y: 30, label: "Seat 2" },
          { id: "s3", x: 45, y: 65, label: "Seat 3" }
        ]
      });
      activePlanId = id;
      saveState();
      renderOfficePage();
    });
    document.getElementById("officeDeletePlan")?.addEventListener("click", () => {
      const plan = activePlan();
      if (!plan) return;
      if (!confirm(`Delete floor plan "${plan.name}"?`)) return;
      plans = plans.filter((p) => p.id !== plan.id);
      delete assignments[plan.id];
      activePlanId = plans[0]?.id || "";
      if (!plans.length) plans = defaultPlans();
      saveState();
      renderOfficePage();
    });
  }
  function bindDragDrop() {
    document.querySelectorAll(".office-pool-agent[draggable='true']").forEach((el) => {
      el.addEventListener("dragstart", (e) => {
        dragAgent = el.dataset.agentName || null;
        e.dataTransfer?.setData("text/plain", dragAgent || "");
        el.classList.add("dragging");
      });
      el.addEventListener("dragend", () => {
        dragAgent = null;
        el.classList.remove("dragging");
        document.querySelectorAll(".office-seat").forEach((s) => s.classList.remove("drag-over"));
      });
    });
    document.querySelectorAll(".office-seat").forEach((el) => {
      el.addEventListener("dragover", (e) => {
        e.preventDefault();
        el.classList.add("drag-over");
      });
      el.addEventListener("dragleave", () => {
        el.classList.remove("drag-over");
      });
      el.addEventListener("drop", (e) => {
        e.preventDefault();
        el.classList.remove("drag-over");
        const agentName = e.dataTransfer?.getData("text/plain");
        const seatId = el.dataset.seatId;
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
  async function handleUserMessage(text) {
    const ca = currentAssignments();
    const seatedNames = Object.values(ca);
    chatMessages.push({ from: "You", emoji: "\u{1F464}", text, timestamp: (/* @__PURE__ */ new Date()).toISOString() });
    const wasDrawerOpen = chatDrawerOpen;
    chatDrawerOpen = true;
    if (!wasDrawerOpen) {
      renderOfficePage();
    } else {
      updateChatLog();
    }
    if (text.startsWith("/task ")) {
      const taskTitle = text.slice(6).trim();
      if (!taskTitle) return;
      chatLoading = true;
      updateChatLog();
      try {
        const r = await fetch(`${API}/api/queue/add`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: taskTitle })
        });
        const data = await r.json();
        chatLoading = false;
        if (data.ok) {
          chatMessages.push({ from: "System", emoji: "\u2705", text: `Task created: ${taskTitle}${data.item?.assignee ? " \u2192 " + data.item.assignee : ""}`, timestamp: (/* @__PURE__ */ new Date()).toISOString() });
        } else {
          chatMessages.push({ from: "System", emoji: "\u274C", text: data.error || "Failed to create task", timestamp: (/* @__PURE__ */ new Date()).toISOString() });
        }
      } catch (err) {
        chatLoading = false;
        chatMessages.push({ from: "System", emoji: "\u274C", text: `Error: ${err.message}`, timestamp: (/* @__PURE__ */ new Date()).toISOString() });
      }
      updateChatLog();
      return;
    }
    if (seatedNames.length === 0) {
      chatMessages.push({ from: "System", emoji: "\u{1F514}", text: "Seat an agent on the floor to chat!", timestamp: (/* @__PURE__ */ new Date()).toISOString() });
      updateChatLog();
      return;
    }
    chatLoading = true;
    updateChatLog();
    try {
      const r = await fetch(`${API}/api/office/userchat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, agents: seatedNames })
      });
      const data = await r.json();
      chatLoading = false;
      if (data.reply) {
        const rawId = data.agentId || seatedNames[0];
        const displayName = data.agent || rawId;
        const msg = {
          from: displayName,
          emoji: data.emoji || displayName.slice(0, 1).toUpperCase(),
          text: data.reply,
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        };
        chatMessages.push(msg);
        const isSeated = Object.values(ca).includes(rawId);
        if (isSeated) {
          seatBubbles[rawId] = msg;
        }
      } else if (data.error) {
        chatMessages.push({ from: "System", emoji: "\u274C", text: data.error, timestamp: (/* @__PURE__ */ new Date()).toISOString() });
      }
    } catch (err) {
      chatLoading = false;
      chatMessages.push({ from: "System", emoji: "\u274C", text: `Error: ${err.message}`, timestamp: (/* @__PURE__ */ new Date()).toISOString() });
    }
    updateFloorBubbles();
    updateChatLog();
  }
  function updateFloorBubbles() {
    const plan = activePlan();
    if (!plan) return;
    const agents = enrichedAgents();
    const floor = document.getElementById("officeFloor");
    if (!floor) return;
    floor.querySelectorAll(".office-seat").forEach((el) => el.remove());
    floor.insertAdjacentHTML("beforeend", renderSeats(plan, agents));
    bindSeatDropTargets();
    bindUnseatButtons();
    bindBubbleClicks();
  }
  function updateChatLog() {
    if (chatMessages.length && !chatDrawerOpen) {
      chatDrawerOpen = true;
      renderOfficePage();
      return;
    }
    const el = document.getElementById("officeChatMessages");
    if (!el) return;
    el.innerHTML = chatMessages.map((m) => renderChatBubble(m)).join("") + (chatLoading ? '<div class="office-chat-loading"><span class="office-typing">Agents are chatting\u2026</span></div>' : "");
    el.scrollTop = el.scrollHeight;
  }
  function bindSeatDropTargets() {
    document.querySelectorAll(".office-seat").forEach((el) => {
      el.addEventListener("dragover", (e) => {
        e.preventDefault();
        el.classList.add("drag-over");
      });
      el.addEventListener("dragleave", () => {
        el.classList.remove("drag-over");
      });
      el.addEventListener("drop", (e) => {
        e.preventDefault();
        el.classList.remove("drag-over");
        const agentName = e.dataTransfer?.getData("text/plain");
        const seatId = el.dataset.seatId;
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
  function bindUnseatButtons() {
    document.querySelectorAll("[data-unseat]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const seatId = el.dataset.unseat;
        const ca = currentAssignments();
        delete ca[seatId];
        saveState();
        renderOfficePage();
      });
    });
  }
  function bindBubbleClicks() {
    document.querySelectorAll(".office-speech-clickable").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const from = el.dataset.bubbleFrom || "Agent";
        const full = el.dataset.bubbleFull || "";
        showBubbleModal(from, full);
      });
    });
  }
  function showBubbleModal(from, text) {
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
  function officeSelectPlan(planId) {
    activePlanId = planId;
    saveState();
    renderOfficePage();
  }

  // src/mission-control/client/pages/settings.ts
  var settings = { openaiKey: "", openaiKeySet: false, conversationModel: "gpt-4o-mini" };
  var saving = false;
  var saveStatus = "idle";
  var loaded = false;
  async function loadSettings() {
    try {
      const res = await fetch(`${API}/api/settings`);
      if (res.ok) {
        const data = await res.json();
        settings = {
          openaiKey: "",
          // never show actual key in input — just track if set
          openaiKeySet: data.openaiKeySet || false,
          conversationModel: data.conversationModel || "gpt-4o-mini"
        };
      }
      loaded = true;
    } catch {
      loaded = true;
    }
  }
  async function saveSettings() {
    saving = true;
    saveStatus = "idle";
    renderSettingsPage();
    try {
      const res = await fetch(`${API}/api/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings)
      });
      if (!res.ok) throw new Error("Save failed");
      saveStatus = "saved";
    } catch {
      saveStatus = "error";
    }
    saving = false;
    renderSettingsPage();
    if (saveStatus === "saved") {
      setTimeout(() => {
        saveStatus = "idle";
        renderSettingsPage();
      }, 2500);
    }
  }
  async function renderSettingsPage() {
    if (!loaded) {
      await loadSettings();
    }
    const keyStatus = settings.openaiKeySet && !settings.openaiKey ? '<div class="settings-key-preview">\u2713 Key is configured (enter a new value to change)</div>' : "";
    setPageContent(`
    <div class="settings-page">
      <div class="page-title">Settings</div>
      <div class="page-subtitle">Configure Mission Control preferences</div>

      <div class="settings-section">
        <div class="settings-section-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          Office Conversations \u2014 AI Provider
        </div>
        <div class="settings-card">
          <div class="settings-field">
            <label class="settings-label">OpenAI API Key</label>
            <div class="settings-hint">Used for office agent conversations. When set, conversations use the OpenAI API directly. When empty, falls back to OpenClaw gateway.</div>
            <div class="settings-input-row">
              <input type="password" class="input settings-key-input" id="settingsOpenAIKey"
                     value="${escHtml(settings.openaiKey)}"
                     placeholder="${settings.openaiKeySet ? "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" : "sk-..."}" autocomplete="off" />
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
            ${saveStatus === "saved" ? '<span class="settings-status settings-status-ok">\u2713 Saved</span>' : ""}
            ${saveStatus === "error" ? '<span class="settings-status settings-status-err">\u2715 Failed to save</span>' : ""}
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
  function bindSettingsEvents() {
    const keyInput = document.getElementById("settingsOpenAIKey");
    document.getElementById("settingsToggleKey")?.addEventListener("click", () => {
      if (!keyInput) return;
      keyInput.type = keyInput.type === "password" ? "text" : "password";
    });
    keyInput?.addEventListener("input", () => {
      settings.openaiKey = keyInput.value.trim();
    });
    const modelSelect = document.getElementById("settingsModel");
    modelSelect?.addEventListener("change", () => {
      settings.conversationModel = modelSelect.value;
    });
    document.getElementById("settingsSave")?.addEventListener("click", () => {
      saveSettings();
    });
  }

  // src/mission-control/client/main.ts
  window.__mc = {
    navigate,
    showAddAgentModal,
    closeAddAgentModal,
    submitAddAgent,
    showRoleCardModal,
    closeRoleCardModal,
    submitRoleCard,
    selectRolePreset,
    showManageSkillsModal,
    closeManageSkillsModal,
    submitManageSkills,
    handleDeleteAgent,
    handleApplyRole,
    toggleAgentDetail,
    deployTemplate,
    showAgentConfigModal,
    closeAgentConfigModal,
    switchConfigTab,
    saveAgentConfig,
    saveAgentFile,
    editAgentFile,
    openCommander,
    closeCommander,
    renderPage,
    selectMemoryAgent,
    selectMemoryFile,
    toggleMemoryEdit,
    cancelMemoryEdit,
    saveMemoryFile,
    refreshMemory,
    officeSelectPlan
  };
  function initEventBindings() {
    $("sidebarToggle")?.addEventListener("click", () => {
      const sb = $("sidebar");
      if (!sb) return;
      sb.classList.toggle("collapsed");
      if (window.innerWidth <= 900) sb.classList.toggle("show");
    });
    document.querySelectorAll(".sidebar-item[data-page]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.preventDefault();
        navigate(el.dataset.page || "dashboard");
        if (window.innerWidth <= 900) $("sidebar")?.classList.remove("show");
      });
    });
    $("themeToggle")?.addEventListener("click", toggleTheme);
    $("commanderTrigger")?.addEventListener("click", openCommander);
    initCommanderBindings();
    document.addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (state.commanderOpen) closeCommander();
        else openCommander();
      }
      if (e.key === "Escape" && state.commanderOpen) closeCommander();
    });
  }
  (async function boot() {
    initTheme();
    loadAgentSkills();
    updateClock();
    setInterval(updateClock, 1e3);
    initEventBindings();
    registerPage("dashboard", renderDashboardPage);
    registerPage("feed", renderFeedPage);
    registerPage("tasks", renderTasksPage);
    registerPage("queue", renderQueuePage);
    registerPage("team", renderTeamPage);
    registerPage("skills", renderSkillsPage);
    registerPage("usage", renderUsagePage);
    registerPage("gateway", renderGatewayPage);
    registerPage("memory", renderMemoryPage);
    registerPage("office", renderOfficePage);
    registerPage("settings", renderSettingsPage);
    await fetchDashboard();
    await fetchSkills();
    fetchAgentConfig();
    if (state.skills.length) renderPage();
    initRouter();
    connectSSE();
    setInterval(fetchDashboard, 6e4);
    setInterval(fetchSkills, 12e4);
  })();
})();
