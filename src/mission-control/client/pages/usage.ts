/**
 * Mission Control — Usage page.
 */

import { state } from "../state.js";
import { setPageContent } from "../router.js";

export function renderUsagePage(): void {
  const days = state.usageCost || [];
  const totalTokens = days.reduce((s, d) => s + (d.totalTokens || 0), 0);
  const totalCost = days.reduce((s, d) => s + (d.totalCost || 0), 0);
  const max = Math.max(...days.map(d => d.totalTokens || 0), 1);

  setPageContent(`
    <div class="page">
      <div class="page-header">
        <div>
          <div class="page-title">Usage & Costs</div>
          <div class="page-subtitle">Token consumption and cost breakdown</div>
        </div>
      </div>

      <div class="grid-3" style="margin-bottom:24px">
        <div class="stat-card">
          <div class="stat-card-value">${Math.round(totalTokens / 1000)}k</div>
          <div class="stat-card-label">Total Tokens</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-value">$${totalCost.toFixed(2)}</div>
          <div class="stat-card-label">Total Cost</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-value">${days.length}</div>
          <div class="stat-card-label">Days Tracked</div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <span class="card-title">Daily Breakdown</span>
        </div>
        <div class="card-body">
          ${days.length === 0
            ? '<div class="empty-state"><div class="empty-state-text">No usage data available</div></div>'
            : `<div class="usage-chart-area">
                ${days.map(d => {
                  const pct = Math.max(3, Math.round((d.totalTokens || 0) / max * 100));
                  const tokens = Math.round((d.totalTokens || 0) / 1000);
                  const cost = (d.totalCost || 0).toFixed(2);
                  return `<div class="usage-row"><span class="usage-day">${d.date || "?"}</span><div class="usage-bar-track"><div class="usage-bar-fill" style="width:${pct}%"></div></div><span class="usage-tokens">${tokens}k</span><span class="usage-cost">$${cost}</span></div>`;
                }).join("")}
                <div class="usage-total-row">
                  <span style="color:var(--text-secondary)">${Math.round(totalTokens / 1000)}k tokens</span>
                  <span style="color:var(--accent-green)">$${totalCost.toFixed(2)} total</span>
                </div>
              </div>`}
        </div>
      </div>
    </div>
  `);
}
