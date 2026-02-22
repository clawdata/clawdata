/**
 * Mission Control — Skills page.
 */

import { state } from "../state.js";
import { escHtml } from "../utils.js";
import { setPageContent } from "../router.js";

export function renderSkillsPage(): void {
  const skills = state.skills;
  const linkedCount = skills.filter(s => s.linked && s.available).length;

  setPageContent(`
    <div class="page">
      <div class="page-header">
        <div>
          <div class="page-title">Skills Registry</div>
          <div class="page-subtitle">${skills.length} skills · ${linkedCount} available</div>
        </div>
      </div>

      <div class="skills-grid-page">
        ${skills.length === 0
          ? '<div class="empty-state" style="grid-column:1/-1"><div class="empty-state-text">Loading skills...</div></div>'
          : skills.map(s => {
            const statusLabel = s.linked && s.available ? "AVAILABLE" : s.linked ? "LINKED" : s.installed ? "INSTALLED" : "MISSING";
            const statusClass = s.linked && s.available ? "skill-linked" : s.linked ? "skill-available" : s.installed ? "skill-available" : "skill-missing";
            return `
            <div class="skill-card">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
                <div class="skill-card-name">${s.emoji ? s.emoji + " " : ""}${escHtml(s.name)}</div>
                <span class="skill-card-status ${statusClass}">${statusLabel}</span>
              </div>
              ${s.description ? `<div class="skill-card-desc">${escHtml(s.description)}</div>` : ""}
              <div style="display:flex;align-items:center;gap:6px;margin-top:6px;flex-wrap:wrap">
                ${s.source ? `<span class="skill-tag">${escHtml(s.source)}</span>` : ""}
                ${(s.tags || []).map((t: string) => `<span class="skill-tag">${escHtml(t)}</span>`).join("")}
              </div>
            </div>
          `;}).join("")}
      </div>
    </div>
  `);
}
