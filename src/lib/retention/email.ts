import "server-only";

import { Resend } from "resend";
import { appBaseUrl } from "@/lib/profiles/invitations";
import type { RetentionEmailKey } from "@/lib/retention/types";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function firstName(fullName: string | null | undefined, email: string): string {
  const fromName = fullName?.trim().split(/\s+/)[0];
  if (fromName) return fromName;
  const local = email.split("@")[0]?.trim();
  return local || "there";
}

function emailShell(bodyHtml: string) {
  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#fafaf9;padding:32px 16px;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e7e5e4;border-radius:16px;overflow:hidden;">
      <div style="padding:24px;">
        <div style="font-size:18px;font-weight:700;color:#1c1917;">Guardian</div>
        ${bodyHtml}
      </div>
    </div>
  </div>`;
}

function cta(href: string, label: string) {
  return `<a href="${escapeHtml(href)}"
    style="display:inline-block;margin-top:20px;padding:12px 20px;border-radius:999px;background:#0f766e;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;">
    ${escapeHtml(label)}
  </a>`;
}

function footerNote() {
  return `<p style="margin:24px 0 0;font-size:12px;color:#78716c;line-height:1.5;">
    You can turn off getting-started emails in Guardian Settings.
  </p>`;
}

export function renderRetentionEmail(
  key: RetentionEmailKey,
  args: { email: string; fullName?: string | null }
) {
  const base = appBaseUrl();
  const name = firstName(args.fullName, args.email);
  const dashboard = `${base}/dashboard`;
  const createVault = `${base}/settings/profiles?add=1`;
  const upload = `${base}/dashboard?camera=1`;
  const ask = `${base}/ask`;
  const help = `${base}/help`;

  switch (key) {
    case "welcome":
      return {
        subject: "Welcome to Guardian — create your first vault",
        html: emailShell(`
          <p style="margin:16px 0 8px;font-size:15px;color:#1c1917;line-height:1.5;">
            Hi ${escapeHtml(name)}, welcome to Guardian.
          </p>
          <p style="margin:0 0 4px;font-size:14px;color:#57534e;line-height:1.6;">
            Start by choosing who you&apos;re helping — yourself, family, a client,
            or another space. Then scan or upload a document so Guardian can find
            dates and key facts.
          </p>
          ${cta(createVault, "Create your first vault")}
          ${footerNote()}
        `),
        text: [
          `Hi ${name}, welcome to Guardian.`,
          "",
          "Start by choosing who you're helping, then scan or upload a document.",
          "",
          `Create your first vault: ${createVault}`,
          "",
          "You can turn off getting-started emails in Guardian Settings.",
        ].join("\n"),
      };
    case "nudge_no_vault":
      return {
        subject: "Finish setting up Guardian — who are you helping?",
        html: emailShell(`
          <p style="margin:16px 0 8px;font-size:15px;color:#1c1917;line-height:1.5;">
            Hi ${escapeHtml(name)}, you&apos;re one step away.
          </p>
          <p style="margin:0 0 4px;font-size:14px;color:#57534e;line-height:1.6;">
            Create a person or space so documents, Daily Logs, and Gideon have a
            home. It only takes a minute.
          </p>
          ${cta(createVault, "Choose a starting space")}
          ${footerNote()}
        `),
        text: [
          `Hi ${name}, you're one step away.`,
          "",
          "Create a person or space so your documents have a home.",
          "",
          `Get started: ${createVault}`,
        ].join("\n"),
      };
    case "nudge_no_document":
      return {
        subject: "Add your first document to Guardian",
        html: emailShell(`
          <p style="margin:16px 0 8px;font-size:15px;color:#1c1917;line-height:1.5;">
            Hi ${escapeHtml(name)}, your vault is ready.
          </p>
          <p style="margin:0 0 4px;font-size:14px;color:#57534e;line-height:1.6;">
            Scan or upload a PDF or photo — Guardian will read dates, names, and
            other facts so you can search and ask Gideon later.
          </p>
          ${cta(upload, "Scan or upload a document")}
          ${footerNote()}
        `),
        text: [
          `Hi ${name}, your vault is ready.`,
          "",
          "Scan or upload a document so Guardian can find key facts.",
          "",
          `Upload: ${upload}`,
        ].join("\n"),
      };
    case "nudge_try_gideon":
      return {
        subject: "Try Ask Gideon on your documents",
        html: emailShell(`
          <p style="margin:16px 0 8px;font-size:15px;color:#1c1917;line-height:1.5;">
            Hi ${escapeHtml(name)}, your documents are in Guardian.
          </p>
          <p style="margin:0 0 4px;font-size:14px;color:#57534e;line-height:1.6;">
            Ask Gideon a question about what&apos;s in your vault — or open
            <a href="${escapeHtml(help)}" style="color:#0f766e;">Help &amp; Quick Start</a>
            for a short walkthrough.
          </p>
          ${cta(ask, "Ask Gideon")}
          ${footerNote()}
        `),
        text: [
          `Hi ${name}, your documents are in Guardian.`,
          "",
          "Ask Gideon a question about what's in your vault.",
          "",
          `Ask Gideon: ${ask}`,
          `Quick Start: ${help}`,
        ].join("\n"),
      };
    default:
      throw new Error(`Unknown retention email: ${key}`);
  }
}

export async function sendRetentionEmail(
  to: string,
  key: RetentionEmailKey,
  args: { fullName?: string | null }
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;

  const from =
    process.env.TIPS_FROM_EMAIL ??
    process.env.REMINDER_FROM_EMAIL ??
    "Guardian <onboarding@resend.dev>";
  const { subject, html, text } = renderRetentionEmail(key, {
    email: to,
    fullName: args.fullName,
  });

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({ from, to, subject, html, text });
  if (error) {
    console.error("Retention email failed:", key, to, error.message);
    return false;
  }
  return true;
}
