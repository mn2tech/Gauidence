import "server-only";

import PDFDocument from "pdfkit";
import type { ProposalExportData } from "./export";
import type {
  ProposalDeliverable,
  ProposalLineItem,
  ProposalTimelineItem,
} from "./types";
import { formatMoney, formatQuantity } from "./pricing";

const BRAND = "#0f766e";
const INK = "#1c1917";
const MUTED = "#57534e";
const RULE = "#e7e5e4";
const HEADER_BG = "#f5f5f4";
const TOTALS_BG = "#f0fdfa";
const TOTALS_RULE = "#99f6e4";

type Doc = PDFKit.PDFDocument;

function contentWidth(doc: Doc): number {
  return doc.page.width - doc.page.margins.left - doc.page.margins.right;
}

function leftX(doc: Doc): number {
  return doc.page.margins.left;
}

function bottomY(doc: Doc): number {
  return doc.page.height - doc.page.margins.bottom;
}

function ensureSpace(doc: Doc, needed: number) {
  if (doc.y + needed > bottomY(doc)) {
    doc.addPage();
  }
}

function sectionHeading(doc: Doc, title: string) {
  ensureSpace(doc, 28);
  doc
    .fillColor(MUTED)
    .font("Helvetica-Bold")
    .fontSize(9)
    .text(title.toUpperCase(), leftX(doc), doc.y, {
      width: contentWidth(doc),
      characterSpacing: 0.5,
    });
  doc.moveDown(0.4);
}

function drawLineItems(
  doc: Doc,
  items: ProposalLineItem[],
  currency: string,
  heading: string
) {
  if (items.length === 0) return;

  sectionHeading(doc, heading);
  const width = contentWidth(doc);
  const x0 = leftX(doc);
  const cols = [width * 0.5, width * 0.16, width * 0.17, width * 0.17];

  drawTableRow(
    doc,
    ["Item", "Qty", "Rate", "Total"],
    cols,
    x0,
    { header: true }
  );

  for (const item of items) {
    const total = formatMoney(
      Math.round(item.quantity * item.unitPriceCents),
      currency
    );
    drawItemRow(
      doc,
      {
        title: item.title,
        description: item.description,
        qty: `${formatQuantity(item.quantity)} ${item.unitLabel}`,
        rate: formatMoney(item.unitPriceCents, currency),
        total,
      },
      cols,
      x0
    );
  }
  doc.moveDown(0.7);
}

function drawTableRow(
  doc: Doc,
  cells: string[],
  cols: number[],
  x0: number,
  opts: { header: boolean }
) {
  const pad = 8;
  const heights = cells.map((text, i) =>
    doc
      .font(opts.header ? "Helvetica-Bold" : "Helvetica")
      .fontSize(9)
      .heightOfString(text, { width: Math.max(12, cols[i]! - pad * 2) })
  );
  const rowH = Math.max(22, Math.max(...heights) + pad * 2);
  ensureSpace(doc, rowH);

  const y = doc.y;
  const tableW = cols.reduce((sum, w) => sum + w, 0);
  if (opts.header) {
    doc.save();
    doc.rect(x0, y, tableW, rowH).fill(HEADER_BG);
    doc.restore();
  }
  doc
    .save()
    .strokeColor(RULE)
    .lineWidth(0.6)
    .moveTo(x0, y + rowH)
    .lineTo(x0 + tableW, y + rowH)
    .stroke()
    .restore();

  let x = x0;
  cells.forEach((text, i) => {
    const align = i === 0 ? "left" : "right";
    doc
      .fillColor(opts.header ? "#44403c" : INK)
      .font(opts.header ? "Helvetica-Bold" : "Helvetica")
      .fontSize(9)
      .text(text, x + pad, y + pad, {
        width: cols[i]! - pad * 2,
        align,
        lineBreak: true,
      });
    x += cols[i]!;
  });
  doc.x = x0;
  doc.y = y + rowH;
}

function drawItemRow(
  doc: Doc,
  item: {
    title: string;
    description?: string;
    qty: string;
    rate: string;
    total: string;
  },
  cols: number[],
  x0: number
) {
  const pad = 8;
  const titleWidth = Math.max(12, cols[0]! - pad * 2);
  const titleH = doc
    .font("Helvetica-Bold")
    .fontSize(9)
    .heightOfString(item.title, { width: titleWidth });
  const descH = item.description
    ? doc
        .font("Helvetica")
        .fontSize(8)
        .heightOfString(item.description, { width: titleWidth }) + 3
    : 0;
  const rowH = Math.max(24, pad * 2 + titleH + descH);
  ensureSpace(doc, rowH);

  const y = doc.y;
  const tableW = cols.reduce((sum, w) => sum + w, 0);
  doc
    .save()
    .strokeColor(RULE)
    .lineWidth(0.6)
    .moveTo(x0, y + rowH)
    .lineTo(x0 + tableW, y + rowH)
    .stroke()
    .restore();

  doc
    .fillColor(INK)
    .font("Helvetica-Bold")
    .fontSize(9)
    .text(item.title, x0 + pad, y + pad, { width: titleWidth, lineBreak: true });
  if (item.description) {
    doc
      .fillColor(MUTED)
      .font("Helvetica")
      .fontSize(8)
      .text(item.description, x0 + pad, y + pad + titleH + 3, {
        width: titleWidth,
        lineBreak: true,
      });
  }

  const values = [item.qty, item.rate, item.total];
  let x = x0 + cols[0]!;
  values.forEach((text, i) => {
    const width = cols[i + 1]!;
    doc
      .fillColor(INK)
      .font("Helvetica")
      .fontSize(9)
      .text(text, x + pad, y + pad, {
        width: width - pad * 2,
        align: "right",
      });
    x += width;
  });

  doc.x = x0;
  doc.y = y + rowH;
}

function drawTotals(
  doc: Doc,
  args: { subtotal_cents: number; tax_cents: number; total_cents: number },
  currency: string
) {
  const boxW = 220;
  const boxH = args.tax_cents > 0 ? 78 : 58;
  const width = contentWidth(doc);
  const x0 = leftX(doc);
  const boxX = x0 + width - boxW;
  ensureSpace(doc, boxH + 8);

  const y = doc.y;
  doc.save();
  doc.roundedRect(boxX, y, boxW, boxH, 8).fill(TOTALS_BG);
  doc.restore();

  const lineX = boxX + 14;
  const lineW = boxW - 28;
  let lineY = y + 12;
  const moneyLine = (label: string, amount: number, grand = false) => {
    doc
      .fillColor(grand ? BRAND : INK)
      .font(grand ? "Helvetica-Bold" : "Helvetica")
      .fontSize(grand ? 12 : 10)
      .text(label, lineX, lineY, { width: lineW / 2, align: "left" });
    doc
      .fillColor(grand ? BRAND : INK)
      .font(grand ? "Helvetica-Bold" : "Helvetica")
      .fontSize(grand ? 12 : 10)
      .text(formatMoney(amount, currency), lineX + lineW / 2, lineY, {
        width: lineW / 2,
        align: "right",
      });
    lineY += grand ? 18 : 16;
  };

  moneyLine("Subtotal", args.subtotal_cents);
  if (args.tax_cents > 0) moneyLine("Tax", args.tax_cents);
  doc
    .save()
    .strokeColor(TOTALS_RULE)
    .lineWidth(0.8)
    .moveTo(lineX, lineY - 4)
    .lineTo(lineX + lineW, lineY - 4)
    .stroke()
    .restore();
  moneyLine("Total", args.total_cents, true);

  doc.x = x0;
  doc.y = y + boxH + 16;
}

function drawTimeline(doc: Doc, items: ProposalTimelineItem[]) {
  if (items.length === 0) return;
  sectionHeading(doc, "Timeline");
  const width = contentWidth(doc);
  const x0 = leftX(doc);

  items.forEach((item, index) => {
    const range = [item.startDate, item.endDate].filter(Boolean).join(" → ");
    const title = `${index + 1}. ${item.title}`;
    const titleH = doc
      .font("Helvetica-Bold")
      .fontSize(10)
      .heightOfString(title, { width });
    const rangeH = range
      ? doc.font("Helvetica").fontSize(8).heightOfString(range, { width }) + 2
      : 0;
    const descH = item.description
      ? doc
          .font("Helvetica")
          .fontSize(9)
          .heightOfString(item.description, { width }) + 3
      : 0;
    ensureSpace(doc, titleH + rangeH + descH + 12);

    doc
      .fillColor(INK)
      .font("Helvetica-Bold")
      .fontSize(10)
      .text(title, x0, doc.y, { width, lineBreak: true });
    if (range) {
      doc
        .fillColor(MUTED)
        .font("Helvetica")
        .fontSize(8)
        .text(range, x0, doc.y, { width, lineBreak: true });
    }
    if (item.description) {
      doc
        .fillColor(MUTED)
        .font("Helvetica")
        .fontSize(9)
        .text(item.description, x0, doc.y, { width, lineBreak: true });
    }
    doc.moveDown(0.45);
  });
  doc.moveDown(0.3);
}

function drawDeliverables(doc: Doc, items: ProposalDeliverable[]) {
  if (items.length === 0) return;
  sectionHeading(doc, "Deliverables");
  const width = contentWidth(doc);
  const x0 = leftX(doc);

  for (const item of items) {
    const titleH = doc
      .font("Helvetica-Bold")
      .fontSize(10)
      .heightOfString(`•  ${item.title}`, { width });
    const descH = item.description
      ? doc
          .font("Helvetica")
          .fontSize(9)
          .heightOfString(item.description, { width: width - 14 }) + 3
      : 0;
    ensureSpace(doc, titleH + descH + 12);

    doc
      .fillColor(INK)
      .font("Helvetica-Bold")
      .fontSize(10)
      .text(`•  ${item.title}`, x0, doc.y, { width, lineBreak: true });
    if (item.description) {
      doc
        .fillColor(MUTED)
        .font("Helvetica")
        .fontSize(9)
        .text(item.description, x0 + 14, doc.y, {
          width: width - 14,
          lineBreak: true,
        });
    }
    doc.moveDown(0.45);
  }
}

export async function generateProposalPdf(
  data: ProposalExportData
): Promise<Buffer> {
  const { proposal, businessName, clientName } = data;
  const currency = proposal.currency || "USD";

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "LETTER",
      margins: { top: 54, bottom: 54, left: 54, right: 54 },
      info: {
        Title: proposal.title,
        Author: businessName,
        Subject: `Proposal for ${clientName}`,
        Creator: "Guardian",
      },
    });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const width = contentWidth(doc);
    const x0 = leftX(doc);

    doc
      .fillColor(BRAND)
      .font("Helvetica-Bold")
      .fontSize(20)
      .text(proposal.title, x0, doc.y, { width, lineBreak: true });
    doc.moveDown(0.25);
    doc
      .fillColor(MUTED)
      .font("Helvetica")
      .fontSize(10)
      .text(`${businessName}  ·  Prepared for ${clientName}`, {
        width,
      });
    doc.moveDown(0.9);

    if (proposal.summary) {
      doc
        .fillColor(INK)
        .font("Helvetica")
        .fontSize(11)
        .text(proposal.summary, { width, lineGap: 2 });
      doc.moveDown(0.6);
    }
    if (proposal.introduction) {
      doc
        .fillColor(INK)
        .font("Helvetica")
        .fontSize(10)
        .text(proposal.introduction, { width, lineGap: 2 });
      doc.moveDown(0.8);
    }

    drawLineItems(doc, proposal.line_items, currency, "Services");
    drawLineItems(
      doc,
      proposal.addons.filter((item) => !item.optional),
      currency,
      "Included add-ons"
    );
    drawLineItems(
      doc,
      proposal.addons.filter((item) => item.optional),
      currency,
      "Optional add-ons"
    );
    drawTotals(doc, proposal, currency);
    drawTimeline(doc, proposal.timeline);
    drawDeliverables(doc, proposal.deliverables);

    if (proposal.terms) {
      sectionHeading(doc, "Terms");
      doc
        .fillColor(INK)
        .font("Helvetica")
        .fontSize(10)
        .text(proposal.terms, { width, lineGap: 2 });
      doc.moveDown(1);
    }

    doc.moveDown(1.2);
    ensureSpace(doc, 20);
    doc
      .fillColor("#78716c")
      .font("Helvetica")
      .fontSize(8)
      .text(
        `Proposal generated by Guardian  ·  Version ${proposal.version}`,
        x0,
        doc.y,
        { width, align: "center" }
      );

    doc.end();
  });
}
