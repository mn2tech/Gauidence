import "server-only";

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  HeadingLevel,
} from "docx";
import type { PayrollReportData } from "./types";
import { formatPayPeriod } from "./compute";

export function generateCsvExport(data: PayrollReportData): string {
  const headers = [
    "Employee Name",
    "Payroll Employee ID",
    "Regular Hours",
    "Overtime Hours",
    "Adjustments",
    "Total Hours",
    "Adjustment Reason",
  ];

  const rows = data.entries.map((e) => [
    e.employee_name,
    e.payroll_employee_id ?? "",
    String(e.regular_hours),
    String(e.overtime_hours),
    String(e.adjustment_hours),
    String(Number(e.total_hours) + Number(e.adjustment_hours)),
    e.adjustment_reason ?? "",
  ]);

  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  return [headers.map(escape).join(","), ...rows.map((r) => r.map(escape).join(","))].join("\n");
}

export function generateHtmlExport(data: PayrollReportData): string {
  const period = formatPayPeriod(
    data.report.pay_period_start,
    data.report.pay_period_end
  );
  const approved = data.report.approved_at
    ? new Date(data.report.approved_at).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "—";

  const rows = data.entries
    .map(
      (e) => `
    <tr>
      <td>${escapeHtml(e.employee_name)}</td>
      <td>${escapeHtml(e.payroll_employee_id ?? "—")}</td>
      <td class="num">${e.regular_hours}</td>
      <td class="num">${e.overtime_hours}</td>
      <td class="num">${e.adjustment_hours}</td>
      <td class="num">${Number(e.total_hours) + Number(e.adjustment_hours)}</td>
      <td>${escapeHtml(e.adjustment_reason ?? "")}</td>
    </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Payroll Report — ${escapeHtml(data.businessName)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #1c1917; margin: 0; padding: 40px; background: #fafaf9; }
    .page { max-width: 900px; margin: 0 auto; background: #fff; border: 1px solid #e7e5e4; border-radius: 16px; padding: 40px; }
    h1 { font-size: 24px; margin: 0 0 4px; }
    .meta { color: #57534e; font-size: 14px; margin-bottom: 24px; }
    .badge { display: inline-block; padding: 4px 12px; border-radius: 999px; font-size: 12px; font-weight: 600; background: #d1fae5; color: #065f46; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { padding: 10px 12px; border-bottom: 1px solid #e7e5e4; text-align: left; }
    th { background: #f5f5f4; font-weight: 600; color: #44403c; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .totals { margin-top: 24px; padding: 16px; background: #f5f5f4; border-radius: 12px; }
    .totals p { margin: 4px 0; font-size: 14px; }
    .footer { margin-top: 32px; font-size: 12px; color: #78716c; text-align: center; }
    @media print { body { background: #fff; padding: 0; } .page { border: none; box-shadow: none; } }
  </style>
</head>
<body>
  <div class="page">
    <h1>${escapeHtml(data.businessName)}</h1>
    <p class="meta">Pay Period: ${period} · Approved: ${approved}</p>
    <span class="badge">Approved Payroll Report</span>
    <table style="margin-top: 24px;">
      <thead>
        <tr>
          <th>Employee</th>
          <th>Payroll ID</th>
          <th class="num">Regular</th>
          <th class="num">Overtime</th>
          <th class="num">Adjustments</th>
          <th class="num">Total</th>
          <th>Reason</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="totals">
      <p><strong>Total Regular Hours:</strong> ${data.report.total_regular_hours}</p>
      <p><strong>Total Overtime Hours:</strong> ${data.report.total_overtime_hours}</p>
      <p><strong>Grand Total Hours:</strong> ${data.report.total_hours}</p>
    </div>
    <p class="footer">Secure Payroll Report powered by Guardian</p>
  </div>
</body>
</html>`;
}

export async function generateExcelExport(data: PayrollReportData): Promise<Buffer> {
  const period = formatPayPeriod(
    data.report.pay_period_start,
    data.report.pay_period_end
  );
  const approved = data.report.approved_at
    ? new Date(data.report.approved_at).toLocaleDateString("en-US")
    : "—";

  const headerRow = new TableRow({
    children: [
      "Employee Name",
      "Payroll Employee ID",
      "Regular Hours",
      "Overtime Hours",
      "Adjustments",
      "Total Hours",
      "Adjustment Reason",
    ].map(
      (h) =>
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })],
          width: { size: 14, type: WidthType.PERCENTAGE },
        })
    ),
  });

  const dataRows = data.entries.map(
    (e) =>
      new TableRow({
        children: [
          e.employee_name,
          e.payroll_employee_id ?? "",
          String(e.regular_hours),
          String(e.overtime_hours),
          String(e.adjustment_hours),
          String(Number(e.total_hours) + Number(e.adjustment_hours)),
          e.adjustment_reason ?? "",
        ].map(
          (v) =>
            new TableCell({
              children: [new Paragraph(v)],
            })
        ),
      })
  );

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            text: data.businessName,
            heading: HeadingLevel.HEADING_1,
          }),
          new Paragraph({ text: `Pay Period: ${period}` }),
          new Paragraph({ text: `Approved: ${approved}` }),
          new Paragraph({ text: "" }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [headerRow, ...dataRows],
          }),
          new Paragraph({ text: "" }),
          new Paragraph({
            children: [
              new TextRun({ text: "Total Regular Hours: ", bold: true }),
              new TextRun(String(data.report.total_regular_hours)),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: "Total Overtime Hours: ", bold: true }),
              new TextRun(String(data.report.total_overtime_hours)),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: "Grand Total Hours: ", bold: true }),
              new TextRun(String(data.report.total_hours)),
            ],
          }),
          new Paragraph({ text: "" }),
          new Paragraph({
            children: [
              new TextRun({
                text: "Secure Payroll Report powered by Guardian",
                italics: true,
                size: 18,
              }),
            ],
          }),
        ],
      },
    ],
  });

  return Packer.toBuffer(doc);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
