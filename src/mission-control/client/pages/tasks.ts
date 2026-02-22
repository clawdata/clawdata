/**
 * Mission Control — Tasks page.
 */

import { state } from "../state.js";
import { escHtml, agentColor, initials } from "../utils.js";
import { setPageContent } from "../router.js";
import { addQueueItem, assignQueueItem, updateQueueItem, deleteQueueItem } from "../api.js";

export function renderTasksPage(): void {
  const items = state.queue;
  const counts: Record<string, number> = { inbox: 0, assigned: 0, in_progress: 0, review: 0, done: 0 };
  items.forEach(i => { if (counts[i.status] !== undefined) counts[i.status]++; });

  setPageContent(`
    <div class="page">
      <div class="page-header" style="display:flex;align-items:center;justify-content:space-between">
        <div>
          <div class="page-title">Tasks & Missions</div>
          <div class="page-subtitle">${items.length} items · ${counts.in_progress} in progress</div>
        </div>
        <button class="btn btn-approve" id="addTaskBtn" style="font-size:12px;padding:8px 18px;display:flex;align-items:center;gap:6px">
          <span style="font-size:15px;line-height:1">+</span> Add Task
        </button>
      </div>

      <div class="queue-columns">
        ${renderQueueColumn("Inbox", "inbox", "dot-muted", items.filter(i => i.status === "inbox"))}
        ${renderQueueColumn("Assigned", "assigned", "dot-blue", items.filter(i => i.status === "assigned"))}
        ${renderQueueColumn("In Progress", "in_progress", "dot-cyan", items.filter(i => i.status === "in_progress"))}
        ${renderQueueColumn("Review", "review", "dot-yellow", items.filter(i => i.status === "review"))}
        ${renderQueueColumn("Done", "done", "dot-green", items.filter(i => i.status === "done"))}
      </div>
    </div>
  `);

  // Bind "Add Task" button
  document.getElementById("addTaskBtn")?.addEventListener("click", () => showAddTaskModal());

  // Bind assign buttons
  document.querySelectorAll<HTMLElement>("[data-assign-id]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const taskId = btn.dataset.assignId!;
      showAssignModal(taskId);
    });
  });

  // Bind status-move buttons
  document.querySelectorAll<HTMLElement>("[data-move-id]").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const taskId = btn.dataset.moveId!;
      const newStatus = btn.dataset.moveStatus!;
      try {
        await updateQueueItem(taskId, { status: newStatus });
      } catch (err) {
        console.error("Failed to update task:", err);
      }
    });
  });

  // Bind delete buttons
  document.querySelectorAll<HTMLElement>("[data-delete-id]").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const taskId = btn.dataset.deleteId!;
      try {
        await deleteQueueItem(taskId);
      } catch (err) {
        console.error("Failed to delete task:", err);
      }
    });
  });
}

export function renderQueuePage(): void {
  renderTasksPage();
}

// ── Add Task Modal ─────────────────────────────────────────────────

function showAddTaskModal(): void {
  const agents = state.agents || [];
  const overlay = document.createElement("div");
  overlay.className = "confirm-overlay";
  overlay.innerHTML = `
    <div class="confirm-dialog" style="max-width:460px;text-align:left">
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
              <option value="">Unassigned (Inbox)</option>
              ${agents.map(a => `<option value="${escHtml(a.identName || a.name)}">${escHtml(a.identName || a.name)}</option>`).join("")}
            </select>
          </div>
        </div>
        <div class="task-form-hint" id="assignHint" style="display:none">
          Assigning to an agent will move this task to <strong>Assigned</strong> — actioned automatically.
        </div>
      </div>
      <div class="confirm-actions" style="margin-top:20px;justify-content:flex-end">
        <button class="btn confirm-cancel">Cancel</button>
        <button class="btn btn-approve confirm-ok">Create Task</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add("open"));

  const titleInput = overlay.querySelector("#taskTitle") as HTMLInputElement;
  const assigneeSelect = overlay.querySelector("#taskAssignee") as HTMLSelectElement;
  const hint = overlay.querySelector("#assignHint") as HTMLElement;

  // Show hint when agent is selected
  assigneeSelect.addEventListener("change", () => {
    hint.style.display = assigneeSelect.value ? "block" : "none";
  });

  const close = () => {
    overlay.classList.remove("open");
    setTimeout(() => overlay.remove(), 150);
  };

  overlay.querySelector(".confirm-cancel")!.addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });

  overlay.querySelector(".confirm-ok")!.addEventListener("click", async () => {
    const title = titleInput.value.trim();
    if (!title) { titleInput.focus(); return; }

    const desc = (overlay.querySelector("#taskDesc") as HTMLTextAreaElement).value.trim();
    const priority = (overlay.querySelector("#taskPriority") as HTMLSelectElement).value;
    const assignee = assigneeSelect.value;

    try {
      await addQueueItem({ title, description: desc || undefined, priority, assignee: assignee || undefined });
      close();
    } catch (err) {
      console.error("Failed to create task:", err);
    }
  });

  setTimeout(() => titleInput.focus(), 50);
}

// ── Assign Modal ───────────────────────────────────────────────────

function showAssignModal(taskId: string): void {
  const agents = state.agents || [];
  const item = state.queue.find(q => q.id === taskId);
  if (!item) return;

  const overlay = document.createElement("div");
  overlay.className = "confirm-overlay";
  overlay.innerHTML = `
    <div class="confirm-dialog" style="max-width:380px;text-align:left">
      <div class="confirm-title" style="margin-bottom:4px">Assign Task</div>
      <div class="confirm-message" style="text-align:left;margin-bottom:16px">${escHtml(item.title)}</div>
      <div class="task-form-group">
        <label class="task-form-label">Assign to Agent</label>
        <select id="assignAgent" class="task-form-input">
          <option value="">Unassigned</option>
          ${agents.map(a => {
            const name = a.identName || a.name;
            const selected = item.assignee === name ? "selected" : "";
            return `<option value="${escHtml(name)}" ${selected}>${escHtml(name)}</option>`;
          }).join("")}
        </select>
      </div>
      <div class="task-form-hint" style="margin-top:8px">
        Assigning to an agent automatically moves this task to <strong>Assigned</strong> status.
      </div>
      <div class="confirm-actions" style="margin-top:20px;justify-content:flex-end">
        <button class="btn confirm-cancel">Cancel</button>
        <button class="btn btn-approve confirm-ok">Assign</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add("open"));

  const close = () => {
    overlay.classList.remove("open");
    setTimeout(() => overlay.remove(), 150);
  };

  overlay.querySelector(".confirm-cancel")!.addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });

  overlay.querySelector(".confirm-ok")!.addEventListener("click", async () => {
    const agent = (overlay.querySelector("#assignAgent") as HTMLSelectElement).value;
    if (!agent) { close(); return; }
    try {
      await assignQueueItem(taskId, agent);
      close();
    } catch (err) {
      console.error("Failed to assign task:", err);
    }
  });
}

// ── Column & Card Renderers ────────────────────────────────────────

function renderQueueColumn(label: string, key: string, dotClass: string, items: any[]): string {
  const pillMap: Record<string, string> = {
    inbox: "pill-inbox", assigned: "pill-assigned", in_progress: "pill-in-progress",
    review: "pill-review", done: "pill-done",
  };
  return `
    <div class="queue-col">
      <div class="queue-col-header">
        <span class="queue-col-title"><span class="dot ${dotClass}"></span>${label}</span>
        <span class="queue-col-count">${items.length}</span>
      </div>
      <div class="queue-cards-list">
        ${items.length
          ? items.map(i => renderTaskCard(i, pillMap)).join("")
          : `<div class="empty-state" style="padding:20px"><div class="empty-state-text" style="opacity:0.4">No ${label.toLowerCase()} items</div></div>`}
      </div>
    </div>`;
}

function renderTaskCard(item: any, pillMap: Record<string, string>): string {
  const statusLabel: Record<string, string> = {
    inbox: "Inbox", assigned: "Assigned", in_progress: "In Progress", review: "Review", done: "Done",
  };
  const priClass = item.priority === "critical" ? "critical" : item.priority === "high" ? "high-priority" : "";
  const isUserTask = item.source === "user";

  // Determine available status transitions
  const nextStatusMap: Record<string, { label: string; status: string }[]> = {
    inbox: [{ label: "▸ Start", status: "in_progress" }],
    assigned: [{ label: "▸ Start", status: "in_progress" }],
    in_progress: [{ label: "Review", status: "review" }, { label: "✓ Done", status: "done" }],
    review: [{ label: "✓ Done", status: "done" }],
    done: [],
  };
  const transitions = isUserTask ? (nextStatusMap[item.status] || []) : [];

  return `
    <div class="task-card ${priClass}">
      <div class="task-card-header">
        <span class="task-status-pill ${pillMap[item.status] || ""}">${statusLabel[item.status] || item.status}</span>
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
      ${isUserTask ? `
      <div class="task-card-actions">
        ${!item.assignee ? `<button class="btn btn-sm" data-assign-id="${item.id}" title="Assign to agent">Assign</button>` : `<button class="btn btn-sm" data-assign-id="${item.id}" title="Reassign">Reassign</button>`}
        ${transitions.map(t => `<button class="btn btn-sm btn-approve" data-move-id="${item.id}" data-move-status="${t.status}">${t.label}</button>`).join("")}
        ${item.status === "done" ? `<button class="btn btn-sm btn-reject" data-delete-id="${item.id}" title="Remove">✕</button>` : ""}
      </div>` : ""}
    </div>`;
}
