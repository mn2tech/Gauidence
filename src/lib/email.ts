import "server-only";

import { Resend } from "resend";
import { GUARDIAN_TIME_ZONE } from "@/lib/timezone";

export type ReminderItem = {
  title: string;
  dueDate: string; // ISO date (yyyy-mm-dd)
  daysLeft: number;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDueDate(isoDate: string) {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: GUARDIAN_TIME_ZONE,
  });
}

function daysLeftLabel(daysLeft: number) {
  if (daysLeft <= 0) return "Due today";
  if (daysLeft === 1) return "Due tomorrow";
  return `${daysLeft} days left`;
}

export function renderReminderEmail(items: ReminderItem[]) {
  const rows = items
    .map((item) => {
      const urgent = item.daysLeft <= 1;
      return `
        <tr>
          <td style="padding:12px 16px;border-bottom:1px solid #e7e5e4;">
            <div style="font-weight:600;color:#1c1917;">${escapeHtml(item.title)}</div>
            <div style="margin-top:2px;font-size:13px;color:#57534e;">${formatDueDate(item.dueDate)}</div>
          </td>
          <td style="padding:12px 16px;border-bottom:1px solid #e7e5e4;text-align:right;white-space:nowrap;">
            <span style="display:inline-block;padding:3px 10px;border-radius:999px;font-size:12px;font-weight:600;${
              urgent
                ? "background:#fee2e2;color:#b91c1c;"
                : "background:#fef3c7;color:#92400e;"
            }">${daysLeftLabel(item.daysLeft)}</span>
          </td>
        </tr>`;
    })
    .join("");

  const count = items.length;
  const subject =
    count === 1
      ? `Reminder: ${items[0].title}`
      : `Reminder: ${count} upcoming deadlines`;

  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#fafaf9;padding:32px 16px;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e7e5e4;border-radius:16px;overflow:hidden;">
      <div style="padding:24px 24px 8px;">
        <div style="font-size:18px;font-weight:700;color:#1c1917;">Guardian</div>
        <p style="margin:16px 0 4px;font-size:15px;color:#1c1917;">
          You have ${count === 1 ? "an upcoming deadline" : `${count} upcoming deadlines`} from your documents:
        </p>
      </div>
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">
        ${rows}
      </table>
      <div style="padding:16px 24px 24px;">
        <p style="margin:0;font-size:13px;color:#57534e;line-height:1.6;">
          These dates were extracted from documents you uploaded. Always verify
          deadlines against the original document. You can dismiss alerts on your
          dashboard, or turn off reminder emails in Settings.
        </p>
      </div>
    </div>
  </div>`;

  const text = [
    count === 1
      ? "You have an upcoming deadline from your documents:"
      : `You have ${count} upcoming deadlines from your documents:`,
    "",
    ...items.map(
      (item) =>
        `- ${item.title} — ${formatDueDate(item.dueDate)} (${daysLeftLabel(item.daysLeft)})`
    ),
    "",
    "These dates were extracted from documents you uploaded. Always verify deadlines against the original document.",
    "You can dismiss alerts on your dashboard, or turn off reminder emails in Settings.",
  ].join("\n");

  return { subject, html, text };
}

/**
 * Sends a deadline reminder email. Returns false (without throwing) when
 * Resend isn't configured or the send fails, so the cron can skip stamping.
 */
export async function sendReminderEmail(to: string, items: ReminderItem[]) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || items.length === 0) return false;

  const from =
    process.env.REMINDER_FROM_EMAIL ?? "Guardian <onboarding@resend.dev>";
  const resend = new Resend(apiKey);
  const { subject, html, text } = renderReminderEmail(items);

  const { error } = await resend.emails.send({ from, to, subject, html, text });
  if (error) {
    console.error("Reminder email failed:", to, error.message);
    return false;
  }
  return true;
}
