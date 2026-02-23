/**
 * Mission Control — Feed page.
 */

import { state, Agent } from "../state.js";
import { $, escHtml, timeAgo } from "../utils.js";
import { setPageContent, renderPage } from "../router.js";
import { openModal } from "../modal.js";

/** Find an agent whose name matches this feed event's actor (case-insensitive). */
function findAgentForEvent(ev: any): Agent | undefined {
  const actor = (ev.actor || "").toLowerCase();
  if (!actor || actor === "system" || actor === "human") return undefined;
  return state.agents.find(a => a.name.toLowerCase() === actor || (a.identName || "").toLowerCase() === actor);
}

/** Return the agent's emoji icon if available, else fallback. */
function agentIcon(ev: any, fallback: string): string {
  const agent = findAgentForEvent(ev);
  if (agent && agent.identEmoji) return agent.identEmoji;
  return fallback;
}

// ── Thread grouping ─────────────────────────────────────────────────

interface FeedThread {
  key: string;
  events: any[];       // newest first
  count: number;
  threadTitle: string;
  threadType: "task" | "actor" | "single";
}

/** Try to extract a task name from a feed event title. */
function extractTaskTitle(ev: any): string | null {
  const title = ev.title || "";
  const m = title.match(/^(?:Task (?:created|assigned|dispatched|updated|completed)|Agent completed):\s*(.+)$/i);
  if (m) return m[1].trim();
  // "Task dispatched to AGENT" — check detail for the task name
  if (/^Task dispatched to\s+/i.test(title) && ev.detail) {
    const dm = ev.detail.match(/^"(.+?)"\s+sent to/);
    if (dm) return dm[1].trim();
  }
  return null;
}

/** Group flat feed items into threads. Items must be sorted newest-first. */
function groupIntoThreads(items: any[]): FeedThread[] {
  const threads: FeedThread[] = [];
  const taskIndex = new Map<string, FeedThread>();
  const actorIndex = new Map<string, FeedThread>();

  for (const ev of items) {
    // 1) Task lifecycle events
    const taskTitle = extractTaskTitle(ev);
    if (taskTitle) {
      const key = taskTitle.toLowerCase();
      const existing = taskIndex.get(key);
      if (existing) {
        existing.events.push(ev);
        existing.count++;
        continue;
      }
      const thread: FeedThread = {
        key: `task:${key}`, events: [ev], count: 1,
        threadTitle: taskTitle, threadType: "task",
      };
      taskIndex.set(key, thread);
      threads.push(thread);
      continue;
    }

    // 2) "responded to task" — try to join a task thread by actor + time proximity
    if (ev.detail?.includes("responded to task") && ev.actor) {
      const evTime = new Date(ev.timestamp).getTime();
      let matched = false;
      for (const [, t] of taskIndex) {
        const leadTime = new Date(t.events[0].timestamp).getTime();
        if (Math.abs(evTime - leadTime) < 10 * 60 * 1000 &&
            t.events.some((e: any) => (e.actor || "").toLowerCase() === ev.actor.toLowerCase())) {
          t.events.push(ev);
          t.count++;
          t.events.sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
          matched = true;
          break;
        }
      }
      if (matched) continue;
    }

    // 3) Actor-based burst grouping (same actor, within 5 min window)
    if (ev.actor && ev.actor !== "system" && ev.actor !== "human") {
      const actorKey = ev.actor.toLowerCase();
      const existing = actorIndex.get(actorKey);
      if (existing) {
        const oldestInBurst = new Date(existing.events[existing.events.length - 1].timestamp).getTime();
        const evTime = new Date(ev.timestamp).getTime();
        if (oldestInBurst - evTime < 5 * 60 * 1000 && oldestInBurst - evTime >= 0) {
          existing.events.push(ev);
          existing.count++;
          continue;
        }
      }
      const thread: FeedThread = {
        key: `actor:${actorKey}:${ev.id}`, events: [ev], count: 1,
        threadTitle: ev.actor, threadType: "actor",
      };
      actorIndex.set(actorKey, thread);
      threads.push(thread);
      continue;
    }

    // 4) Standalone
    threads.push({
      key: `single:${ev.id}`, events: [ev], count: 1,
      threadTitle: ev.title, threadType: "single",
    });
  }

  return threads;
}

export function renderFeedPage(): void {
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
    $("feedTabs")?.addEventListener("click", (e: Event) => {
      const tab = (e.target as HTMLElement).closest(".feed-tab") as HTMLElement | null;
      if (!tab) return;
      state.activeFeedTab = tab.dataset.feed || "all";
      $("feedTabs")?.querySelectorAll(".feed-tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      refreshFeedList();
    });

    $("debugToggle")?.addEventListener("change", () => {
      state.hideDebug = !($("debugToggle") as HTMLInputElement).checked;
      refreshFeedList();
    });

    bindFeedClicks();
  });
}

function getFilteredFeed() {
  let items = state.feed;

  // Filter by debug level
  if (state.hideDebug) {
    items = items.filter(f => {
      const ev = f as any;
      if (ev._isLog && ev._logLevel === "debug") return false;
      // Also filter out detail strings ending with "· debug"
      if (ev.detail && typeof ev.detail === "string" && ev.detail.endsWith("· debug")) return false;
      return true;
    });
  }

  // Filter by tab
  if (state.activeFeedTab !== "all") {
    items = items.filter(f => f.type === state.activeFeedTab);
  }

  return items.slice(0, 100);
}

const iconMap: Record<string, string> = {
  system: "⚙", plan: "📋", task: "📦", agent: "🤖", error: "⚠", pipeline: "🔄",
};

/** Strip task IDs (q_18_abc123) and "Task … complete:" prefixes from text. */
function cleanResponseText(text: string): string {
  return text
    .replace(/\bq_\d+_\w+\b/gi, "")
    .replace(/^Task\s+complete\s*:\s*/i, "")
    .replace(/^Task\s+\S*\s*complete\s*:\s*/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function renderFeedItems(items: any[]): string {
  if (!items.length) {
    return '<div class="empty-state"><div class="empty-state-icon">📡</div><div class="empty-state-text">Waiting for events...</div></div>';
  }
  const threads = groupIntoThreads(items);
  return threads.map((thread, ti) => {
    const ev = thread.events[0];
    const bodyPreview = ev.body ? cleanResponseText(ev.body).slice(0, 140) : "";
    const defaultIcon = ev.icon ? escHtml(ev.icon) : (iconMap[ev.type] || "•");
    const displayIcon = agentIcon(ev, defaultIcon);
    const isThread = thread.count > 1;
    return `
    <div class="feed-item${ti === 0 ? " new" : ""}${isThread ? " feed-thread-head" : ""}" data-thread-idx="${ti}" style="cursor:pointer">
      <div class="feed-icon ${ev.type || "system"}">${displayIcon}</div>
      <div class="feed-content">
        <div class="feed-title">${escHtml(ev.title)}</div>
        <div class="feed-detail">${escHtml(ev.detail || "")}</div>
        ${bodyPreview ? `<div class="feed-body-preview">${escHtml(bodyPreview)}${ev.body.length > 140 ? "…" : ""}</div>` : ""}
        ${isThread ? `<div class="feed-thread-badge"><span class="feed-thread-count">${thread.count}</span> events in thread ▸</div>` : ""}
      </div>
      <div class="feed-time">${timeAgo(ev.timestamp)}</div>
    </div>`;
  }).join("");
}

// ── Click-to-expand ─────────────────────────────────────────────────

/** Cached items for the feed page click handler. */
let _feedPageItems: any[] = [];

function bindFeedClicks(): void {
  _feedPageItems = getFilteredFeed();
  const container = $("feedListContainer");
  if (!container) return;
  container.addEventListener("click", onFeedPageClick);
}

function onFeedPageClick(e: Event): void {
  handleFeedClick(e, _feedPageItems);
}

/** Shared click handler: resolves thread index → opens thread or single detail modal. */
export function handleFeedClick(e: Event, items: any[]): void {
  const row = (e.target as HTMLElement).closest(".feed-item[data-thread-idx]") as HTMLElement | null;
  if (!row) return;
  const idx = parseInt(row.dataset.threadIdx || "", 10);
  const threads = groupIntoThreads(items);
  if (isNaN(idx) || idx < 0 || idx >= threads.length) return;
  const thread = threads[idx];
  if (thread.count > 1) showThreadDetailModal(thread);
  else showFeedDetailModal(thread.events[0]);
}

const typeLabels: Record<string, string> = {
  system: "System",
  agent: "Agent",
  task: "Task",
  pipeline: "Pipeline",
  error: "Error",
  plan: "Plan",
};

const typeBadgeColors: Record<string, string> = {
  system: "var(--accent-cyan)",
  agent: "var(--accent-green)",
  task: "var(--accent-blue)",
  pipeline: "var(--accent-purple)",
  error: "var(--accent-red)",
  plan: "var(--accent-yellow)",
};

export function showFeedDetailModal(ev: any): void {
  const m = openModal({ maxWidth: "520px" });

  const type = ev.type || "system";
  const rawIcon = ev.icon || iconMap[type] || "•";
  const icon = agentIcon(ev, rawIcon);
  const label = typeLabels[type] || type;
  const color = typeBadgeColors[type] || "var(--text-secondary)";
  const actor = ev.actor || "";
  const ts = ev.timestamp ? new Date(ev.timestamp) : null;
  const timeStr = ts
    ? ts.toLocaleString("en-AU", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })
    : "";
  const relTime = ev.timestamp ? timeAgo(ev.timestamp) : "";

  // Check for log-level data
  const isLog = (ev as any)._isLog;
  const logLevel = (ev as any)._logLevel || "";
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
        <div class="feed-detail-value">${escHtml(timeStr)}${relTime ? ` <span style="color:var(--text-muted);margin-left:8px">(${escHtml(relTime)})</span>` : ""}</div>
      </div>

      <div style="text-align:right;margin-top:20px">
        <button class="btn feed-detail-close" style="min-width:80px">Close</button>
      </div>
    </div>
  `;

  m.body.querySelector(".feed-detail-close")?.addEventListener("click", () => m.close());
}

function showThreadDetailModal(thread: FeedThread): void {
  const m = openModal({ maxWidth: "580px" });

  const lead = thread.events[0];
  const type = lead.type || "system";
  const icon = agentIcon(lead, lead.icon || iconMap[type] || "•");
  const color = typeBadgeColors[type] || "var(--text-secondary)";
  const label = thread.threadType === "task" ? "Task Thread"
    : thread.threadType === "actor" ? "Activity"
    : typeLabels[type] || type;

  const timeRange = (() => {
    const newest = new Date(thread.events[0].timestamp).getTime();
    const oldest = new Date(thread.events[thread.events.length - 1].timestamp).getTime();
    const diff = newest - oldest;
    if (diff < 60000) return "< 1 min";
    if (diff < 3600000) return `${Math.round(diff / 60000)} min`;
    return `${(diff / 3600000).toFixed(1)} hr`;
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
          const evIcon = agentIcon(ev, ev.icon || iconMap[ev.type] || "•");
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
              ${evBody ? `<div class="feed-thread-event-body">${escHtml(evBody)}${ev.body.length > 200 ? "…" : ""}</div>` : ""}
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

  // Click individual event → drill down to single detail
  m.body.querySelectorAll(".feed-thread-event").forEach(el => {
    el.addEventListener("click", () => {
      const idx = parseInt((el as HTMLElement).dataset.evtIdx || "", 10);
      if (!isNaN(idx) && idx >= 0 && idx < thread.events.length) {
        showFeedDetailModal(thread.events[idx]);
      }
    });
  });

  m.body.querySelector(".feed-detail-close")?.addEventListener("click", () => m.close());
}

// ── Refresh + append helpers ────────────────────────────────────────

/** Re-render the feed list on the feed page (called by SSE on new events). */
export function refreshFeedList(): void {
  const container = $("feedListContainer");
  if (!container) return;
  const filtered = getFilteredFeed();
  container.innerHTML = renderFeedItems(filtered);
  _feedPageItems = filtered;
  // Update subtitle count
  const subtitle = document.querySelector(".page-subtitle");
  if (subtitle) subtitle.textContent = `${filtered.length} events`;
}

// ── Log + append helpers ────────────────────────────────────────────

export function renderLogIntoFeed(container: HTMLElement, entry: any): void {
  const levelClass = entry.level === "error" || entry.level === "warn" ? "error" : "";
  const isDebug = entry.level === "debug";

  // If hideDebug, don't render debug items into the DOM at all
  if (isDebug && state.hideDebug) return;

  const time = entry.time
    ? new Date(entry.time).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "";
  const subsystem = entry.subsystem ? `[${entry.subsystem}]` : "";
  const div = document.createElement("div");
  div.className = `feed-item log-item ${levelClass}${isDebug ? " debug-item" : ""}`;
  div.innerHTML = `
    <div class="feed-icon ${levelClass ? "error" : "system"}">${entry.level === "error" || entry.level === "warn" ? "⚠" : "›"}</div>
    <div class="feed-content">
      <div class="feed-title log-msg">${escHtml((entry.message || "").slice(0, 200))}</div>
      <div class="feed-detail">${escHtml(subsystem)} · ${escHtml(entry.level || "")}</div>
    </div>
    <div class="feed-time">${time}</div>
  `;
  if (container.firstChild) container.insertBefore(div, container.firstChild);
  else container.appendChild(div);
  while (container.children.length > 200) container.removeChild(container.lastChild!);
}

export function appendFeedItemToDOM(container: HTMLElement, ev: any, prepend: boolean): void {
  const bodyPreview = ev.body ? cleanResponseText(ev.body).slice(0, 140) : "";
  const defaultIcon = iconMap[ev.type] || "•";
  const displayIcon = agentIcon(ev, defaultIcon);
  const div = document.createElement("div");
  div.className = "feed-item new";
  div.style.cursor = "pointer";
  div.innerHTML = `
    <div class="feed-icon ${ev.type || "system"}">${displayIcon}</div>
    <div class="feed-content">
      <div class="feed-title">${escHtml(ev.title)}</div>
      <div class="feed-detail">${escHtml(ev.detail || "")}</div>
      ${bodyPreview ? `<div class="feed-body-preview">${escHtml(bodyPreview)}${ev.body.length > 140 ? "…" : ""}</div>` : ""}
    </div>
    <div class="feed-time">${timeAgo(ev.timestamp)}</div>
  `;
  div.addEventListener("click", () => showFeedDetailModal(ev));
  if (prepend && container.firstChild) container.insertBefore(div, container.firstChild);
  else container.appendChild(div);
  while (container.children.length > 200) container.removeChild(container.lastChild!);
}
