/**
 * Mission Control — Feed page.
 */

import { state } from "../state.js";
import { $, escHtml, timeAgo } from "../utils.js";
import { setPageContent, renderPage } from "../router.js";

export function renderFeedPage(): void {
  setPageContent(`
    <div class="page">
      <div class="page-header">
        <div>
          <div class="page-title">Live Feed</div>
          <div class="page-subtitle">${state.feed.length} events</div>
        </div>
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
    });
  });
}

function getFilteredFeed() {
  return state.activeFeedTab === "all"
    ? state.feed.slice(0, 100)
    : state.feed.filter(f => f.type === state.activeFeedTab).slice(0, 100);
}

const iconMap: Record<string, string> = {
  system: "⚙", plan: "📋", task: "📦", agent: "🤖", error: "⚠", pipeline: "🔄",
};

export function renderFeedItems(items: any[]): string {
  if (!items.length) {
    return '<div class="empty-state"><div class="empty-state-icon">📡</div><div class="empty-state-text">Waiting for events...</div></div>';
  }
  return items.map((ev, i) => `
    <div class="feed-item ${i === 0 ? "new" : ""}">
      <div class="feed-icon ${ev.type || "system"}">${iconMap[ev.type] || "•"}</div>
      <div class="feed-content">
        <div class="feed-title">${escHtml(ev.title)}</div>
        <div class="feed-detail">${escHtml(ev.detail || "")}</div>
      </div>
      <div class="feed-time">${timeAgo(ev.timestamp)}</div>
    </div>
  `).join("");
}

export function renderLogIntoFeed(container: HTMLElement, entry: any): void {
  if (state.activeFeedTab !== "all") return;
  const levelClass = entry.level === "error" || entry.level === "warn" ? "error" : "";
  const time = entry.time
    ? new Date(entry.time).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "";
  const subsystem = entry.subsystem ? `[${entry.subsystem}]` : "";
  const div = document.createElement("div");
  div.className = `feed-item log-item ${levelClass}`;
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
  const div = document.createElement("div");
  div.className = "feed-item new";
  div.innerHTML = `
    <div class="feed-icon ${ev.type || "system"}">${iconMap[ev.type] || "•"}</div>
    <div class="feed-content">
      <div class="feed-title">${escHtml(ev.title)}</div>
      <div class="feed-detail">${escHtml(ev.detail || "")}</div>
    </div>
    <div class="feed-time">${timeAgo(ev.timestamp)}</div>
  `;
  if (prepend && container.firstChild) container.insertBefore(div, container.firstChild);
  else container.appendChild(div);
  while (container.children.length > 200) container.removeChild(container.lastChild!);
}
