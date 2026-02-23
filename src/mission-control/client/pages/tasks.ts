/**
 * Mission Control — Tasks page.
 *
 * Agent-driven task board. Humans create tasks, agents work them.
 * Uses the shared Modal manager for all overlays.
 */

import { state } from "../state.js";
import type { QueueItem, TaskActivity } from "../state.js";
import { escHtml, agentColor, initials } from "../utils.js";
import { setPageContent } from "../router.js";
import { openModal } from "../modal.js";
import {
  addQueueItem, assignQueueItem, updateQueueItem, deleteQueueItem,
  dispatchQueueItem, completeQueueItem, assignAndDispatchQueueItem,
  clearQueueItemActivity, clearAllQueueItems,
} from "../api.js";

// ── Helpers ────────────────────────────────────────────────────────

function relTime(iso: string | undefined): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0 || diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

const ACTIVITY_ICONS: Record<string, string> = {
  created: "📝", assigned: "👤", reassigned: "🔄", dispatched: "🚀",
  started: "▶️", review: "👀", completed: "✅", dispatch_error: "⚠️",
  summary: "📋", working: "⚙️", responded: "💬",
};

function fmtTimestamp(iso: string | undefined): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) + " · " + d.toLocaleDateString([], { month: "short", day: "numeric" });
  } catch { return relTime(iso); }
}

function agentOptions(): { value: string; label: string }[] {
  return (state.agents || []).map(a => ({
    value: a.identName || a.name,
    label: a.identName || a.name,
  }));
}

// ── Page Render ────────────────────────────────────────────────────

export function renderTasksPage(): void {
  const items = state.queue;
  const counts: Record<string, number> = { inbox: 0, assigned: 0, in_progress: 0, review: 0, done: 0 };
  items.forEach(i => { if (counts[i.status] !== undefined) counts[i.status]++; });

  setPageContent(`
    <div class="page">
      <div class="page-header" style="display:flex;align-items:center;justify-content:space-between">
        <div>
          <div class="page-title">Tasks & Missions</div>
          <div class="page-subtitle">${items.length} items · ${counts.in_progress} in progress · ${counts.done} done</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          ${items.length > 0 ? `<button class="btn btn-reject" id="clearAllBtn" style="font-size:11px;padding:6px 14px;opacity:0.7">Clear All</button>` : ""}
          <button class="btn btn-approve" id="addTaskBtn" style="font-size:12px;padding:8px 18px;display:flex;align-items:center;gap:6px">
            <span style="font-size:15px;line-height:1">+</span> Add Task
          </button>
        </div>
      </div>

      <div class="queue-columns">
        ${renderCol("Inbox", "inbox", "dot-muted", items.filter(i => i.status === "inbox"))}
        ${renderCol("Assigned", "assigned", "dot-blue", items.filter(i => i.status === "assigned"))}
        ${renderCol("In Progress", "in_progress", "dot-cyan", items.filter(i => i.status === "in_progress"))}
        ${renderCol("Review", "review", "dot-yellow", items.filter(i => i.status === "review"))}
        ${renderCol("Done", "done", "dot-green", items.filter(i => i.status === "done"))}
      </div>
    </div>
  `, bindPageEvents);
}

export function renderQueuePage(): void {
  renderTasksPage();
}

// ── Page events ────────────────────────────────────────────────────

function bindPageEvents(): void {
  document.getElementById("addTaskBtn")?.addEventListener("click", () => showAddTaskModal());

  document.getElementById("clearAllBtn")?.addEventListener("click", () => showClearAllModal());

  document.querySelectorAll<HTMLElement>("[data-assign-id]").forEach(btn => {
    btn.addEventListener("click", (e) => { e.stopPropagation(); showAssignModal(btn.dataset.assignId!); });
  });

  document.querySelectorAll<HTMLElement>("[data-dispatch-id]").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      btn.textContent = "Sending…";
      btn.classList.add("disabled");
      try { await dispatchQueueItem(btn.dataset.dispatchId!); }
      catch { btn.textContent = "🚀 Dispatch"; btn.classList.remove("disabled"); }
    });
  });

  document.querySelectorAll<HTMLElement>("[data-move-id]").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      try { await updateQueueItem(btn.dataset.moveId!, { status: btn.dataset.moveStatus! }); }
      catch (err) { console.error("Status update failed:", err); }
    });
  });

  document.querySelectorAll<HTMLElement>("[data-delete-id]").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      try { await deleteQueueItem(btn.dataset.deleteId!); } catch (err) { console.error(err); }
    });
  });

  document.querySelectorAll<HTMLElement>("[data-task-id]").forEach(card => {
    card.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest("button")) return;
      showTaskDetailModal(card.dataset.taskId!);
    });
  });
}

// ── Clear All Modal ────────────────────────────────────────────────

function showClearAllModal(): void {
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

  m.body.querySelector("#modalCancel")!.addEventListener("click", () => m.close());
  m.body.querySelector("#modalOk")!.addEventListener("click", () => {
    m.close();
    clearAllQueueItems().catch(err => console.error("Failed to clear all tasks:", err));
  });
}

// ── Add Task Modal ─────────────────────────────────────────────────

function showAddTaskModal(): void {
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
        <textarea id="taskDesc" class="task-form-input" rows="3" placeholder="Optional details…"></textarea>
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
            ${agents.map(a => `<option value="${escHtml(a.value)}">${escHtml(a.label)}</option>`).join("")}
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

  const titleInput = m.body.querySelector("#taskTitle") as HTMLInputElement;
  m.body.querySelector("#modalCancel")!.addEventListener("click", () => m.close());

  m.body.querySelector("#modalOk")!.addEventListener("click", () => {
    const title = titleInput.value.trim();
    if (!title) { titleInput.focus(); return; }
    const desc = (m.body.querySelector("#taskDesc") as HTMLTextAreaElement).value.trim();
    const priority = (m.body.querySelector("#taskPriority") as HTMLSelectElement).value;
    const assignee = (m.body.querySelector("#taskAssignee") as HTMLSelectElement).value;
    m.close();
    addQueueItem({ title, description: desc || undefined, priority, assignee: assignee || undefined })
      .catch(err => console.error("Failed to create task:", err));
  });

  setTimeout(() => titleInput.focus(), 80);
}

// ── Assign Modal ───────────────────────────────────────────────────

function showAssignModal(taskId: string): void {
  const item = state.queue.find(q => q.id === taskId);
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
        ${agents.map(a => {
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

  m.body.querySelector("#modalCancel")!.addEventListener("click", () => m.close());

  m.body.querySelector("#modalOk")!.addEventListener("click", () => {
    const agent = (m.body.querySelector("#assignAgent") as HTMLSelectElement).value;
    if (!agent) { m.close(); return; }
    const autoDispatch = (m.body.querySelector("#assignAutoDispatch") as HTMLInputElement).checked;
    m.close();
    const op = autoDispatch
      ? assignAndDispatchQueueItem(taskId, agent)
      : assignQueueItem(taskId, agent);
    op.catch(err => console.error("Assign failed:", err));
  });
}

// ── Task Detail Modal ──────────────────────────────────────────────

function showTaskDetailModal(taskId: string): void {
  const item = state.queue.find(q => q.id === taskId);
  if (!item) return;

  const STATUS_LABEL: Record<string, string> = {
    inbox: "Inbox", assigned: "Assigned", in_progress: "In Progress", review: "Review", done: "Done",
  };
  const activity = item.activity || [];
  const m = openModal({ maxWidth: "560px" });

  m.body.innerHTML = `
    <div class="confirm-title" style="margin-bottom:8px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      <span>${escHtml(item.title)}</span>
      <span class="task-status-pill" style="font-size:10px">${STATUS_LABEL[item.status] || item.status}</span>
      ${item.dispatchedAt ? `<span class="task-dispatched-tag" style="font-size:10px">🚀 Dispatched</span>` : ""}
    </div>
    ${item.description ? `<div style="color:var(--text-secondary);font-size:13px;margin-bottom:16px;line-height:1.5">${escHtml(item.description)}</div>` : ""}

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
      <div>
        <div class="task-form-label">Priority</div>
        <div style="font-size:13px;text-transform:capitalize;margin-top:4px">${item.priority}</div>
      </div>
      <div>
        <div class="task-form-label">Assignee</div>
        <div style="font-size:13px;margin-top:4px">${item.assignee
          ? `<span style="display:inline-flex;align-items:center;gap:6px"><span class="mini-avatar" style="background:${agentColor(item.assignee)}15;color:${agentColor(item.assignee)};width:20px;height:20px;font-size:9px">${initials(item.assignee)}</span>${escHtml(item.assignee)}</span>`
          : "Unassigned"}</div>
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
        ${[...activity].reverse().map(a => {
          const hasLongDetail = a.detail && a.detail.length > 80;
          const detailPreview = a.detail ? escHtml(a.detail.slice(0, 200)) : "";
          const detailFull = a.detail ? escHtml(a.detail) : "";
          const isAgent = a.actor !== "human" && a.actor !== "system";
          const actorStyle = isAgent ? `color:var(--accent-primary)` : a.actor === "system" ? `color:var(--text-muted)` : ``;
          return `
          <div class="task-activity-item" style="align-items:flex-start">
            <span class="task-activity-icon" style="margin-top:2px">${ACTIVITY_ICONS[a.action] || "•"}</span>
            <span class="task-activity-detail" style="flex:1;min-width:0">
              <strong style="${actorStyle}">${escHtml(a.actor)}</strong> <span style="opacity:0.5">${escHtml(a.action)}</span>
              ${a.detail ? `<div style="margin-top:3px;opacity:0.7;font-size:11px;line-height:1.4;word-break:break-word;white-space:pre-wrap">${hasLongDetail ? detailPreview + "…" : detailFull}</div>` : ""}
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
        ${item.status !== "done" && item.assignee && !item.dispatchedAt
          ? `<button class="btn btn-sm" id="modalDispatch" style="font-size:11px">🚀 Dispatch</button>` : ""}
        ${item.status !== "done"
          ? `<button class="btn btn-sm btn-approve" id="modalComplete" style="font-size:11px">✓ Complete</button>` : ""}
        <button class="btn btn-reject btn-sm" id="modalDelete" style="font-size:11px">Delete</button>
        ${activity.length ? `<button class="btn btn-sm" id="modalClearActivity" style="opacity:0.6;font-size:11px">Clear Log</button>` : ""}
      </div>
      <button class="btn" id="modalClose">Close</button>
    </div>
  `;

  m.body.querySelector("#modalClose")!.addEventListener("click", () => m.close());

  m.body.querySelector("#modalDelete")?.addEventListener("click", async () => {
    m.close();
    try { await deleteQueueItem(taskId); } catch (err) { console.error(err); }
  });

  m.body.querySelector("#modalComplete")?.addEventListener("click", async () => {
    m.close();
    try { await completeQueueItem(taskId, item.assignee || "human"); } catch (err) { console.error(err); }
  });

  m.body.querySelector("#modalDispatch")?.addEventListener("click", async () => {
    const btn = m.body.querySelector("#modalDispatch") as HTMLButtonElement;
    btn.textContent = "Sending…";
    btn.classList.add("disabled");
    try { await dispatchQueueItem(taskId); m.close(); }
    catch { btn.textContent = "🚀 Dispatch"; btn.classList.remove("disabled"); }
  });

  m.body.querySelector("#modalClearActivity")?.addEventListener("click", async () => {
    m.close();
    try { await clearQueueItemActivity(taskId); } catch (err) { console.error(err); }
  });
}

// ── Column & Card Renderers ────────────────────────────────────────

const PILL_MAP: Record<string, string> = {
  inbox: "pill-inbox", assigned: "pill-assigned", in_progress: "pill-in-progress",
  review: "pill-review", done: "pill-done",
};

function renderCol(label: string, key: string, dotClass: string, items: QueueItem[]): string {
  return `
    <div class="queue-col">
      <div class="queue-col-header">
        <span class="queue-col-title"><span class="dot ${dotClass}"></span>${label}</span>
        <span class="queue-col-count">${items.length}</span>
      </div>
      <div class="queue-cards-list">
        ${items.length
          ? items.map(i => renderCard(i)).join("")
          : `<div class="empty-state" style="padding:20px"><div class="empty-state-text" style="opacity:0.4">No ${label.toLowerCase()} items</div></div>`}
      </div>
    </div>`;
}

function renderCard(item: QueueItem): string {
  const STATUS_LABEL: Record<string, string> = {
    inbox: "Inbox", assigned: "Assigned", in_progress: "In Progress", review: "Review", done: "Done",
  };
  const priClass = item.priority === "critical" ? "critical" : item.priority === "high" ? "high-priority" : "";
  const actions: string[] = [];

  if (item.status !== "done") {
    const label = item.assignee ? "Reassign" : "Assign";
    actions.push(`<button class="btn btn-sm" data-assign-id="${item.id}" title="${label}">${label}</button>`);
  }

  if (item.status === "assigned" && item.assignee && !item.dispatchedAt) {
    actions.push(`<button class="btn btn-sm btn-dispatch" data-dispatch-id="${item.id}" title="Send to agent">🚀 Dispatch</button>`);
  }

  if (item.status === "inbox" || item.status === "assigned") {
    actions.push(`<button class="btn btn-sm btn-approve" data-move-id="${item.id}" data-move-status="in_progress">▸ Start</button>`);
  } else if (item.status === "in_progress") {
    actions.push(`<button class="btn btn-sm" data-move-id="${item.id}" data-move-status="review">Review</button>`);
    actions.push(`<button class="btn btn-sm btn-approve" data-move-id="${item.id}" data-move-status="done">✓ Done</button>`);
  } else if (item.status === "review") {
    actions.push(`<button class="btn btn-sm btn-approve" data-move-id="${item.id}" data-move-status="done">✓ Done</button>`);
  }

  if (item.status === "done") {
    actions.push(`<button class="btn btn-sm btn-reject" data-delete-id="${item.id}" title="Remove">✕</button>`);
  }

  const dispatchedTag = item.dispatchedAt
    ? `<span class="task-dispatched-tag" title="Dispatched ${relTime(item.dispatchedAt)}">🚀 Dispatched</span>` : "";

  const activity = item.activity || [];
  const recentActivity = activity.length > 0
    ? (() => {
        const last = activity[activity.length - 1];
        return `<div style="font-size:10px;color:var(--text-muted);margin-top:6px;display:flex;align-items:center;gap:4px">
          <span>${ACTIVITY_ICONS[last.action] || "•"}</span>
          <span>${escHtml(last.actor)}: ${escHtml(last.action)}</span>
          <span style="margin-left:auto">${relTime(last.timestamp)}</span>
        </div>`;
      })()
    : "";

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
        ${item.assignee
          ? `<div class="task-assignee"><div class="mini-avatar" style="background:${agentColor(item.assignee)}15;color:${agentColor(item.assignee)}">${initials(item.assignee)}</div>${escHtml(item.assignee)}</div>`
          : `<div class="task-assignee" style="color:var(--text-muted)">Unassigned</div>`}
        <span class="task-priority priority-${item.priority}">${item.priority}</span>
      </div>
      ${recentActivity}
      ${actions.length ? `<div class="task-card-actions">${actions.join("")}</div>` : ""}
    </div>`;
}
