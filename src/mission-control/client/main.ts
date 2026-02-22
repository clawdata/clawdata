/**
 * Mission Control — Boot entry point.
 *
 * Registers all pages, initialises event bindings, connects SSE,
 * and starts polling. This file is the esbuild entry → public/app.js.
 */

import { state } from "./state.js";
import { $, initTheme, toggleTheme, updateClock } from "./utils.js";
import { loadAgentSkills } from "./skills-store.js";
import { fetchDashboard, fetchSkills, fetchAgentConfig } from "./api.js";
import { renderNavbar, renderSidebarBadges } from "./navbar.js";
import { connectSSE } from "./sse.js";
import { registerPage, navigate, renderPage, initRouter } from "./router.js";
import { initCommanderBindings, openCommander, closeCommander } from "./components/commander.js";

// Pages
import { renderDashboardPage } from "./pages/dashboard.js";
import { renderFeedPage } from "./pages/feed.js";
import { renderTasksPage, renderQueuePage } from "./pages/tasks.js";
import {
  renderTeamPage,
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
} from "./pages/team.js";
import { renderSkillsPage } from "./pages/skills.js";
import { renderUsagePage } from "./pages/usage.js";
import { renderGatewayPage } from "./pages/gateway.js";
import {
  renderMemoryPage,
  selectMemoryAgent,
  selectMemoryFile,
  toggleMemoryEdit,
  cancelMemoryEdit,
  saveMemoryFile,
  refreshMemory,
} from "./pages/memory.js";

// ─── Expose handlers for inline onclick attributes ───────────────

declare global {
  interface Window {
    __mc: Record<string, (...args: any[]) => any>;
  }
}

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
};

// ─── Event Bindings ──────────────────────────────────────────────

function initEventBindings(): void {
  // Sidebar toggle
  $("sidebarToggle")?.addEventListener("click", () => {
    const sb = $("sidebar");
    if (!sb) return;
    sb.classList.toggle("collapsed");
    if (window.innerWidth <= 900) sb.classList.toggle("show");
  });

  // Sidebar navigation
  document.querySelectorAll(".sidebar-item[data-page]").forEach(el => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      navigate((el as HTMLElement).dataset.page || "dashboard");
      if (window.innerWidth <= 900) $("sidebar")?.classList.remove("show");
    });
  });

  // Theme toggle
  $("themeToggle")?.addEventListener("click", toggleTheme);

  // Commander trigger
  $("commanderTrigger")?.addEventListener("click", openCommander);

  // Commander keyboard + overlay
  initCommanderBindings();

  // Global keyboard shortcut
  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      if (state.commanderOpen) closeCommander();
      else openCommander();
    }
    if (e.key === "Escape" && state.commanderOpen) closeCommander();
  });
}

// ─── Boot ────────────────────────────────────────────────────────

(async function boot() {
  initTheme();
  loadAgentSkills();
  updateClock();
  setInterval(updateClock, 1000);

  initEventBindings();

  // Register page renderers
  registerPage("dashboard", renderDashboardPage);
  registerPage("feed", renderFeedPage);
  registerPage("tasks", renderTasksPage);
  registerPage("queue", renderQueuePage);
  registerPage("team", renderTeamPage);
  registerPage("skills", renderSkillsPage);
  registerPage("usage", renderUsagePage);
  registerPage("gateway", renderGatewayPage);
  registerPage("memory", renderMemoryPage);

  // Initial data fetch
  await fetchDashboard();
  await fetchSkills();
  fetchAgentConfig(); // fire-and-forget
  if (state.skills.length) renderPage();

  initRouter();
  connectSSE();

  // Polling — SSE handles real-time updates; these are safety nets
  setInterval(fetchDashboard, 60000);
  setInterval(fetchSkills, 120000);
})();
