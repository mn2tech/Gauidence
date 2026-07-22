import "server-only";

import { Resend } from "resend";
import { awardByKey, type AwardKey } from "@/lib/awards/definitions";
import { appBaseUrl } from "@/lib/profiles/invitations";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderAwardEarnedEmail(awardKey: AwardKey, firstName: string) {
  const award = awardByKey(awardKey);
  const dashboard = `${appBaseUrl()}/dashboard`;
  const subject = `You earned the ${award.title} award in Guardian`;

  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#fafaf9;padding:32px 16px;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e7e5e4;border-radius:16px;overflow:hidden;">
      <div style="padding:24px;">
        <div style="font-size:18px;font-weight:700;color:#1c1917;">Guardian</div>
        <p style="margin:16px 0 8px;font-size:15px;color:#1c1917;line-height:1.5;">
          Hi ${escapeHtml(firstName)}, congratulations!
        </p>
        <p style="margin:0 0 4px;font-size:14px;color:#57534e;line-height:1.6;">
          You earned the <strong>${escapeHtml(award.title)}</strong> award —
          ${escapeHtml(award.description)}
        </p>
        <a href="${escapeHtml(dashboard)}"
          style="display:inline-block;margin-top:20px;padding:12px 20px;border-radius:999px;background:#0f766e;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;">
          Open your dashboard
        </a>
        <p style="margin:24px 0 0;font-size:12px;color:#78716c;line-height:1.5;">
          You can turn off getting-started and award emails in Guardian Settings.
        </p>
      </div>
    </div>
  </div>`;

  const text = [
    `Hi ${firstName}, congratulations!`,
    "",
    `You earned the ${award.title} award — ${award.description}`,
    "",
    `Open your dashboard: ${dashboard}`,
  ].join("\n");

  return { subject, html, text };
}

export async function sendAwardEarnedEmail(
  to: string,
  awardKey: AwardKey,
  firstName: string
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;

  const from =
    process.env.TIPS_FROM_EMAIL ??
    process.env.REMINDER_FROM_EMAIL ??
    "Guardian <onboarding@resend.dev>";
  const { subject, html, text } = renderAwardEarnedEmail(awardKey, firstName);
  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({ from, to, subject, html, text });
  if (error) {
    console.error("Award email failed:", to, error.message);
    return false;
  }
  return true;
}
