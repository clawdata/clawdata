/**
 * Mission Control — Modal Manager.
 *
 * Single source of truth for all modal/overlay behavior.
 * Handles:  backdrop click, Escape key, focus trap, stacking,
 *           and reliable single-click dismiss.
 *
 * Usage:
 *   const m = Modal.open({ maxWidth: "560px" });
 *   m.body.innerHTML = `...`;
 *   m.onClose(() => cleanup());
 *   // later: m.close();
 */

// ── Stack ────────────────────────────────────────────────────────────

const _stack: ModalInstance[] = [];

/** Global Escape handler — only the top-most modal responds. */
function _globalKeyHandler(e: KeyboardEvent) {
  if (e.key === "Escape" && _stack.length) {
    e.preventDefault();
    e.stopPropagation();
    _stack[_stack.length - 1].close();
  }
}

let _keyBound = false;
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

// ── Instance ─────────────────────────────────────────────────────────

export interface ModalOptions {
  maxWidth?: string;
  /** If true, clicking the backdrop does NOT close the modal */
  persistent?: boolean;
}

export class ModalInstance {
  readonly overlay: HTMLElement;
  readonly body: HTMLElement;
  private _closed = false;
  private _onClose: (() => void)[] = [];

  constructor(opts: ModalOptions = {}) {
    const overlay = document.createElement("div");
    overlay.className = "confirm-overlay";
    // Prevent the overlay from capturing pointer events until it's fully open
    overlay.style.pointerEvents = "none";

    const dialog = document.createElement("div");
    dialog.className = "confirm-dialog";
    dialog.style.maxWidth = opts.maxWidth || "460px";
    dialog.style.textAlign = "left";
    overlay.appendChild(dialog);

    this.overlay = overlay;
    this.body = dialog;

    // ── Backdrop close ───────────────────────────────────────────
    // Use pointerdown + pointerup to require a full click cycle on
    // the backdrop. This prevents the "click-through" problem where
    // the opening button's click event leaks into the new overlay.
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

    // Stop clicks inside the dialog from propagating to the overlay
    dialog.addEventListener("pointerdown", (e) => e.stopPropagation());
    dialog.addEventListener("pointerup", (e) => e.stopPropagation());
    dialog.addEventListener("click", (e) => e.stopPropagation());

    // ── Mount ────────────────────────────────────────────────────
    document.body.appendChild(overlay);

    // Two-frame open: first frame positions the element, second adds
    // the class so the CSS transition fires.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        overlay.classList.add("open");
        overlay.style.pointerEvents = "";  // hand back to CSS (.open → auto)
      });
    });

    _ensureKeyBinding();
    _stack.push(this);
  }

  /** Register a callback to fire when the modal is closed. */
  onClose(fn: () => void) {
    this._onClose.push(fn);
  }

  close() {
    if (this._closed) return;
    this._closed = true;

    // Remove from stack
    const idx = _stack.indexOf(this);
    if (idx !== -1) _stack.splice(idx, 1);
    _maybeUnbindKey();

    // Animate out
    this.overlay.classList.remove("open");
    this.overlay.style.pointerEvents = "none";
    setTimeout(() => this.overlay.remove(), 180);

    for (const fn of this._onClose) {
      try { fn(); } catch (e) { console.error("Modal onClose error:", e); }
    }
  }

  get isClosed() { return this._closed; }
}

// ── Convenience ──────────────────────────────────────────────────────

export function openModal(opts?: ModalOptions): ModalInstance {
  return new ModalInstance(opts);
}

/** Close the topmost modal. */
export function closeTopModal(): void {
  if (_stack.length) _stack[_stack.length - 1].close();
}

/** Close ALL open modals (e.g. on page navigation). */
export function closeAllModals(): void {
  while (_stack.length) _stack[_stack.length - 1].close();
}

// ── Confirm / Alert helpers ──────────────────────────────────────────

interface ConfirmOptions {
  title?: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

export function showConfirm(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const m = openModal({ maxWidth: "380px" });
    m.body.style.textAlign = "center";
    m.body.innerHTML = `
      <div class="confirm-icon">${opts.destructive ? "⚠" : "ℹ"}</div>
      <div class="confirm-title">${esc(opts.title || "Confirm")}</div>
      <div class="confirm-message">${esc(opts.message || "Are you sure?")}</div>
      <div class="confirm-actions">
        <button class="btn confirm-cancel">${esc(opts.cancelLabel || "Cancel")}</button>
        <button class="btn ${opts.destructive ? "confirm-destructive" : "btn-approve"} confirm-ok">${esc(opts.confirmLabel || "Confirm")}</button>
      </div>
    `;
    const done = (val: boolean) => { resolve(val); m.close(); };
    m.onClose(() => resolve(false));  // backdrop / Escape = cancel
    m.body.querySelector(".confirm-cancel")!.addEventListener("click", () => done(false));
    m.body.querySelector(".confirm-ok")!.addEventListener("click", () => done(true));
    setTimeout(() => (m.body.querySelector(".confirm-cancel") as HTMLElement)?.focus(), 60);
  });
}

interface AlertOptions {
  title?: string;
  message: string;
  buttonLabel?: string;
  variant?: "error" | "warning" | "info";
}

export function showAlert(opts: AlertOptions | string): Promise<void> {
  const o: AlertOptions = typeof opts === "string" ? { message: opts } : opts;
  const variant = o.variant || "info";
  const icon = variant === "error" ? "❌" : variant === "warning" ? "⚠" : "ℹ️";
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
    m.body.querySelector(".confirm-ok")!.addEventListener("click", () => { resolve(); m.close(); });
    setTimeout(() => (m.body.querySelector(".confirm-ok") as HTMLElement)?.focus(), 60);
  });
}

function esc(s: string): string {
  if (!s) return "";
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}
