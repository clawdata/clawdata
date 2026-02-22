/**
 * Mission Control — DOM helpers, formatters, and utilities.
 */

// ── DOM helpers ──────────────────────────────────────────────────────

export function $(id: string): HTMLElement | null {
  return document.getElementById(id);
}

export function escHtml(s: string): string {
  if (!s) return "";
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

/**
 * Set innerHTML only if content actually changed (prevents visual flicker).
 */
export function safeSetHTML(el: HTMLElement | null, html: string): boolean {
  if (!el) return false;
  if ((el as any)._lastHTML === html) return false;
  (el as any)._lastHTML = html;
  el.innerHTML = html;
  return true;
}

// ── Color helpers ────────────────────────────────────────────────────

const AGENT_COLORS = [
  "#e8724a", "#34d399", "#60a5fa", "#a78bfa", "#fbbf24",
  "#f472b6", "#22d3ee", "#fb923c", "#818cf8", "#2dd4bf",
];

export function agentColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AGENT_COLORS[Math.abs(hash) % AGENT_COLORS.length];
}

export function initials(name: string): string {
  return name.split(/[\s_-]+/).map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

// ── Time formatters ──────────────────────────────────────────────────

export function timeAgo(iso: string): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function formatTime(d: Date): string {
  return d.toLocaleTimeString("en-US", { hour12: false });
}

export function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }).toUpperCase();
}

// ── Compare helpers ──────────────────────────────────────────────────

/** Stable agent JSON: strips volatile fields for comparison */
export function stableAgentJSON(agents: any[]): string {
  return JSON.stringify(agents.map(a => ({
    id: a.id, name: a.name, role: a.role, status: a.status, model: a.model, agentId: a.agentId,
  })));
}

// ── Theme ────────────────────────────────────────────────────────────

export function initTheme(): void {
  const saved = localStorage.getItem("mc-theme") || "dark";
  document.documentElement.setAttribute("data-theme", saved);
}

export function toggleTheme(): void {
  const current = document.documentElement.getAttribute("data-theme");
  const next = current === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("mc-theme", next);
}

// ── Clock ────────────────────────────────────────────────────────────

export function updateClock(): void {
  const now = new Date();
  const time = $("clockTime");
  const date = $("clockDate");
  if (time) time.textContent = formatTime(now);
  if (date) date.textContent = formatDate(now);
}

// ── Confirm Dialog ───────────────────────────────────────────────────

interface ConfirmOptions {
  title?: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

export function showConfirmDialog(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "confirm-overlay";
    overlay.innerHTML = `
      <div class="confirm-dialog">
        <div class="confirm-icon">${opts.destructive ? '⚠' : 'ℹ'}</div>
        <div class="confirm-title">${escHtml(opts.title || "Confirm")}</div>
        <div class="confirm-message">${escHtml(opts.message || "Are you sure?")}</div>
        <div class="confirm-actions">
          <button class="btn confirm-cancel">${escHtml(opts.cancelLabel || "Cancel")}</button>
          <button class="btn ${opts.destructive ? 'confirm-destructive' : 'btn-approve'} confirm-ok">${escHtml(opts.confirmLabel || "Confirm")}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add("open"));

    const close = (result: boolean) => {
      overlay.classList.remove("open");
      setTimeout(() => overlay.remove(), 150);
      resolve(result);
    };

    overlay.querySelector(".confirm-cancel")!.addEventListener("click", () => close(false));
    overlay.querySelector(".confirm-ok")!.addEventListener("click", () => close(true));
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(false); });
    setTimeout(() => (overlay.querySelector(".confirm-cancel") as HTMLElement)?.focus(), 50);
  });
}

// ── Alert Dialog (replaces window.alert) ─────────────────────────────

interface AlertOptions {
  title?: string;
  message: string;
  buttonLabel?: string;
  variant?: "error" | "warning" | "info";
}

export function showAlertDialog(opts: AlertOptions | string): Promise<void> {
  const o: AlertOptions = typeof opts === "string" ? { message: opts } : opts;
  const variant = o.variant || "info";
  const icon = variant === "error" ? "\u274C" : variant === "warning" ? "\u26A0" : "\u2139\uFE0F";
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "confirm-overlay";
    overlay.innerHTML = `
      <div class="confirm-dialog">
        <div class="confirm-icon">${icon}</div>
        <div class="confirm-title">${escHtml(o.title || (variant === "error" ? "Error" : "Notice"))}</div>
        <div class="confirm-message">${escHtml(o.message)}</div>
        <div class="confirm-actions">
          <button class="btn btn-approve confirm-ok">${escHtml(o.buttonLabel || "OK")}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add("open"));

    const close = () => {
      overlay.classList.remove("open");
      setTimeout(() => overlay.remove(), 150);
      resolve();
    };

    overlay.querySelector(".confirm-ok")!.addEventListener("click", close);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
    setTimeout(() => (overlay.querySelector(".confirm-ok") as HTMLElement)?.focus(), 50);
  });
}
