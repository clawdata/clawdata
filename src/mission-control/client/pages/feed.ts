/**
 * Mission Control — Feed page.
 */

import { state } from "../state.js";
import { $, escHtml, timeAgo } from "../utils.js";
import { setPageContent, renderPage } from "../router.js";
import { openModal } from "../modal.js";

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
      const container = $("feedListContainer");
      if (container) container.innerHTML = renderFeedItems(getFilteredFeed());
      bindFeedClicks();
    });

    $("debugToggle")?.addEventListener("change", () => {
      state.hideDebug = !($("debugToggle") as HTMLInputElement).checked;
      const container = $("feedListContainer");
      if (container) container.innerHTML = renderFeedItems(getFilteredFeed());
      bindFeedClicks();
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
  return items.map((ev, i) => {
    const bodyPreview = ev.body ? cleanResponseText(ev.body).slice(0, 140) : "";
    return `
    <div class="feed-item ${i === 0 ? "new" : ""}" data-feed-idx="${i}" style="cursor:pointer">
      <div class="feed-icon ${ev.type || "system"}">${ev.icon ? escHtml(ev.icon) : (iconMap[ev.type] || "•")}</div>
      <div class="feed-content">
        <div class="feed-title">${escHtml(ev.title)}</div>
        <div class="feed-detail">${escHtml(ev.detail || "")}</div>
        ${bodyPreview ? `<div class="feed-body-preview">${escHtml(bodyPreview)}${ev.body.length > 140 ? "…" : ""}</div>` : ""}
      </div>
      <div class="feed-time">${timeAgo(ev.timestamp)}</div>
    </div>`;
  }).join("");
}

// ── Click-to-expand ─────────────────────────────────────────────────

/** Cache of the last filtered feed so click handlers can look up the event. */
let _lastFilteredFeed: any[] = [];

function bindFeedClicks(): void {
  _lastFilteredFeed = getFilteredFeed();
  const container = $("feedListContainer");
  if (!container) return;
  container.addEventListener("click", onFeedItemClick);
}

function onFeedItemClick(e: Event): void {
  const row = (e.target as HTMLElement).closest(".feed-item[data-feed-idx]") as HTMLElement | null;
  if (!row) return;
  const idx = parseInt(row.dataset.feedIdx || "", 10);
  if (isNaN(idx) || idx < 0 || idx >= _lastFilteredFeed.length) return;
  showFeedDetailModal(_lastFilteredFeed[idx]);
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

function showFeedDetailModal(ev: any): void {
  const m = openModal({ maxWidth: "520px" });

  const type = ev.type || "system";
  const icon = ev.icon || iconMap[type] || "•";
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
  const div = document.createElement("div");
  div.className = "feed-item new";
  div.innerHTML = `
    <div class="feed-icon ${ev.type || "system"}">${iconMap[ev.type] || "•"}</div>
    <div class="feed-content">
      <div class="feed-title">${escHtml(ev.title)}</div>
      <div class="feed-detail">${escHtml(ev.detail || "")}</div>
      ${bodyPreview ? `<div class="feed-body-preview">${escHtml(bodyPreview)}${ev.body.length > 140 ? "…" : ""}</div>` : ""}
    </div>
    <div class="feed-time">${timeAgo(ev.timestamp)}</div>
  `;
  if (prepend && container.firstChild) container.insertBefore(div, container.firstChild);
  else container.appendChild(div);
  while (container.children.length > 200) container.removeChild(container.lastChild!);
}
