/**
 * Mission Control — SSE (Server-Sent Events) connection.
 */

import { state } from "./state.js";
import { renderSidebarBadges } from "./navbar.js";
import { fetchDashboard, API } from "./api.js";
import { appendFeedItemToDOM, renderLogIntoFeed } from "./pages/feed.js";

/**
 * Perform a "soft refresh": fetch fresh data from the server.
 * fetchDashboard() already updates state, renders navbar/badges,
 * and queues a debouncedRenderPage(). No extra renderPage() call
 * needed here — doing so stacks event handlers on pages that use
 * setPageContent with onMount callbacks.
 */
let _softRefreshInFlight = false;
async function softRefresh(): Promise<void> {
  if (_softRefreshInFlight) return; // coalesce concurrent SSE triggers
  _softRefreshInFlight = true;
  try {
    await fetchDashboard();
  } finally {
    _softRefreshInFlight = false;
  }
}

export function connectSSE(): void {
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
    } catch { /* ignore malformed events */ }
  });

  evtSource.addEventListener("log:entry", (e) => {
    try {
      const entry = JSON.parse(e.data);
      const subsystem = entry.subsystem || "";
      const isAgent = subsystem.startsWith("agent");
      const isDebug = entry.level === "debug";

      // Store log entries as synthetic FeedEvents so they survive tab switches
      const syntheticEvent = {
        id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type: isAgent ? "agent" : (entry.level === "error" || entry.level === "fatal" ? "error" : "system"),
        title: (entry.message || "").slice(0, 200),
        detail: `${subsystem ? `[${subsystem}]` : ""} · ${entry.level || ""}`,
        timestamp: entry.time || new Date().toISOString(),
        actor: subsystem || "system",
        _isLog: true,
        _logLevel: entry.level,
      };
      state.feed.unshift(syntheticEvent as any);
      if (state.feed.length > 200) state.feed.length = 200;

      // Skip rendering debug items when hideDebug is on
      if (isDebug && state.hideDebug) return;

      if (state.currentPage === "feed") {
        const tab = state.activeFeedTab;
        const showOnTab = tab === "all"
          || (tab === "agent" && isAgent)
          || (tab === "error" && (entry.level === "error" || entry.level === "fatal"))
          || (tab === "system" && !isAgent);
        if (showOnTab) {
          const container = document.getElementById("feedListContainer");
          if (container) {
            const empty = container.querySelector(".empty-state");
            if (empty) empty.remove();
            renderLogIntoFeed(container, entry);
          }
        }
      }
    } catch { /* ignore */ }
  });

  evtSource.addEventListener("state:refresh", () => softRefresh());

  evtSource.addEventListener("agents:changed", () => softRefresh());

  evtSource.onerror = () => {
    evtSource.close();
    setTimeout(connectSSE, 5000);
  };
}
