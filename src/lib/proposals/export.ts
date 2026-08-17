import type {
  Proposal,
  ProposalDeliverable,
  ProposalLineItem,
  ProposalTimelineItem,
} from "./types";
import { formatMoney, formatQuantity } from "./pricing";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderLineItems(
  items: ProposalLineItem[],
  currency: string,
  heading: string
): string {
  if (items.length === 0) return "";
  const rows = items
    .map((item) => {
      const total = formatMoney(
        Math.round(item.quantity * item.unitPriceCents),
        currency
      );
      return `<tr>
        <td>
          <div class="item-title">${escapeHtml(item.title)}</div>
          ${item.description ? `<div class="item-desc">${escapeHtml(item.description)}</div>` : ""}
        </td>
        <td class="num">${formatQuantity(item.quantity)} ${escapeHtml(item.unitLabel)}</td>
        <td class="num">${formatMoney(item.unitPriceCents, currency)}</td>
        <td class="num">${total}</td>
      </tr>`;
    })
    .join("");
  return `<h2>${escapeHtml(heading)}</h2>
    <table>
      <thead>
        <tr>
          <th>Item</th>
          <th>Qty</th>
          <th>Rate</th>
          <th>Total</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function renderTimeline(items: ProposalTimelineItem[]): string {
  if (items.length === 0) return "";
  const rows = items
    .map((item) => {
      const range = [item.startDate, item.endDate].filter(Boolean).join(" → ");
      return `<li>
        <strong>${escapeHtml(item.title)}</strong>
        ${range ? `<span class="muted"> · ${escapeHtml(range)}</span>` : ""}
        ${item.description ? `<p>${escapeHtml(item.description)}</p>` : ""}
      </li>`;
    })
    .join("");
  return `<h2>Timeline</h2><ol class="timeline">${rows}</ol>`;
}

function renderDeliverables(items: ProposalDeliverable[]): string {
  if (items.length === 0) return "";
  const rows = items
    .map(
      (item) => `<li>
        <strong>${escapeHtml(item.title)}</strong>
        ${item.description ? `<p>${escapeHtml(item.description)}</p>` : ""}
      </li>`
    )
    .join("");
  return `<h2>Deliverables</h2><ul class="deliverables">${rows}</ul>`;
}

export type ProposalExportData = {
  proposal: Proposal;
  businessName: string;
  clientName: string;
};

export function proposalExportFilename(title: string): string {
  const base = title
    .replace(/[^\w.-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
  return `${base || "proposal"}.html`;
}

export function proposalExportHeaders(title: string): Record<string, string> {
  const filename = proposalExportFilename(title);
  return {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Disposition": `attachment; filename="${filename}"`,
  };
}

export function generateProposalHtml(data: ProposalExportData): string {
  const { proposal, businessName, clientName } = data;
  const currency = proposal.currency || "USD";
  const services = renderLineItems(proposal.line_items, currency, "Services");
  const addons = renderLineItems(
    proposal.addons.filter((a) => !a.optional),
    currency,
    "Included add-ons"
  );
  const optionalAddons =
    proposal.addons.filter((a) => a.optional).length > 0
      ? renderLineItems(
          proposal.addons.filter((a) => a.optional),
          currency,
          "Optional add-ons"
        )
      : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(proposal.title)} — ${escapeHtml(businessName)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #1c1917; margin: 0; padding: 40px; background: #fafaf9; }
    .page { max-width: 900px; margin: 0 auto; background: #fff; border: 1px solid #e7e5e4; border-radius: 16px; padding: 40px; }
    h1 { font-size: 28px; margin: 0 0 8px; color: #0f766e; }
    h2 { font-size: 16px; margin: 28px 0 12px; text-transform: uppercase; letter-spacing: 0.04em; color: #57534e; }
    .meta { color: #57534e; font-size: 14px; margin-bottom: 24px; }
    .summary { font-size: 15px; line-height: 1.6; margin-bottom: 20px; }
    .section { font-size: 14px; line-height: 1.7; white-space: pre-wrap; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 8px; }
    th, td { padding: 10px 12px; border-bottom: 1px solid #e7e5e4; text-align: left; vertical-align: top; }
    th { background: #f5f5f4; font-weight: 600; color: #44403c; }
    .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .item-title { font-weight: 600; }
    .item-desc { margin-top: 4px; color: #57534e; font-size: 12px; }
    .totals { margin-top: 20px; padding: 16px; background: #f0fdfa; border-radius: 12px; max-width: 320px; margin-left: auto; }
    .totals p { margin: 6px 0; display: flex; justify-content: space-between; font-size: 14px; }
    .totals .grand { font-size: 18px; font-weight: 700; color: #0f766e; border-top: 1px solid #99f6e4; padding-top: 8px; margin-top: 8px; }
    .timeline, .deliverables { margin: 0; padding-left: 20px; }
    .timeline li, .deliverables li { margin-bottom: 12px; line-height: 1.5; }
    .muted { color: #78716c; font-size: 12px; }
    .footer { margin-top: 32px; font-size: 12px; color: #78716c; text-align: center; }
    @media print { body { background: #fff; padding: 0; } .page { border: none; box-shadow: none; } }
  </style>
</head>
<body>
  <div class="page">
    <h1>${escapeHtml(proposal.title)}</h1>
    <p class="meta">${escapeHtml(businessName)} · Prepared for ${escapeHtml(clientName)}</p>
    ${proposal.summary ? `<p class="summary">${escapeHtml(proposal.summary)}</p>` : ""}
    ${proposal.introduction ? `<div class="section">${escapeHtml(proposal.introduction)}</div>` : ""}
    ${services}
    ${addons}
    ${optionalAddons}
    <div class="totals">
      <p><span>Subtotal</span><span>${formatMoney(proposal.subtotal_cents, currency)}</span></p>
      ${
        proposal.tax_cents > 0
          ? `<p><span>Tax</span><span>${formatMoney(proposal.tax_cents, currency)}</span></p>`
          : ""
      }
      <p class="grand"><span>Total</span><span>${formatMoney(proposal.total_cents, currency)}</span></p>
    </div>
    ${renderTimeline(proposal.timeline)}
    ${renderDeliverables(proposal.deliverables)}
    ${proposal.terms ? `<h2>Terms</h2><div class="section">${escapeHtml(proposal.terms)}</div>` : ""}
    <p class="footer">Proposal generated by Guardian · Version ${proposal.version}</p>
  </div>
</body>
</html>`;
}
