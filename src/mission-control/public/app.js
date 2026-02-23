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
  function debouncedRenderPage() {
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
        const container = $("feedListContainer");
        if (container) container.innerHTML = renderFeedItems(getFilteredFeed());
        bindFeedClicks();
      });
      $("debugToggle")?.addEventListener("change", () => {
        state.hideDebug = !$("debugToggle").checked;
        const container = $("feedListContainer");
        if (container) container.innerHTML = renderFeedItems(getFilteredFeed());
        bindFeedClicks();
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
    return items.map((ev, i) => {
      const bodyPreview = ev.body ? cleanResponseText(ev.body).slice(0, 140) : "";
      return `
    <div class="feed-item ${i === 0 ? "new" : ""}" data-feed-idx="${i}" style="cursor:pointer">
      <div class="feed-icon ${ev.type || "system"}">${ev.icon ? escHtml(ev.icon) : iconMap[ev.type] || "\u2022"}</div>
      <div class="feed-content">
        <div class="feed-title">${escHtml(ev.title)}</div>
        <div class="feed-detail">${escHtml(ev.detail || "")}</div>
        ${bodyPreview ? `<div class="feed-body-preview">${escHtml(bodyPreview)}${ev.body.length > 140 ? "\u2026" : ""}</div>` : ""}
      </div>
      <div class="feed-time">${timeAgo(ev.timestamp)}</div>
    </div>`;
    }).join("");
  }
  var _lastFilteredFeed = [];
  function bindFeedClicks() {
    _lastFilteredFeed = getFilteredFeed();
    const container = $("feedListContainer");
    if (!container) return;
    container.addEventListener("click", onFeedItemClick);
  }
  function onFeedItemClick(e) {
    const row = e.target.closest(".feed-item[data-feed-idx]");
    if (!row) return;
    const idx = parseInt(row.dataset.feedIdx || "", 10);
    if (isNaN(idx) || idx < 0 || idx >= _lastFilteredFeed.length) return;
    showFeedDetailModal(_lastFilteredFeed[idx]);
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
    const icon = ev.icon || iconMap[type] || "\u2022";
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
  function renderLogIntoFeed(container, entry) {
    const levelClass = entry.level === "error" || entry.level === "warn" ? "error" : "";
    const isDebug = entry.level === "debug";
    if (isDebug && state.hideDebug) return;
    const time = entry.time ? new Date(entry.time).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "";
    const subsystem = entry.subsystem ? `[${entry.subsystem}]` : "";
    const div = document.createElement("div");
    div.className = `feed-item log-item ${levelClass}${isDebug ? " debug-item" : ""}`;
    div.innerHTML = `
    <div class="feed-icon ${levelClass ? "error" : "system"}">${entry.level === "error" || entry.level === "warn" ? "\u26A0" : "\u203A"}</div>
    <div class="feed-content">
      <div class="feed-title log-msg">${escHtml((entry.message || "").slice(0, 200))}</div>
      <div class="feed-detail">${escHtml(subsystem)} \xB7 ${escHtml(entry.level || "")}</div>
    </div>
    <div class="feed-time">${time}</div>
  `;
    if (container.firstChild) container.insertBefore(div, container.firstChild);
    else container.appendChild(div);
    while (container.children.length > 200) container.removeChild(container.lastChild);
  }
  function appendFeedItemToDOM(container, ev, prepend) {
    const bodyPreview = ev.body ? cleanResponseText(ev.body).slice(0, 140) : "";
    const div = document.createElement("div");
    div.className = "feed-item new";
    div.innerHTML = `
    <div class="feed-icon ${ev.type || "system"}">${iconMap[ev.type] || "\u2022"}</div>
    <div class="feed-content">
      <div class="feed-title">${escHtml(ev.title)}</div>
      <div class="feed-detail">${escHtml(ev.detail || "")}</div>
      ${bodyPreview ? `<div class="feed-body-preview">${escHtml(bodyPreview)}${ev.body.length > 140 ? "\u2026" : ""}</div>` : ""}
    </div>
    <div class="feed-time">${timeAgo(ev.timestamp)}</div>
  `;
    if (prepend && container.firstChild) container.insertBefore(div, container.firstChild);
    else container.appendChild(div);
    while (container.children.length > 200) container.removeChild(container.lastChild);
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
        if (state.currentPage === "feed") {
          const tab = state.activeFeedTab;
          if (tab === "all" || event.type === tab) {
            const container = document.getElementById("feedListContainer");
            if (container) {
              const empty = container.querySelector(".empty-state");
              if (empty) empty.remove();
              appendFeedItemToDOM(container, event, true);
            }
          }
        }
      } catch {
      }
    });
    evtSource.addEventListener("log:entry", (e) => {
      try {
        const entry = JSON.parse(e.data);
        const subsystem = entry.subsystem || "";
        const isAgent = subsystem.startsWith("agent");
        const isDebug = entry.level === "debug";
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
        if (isDebug && state.hideDebug) return;
        if (state.currentPage === "feed") {
          const tab = state.activeFeedTab;
          const showOnTab = tab === "all" || tab === "agent" && isAgent || tab === "error" && (entry.level === "error" || entry.level === "fatal") || tab === "system" && !isAgent;
          if (showOnTab) {
            const container = document.getElementById("feedListContainer");
            if (container) {
              const empty = container.querySelector(".empty-state");
              if (empty) empty.remove();
              renderLogIntoFeed(container, entry);
            }
          }
        }
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
            <div class="feed-list">${renderFeedItems(state.feed.slice(0, 8))}</div>
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
  `);
  }
  function renderMiniAgentList(agents) {
    if (!agents.length) {
      return '<div class="empty-state"><div class="empty-state-icon">\u{1F99E}</div><div class="empty-state-text">No agents detected. Start OpenClaw to begin.</div></div>';
    }
    return agents.map((a) => {
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
    return `
    <div class="agent-config-section">
      <div class="rolecard-section-label">Agent Skills</div>
      <div style="font-size:11px;color:var(--text-muted);margin-bottom:8px">
        Select data skills to assign to <strong>${escHtml(agentName)}</strong>. Skills determine what tools and integrations this agent can use.
      </div>
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
      const checkboxes = document.querySelectorAll("#rc-skills input[type=checkbox]:checked");
      const selected = Array.from(checkboxes).map((cb) => cb.value);
      await saveAgentSkillsToServer(agentName, selected);
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
    const checkboxes = document.querySelectorAll("#rc-skills input[type=checkbox]:checked");
    const selected = Array.from(checkboxes).map((cb) => cb.value);
    await saveAgentSkillsToServer(agentName, selected);
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
  function timeAgo3(iso) {
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
        <span>${timeAgo3(file.modified)}</span>
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
    refreshMemory
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
