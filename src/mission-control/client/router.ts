/**
 * Mission Control — Hash-based page router.
 */

import { state } from "./state.js";
import { $ } from "./utils.js";

// ── Page registry ────────────────────────────────────────────────────
// Populated by registerPage() at boot time.

type PageRenderer = () => void;
const PAGES: Record<string, PageRenderer> = {};

export function registerPage(name: string, renderer: PageRenderer): void {
  PAGES[name] = renderer;
}

// ── Navigation ───────────────────────────────────────────────────────

export function navigate(page: string): void {
  if (!PAGES[page]) page = "dashboard";
  state.currentPage = page;
  window.location.hash = page;

  document.querySelectorAll(".sidebar-item").forEach(el => {
    el.classList.toggle("active", (el as HTMLElement).dataset.page === page);
  });

  // Clear cached HTML so setPageContent always applies on navigation
  const main = $("mainContent") as any;
  if (main) main._lastPageHTML = "";
  renderPage();
}

// ── Content setter ───────────────────────────────────────────────────

/**
 * Set page content only if it actually changed — eliminates DOM flicker.
 */
export function setPageContent(html: string, onMount?: () => void): void {
  const main = $("mainContent") as any;
  if (!main) return;
  if (main._lastPageHTML === html) return;
  main._lastPageHTML = html;
  main.innerHTML = html;
  if (onMount) onMount();
}

// ── Render ───────────────────────────────────────────────────────────

export function renderPage(): void {
  const fn = PAGES[state.currentPage];
  if (fn) fn();
}

let _renderDebounce: ReturnType<typeof setTimeout> | null = null;

export function debouncedRenderPage(): void {
  if (_renderDebounce) clearTimeout(_renderDebounce);
  _renderDebounce = setTimeout(() => {
    _renderDebounce = null;
    renderPage();
  }, 100);
}

// ── Init ─────────────────────────────────────────────────────────────

export function initRouter(): void {
  const hash = window.location.hash.slice(1) || "dashboard";
  navigate(hash);
  window.addEventListener("hashchange", () => {
    const h = window.location.hash.slice(1) || "dashboard";
    if (h !== state.currentPage) navigate(h);
  });
}
