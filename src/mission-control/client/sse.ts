/**
 * Mission Control — SSE (Server-Sent Events) connection.
 */

import { state } from "./state.js";
import { renderSidebarBadges } from "./navbar.js";
import { fetchDashboard, API } from "./api.js";
import { renderPage } from "./router.js";
import { appendFeedItemToDOM, renderLogIntoFeed } from "./pages/feed.js";

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
        const container = document.getElementById("feedListContainer");
        if (container) appendFeedItemToDOM(container, event, true);
      }
    } catch { /* ignore malformed events */ }
  });

  evtSource.addEventListener("gateway:log", (e) => {
    try {
      const entry = JSON.parse(e.data);
      if (state.currentPage === "feed" && state.activeFeedTab === "all") {
        const container = document.getElementById("feedListContainer");
        if (container) renderLogIntoFeed(container, entry);
      }
    } catch { /* ignore */ }
  });

  evtSource.addEventListener("state:refresh", async () => {
    await fetchDashboard();
    renderPage();
  });

  evtSource.addEventListener("agents:changed", async () => {
    await fetchDashboard();
    renderPage();
  });

  evtSource.onerror = () => {
    evtSource.close();
    setTimeout(connectSSE, 5000);
  };
}
