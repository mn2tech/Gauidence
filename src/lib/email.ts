import "server-only";

import { Resend } from "resend";

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
  // Noon UTC + UTC zone: avoid Eastern shifting YYYY-MM-DD back one day.
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
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

export type VaultInviteEmailArgs = {
  to: string;
  vaultName: string;
  inviterName: string;
  acceptUrl: string;
  accessRole?: "editor" | "viewer";
};

function vaultInviteAccessLabel(role: "editor" | "viewer" | undefined): string {
  return role === "viewer" ? "a Viewer" : "an Editor";
}

function vaultInviteAccessDescription(role: "editor" | "viewer" | undefined): string {
  if (role === "viewer") {
    return "You can view documents and ask Gideon about that vault. You cannot add or edit vault content.";
  }
  return "You can add documents and Daily Logs, and ask Gideon about that vault.";
}

export function renderVaultInviteEmail(args: VaultInviteEmailArgs) {
  const accessLabel = vaultInviteAccessLabel(args.accessRole);
  const accessDescription = vaultInviteAccessDescription(args.accessRole);
  const subject = `${args.inviterName} invited you to a Guardian vault`;
  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#fafaf9;padding:32px 16px;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e7e5e4;border-radius:16px;overflow:hidden;">
      <div style="padding:24px;">
        <div style="font-size:18px;font-weight:700;color:#1c1917;">Guardian</div>
        <p style="margin:16px 0 8px;font-size:15px;color:#1c1917;line-height:1.5;">
          ${escapeHtml(args.inviterName)} invited you to collaborate on
          <strong>${escapeHtml(args.vaultName)}</strong> as ${accessLabel}.
        </p>
        <p style="margin:0 0 20px;font-size:14px;color:#57534e;line-height:1.6;">
          ${escapeHtml(accessDescription)}
          Your Gideon conversations stay private to you.
        </p>
        <a href="${escapeHtml(args.acceptUrl)}"
          style="display:inline-block;padding:12px 20px;border-radius:999px;background:#0f766e;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;">
          Accept invitation
        </a>
        <p style="margin:20px 0 0;font-size:12px;color:#78716c;line-height:1.5;">
          This link expires in 7 days. If you didn’t expect this email, you can ignore it.
        </p>
      </div>
    </div>
  </div>`;
  const text = [
    `${args.inviterName} invited you to collaborate on ${args.vaultName} as ${accessLabel}.`,
    "",
    accessDescription,
    "Your Gideon conversations stay private to you.",
    "",
    `Accept: ${args.acceptUrl}`,
    "",
    "This link expires in 7 days.",
  ].join("\n");
  return { subject, html, text };
}

export type VaultActivityKind = "document" | "daily_log";

export type VaultActivityEmailArgs = {
  to: string;
  vaultName: string;
  actorName: string;
  kind: VaultActivityKind;
  itemLabel: string;
  preview?: string | null;
  openUrl: string;
};

function vaultActivityKindLabel(kind: VaultActivityKind): string {
  return kind === "document" ? "a document" : "a Daily Log";
}

export function renderVaultActivityEmail(args: VaultActivityEmailArgs) {
  const action =
    args.kind === "document"
      ? `uploaded <strong>${escapeHtml(args.itemLabel)}</strong>`
      : `added ${escapeHtml(args.itemLabel)}`;
  const subject = `${args.actorName} updated ${args.vaultName} in Guardian`;
  const preview = args.preview?.trim();
  const previewBlock = preview
    ? `<p style="margin:12px 0 0;padding:12px 14px;border-left:3px solid #0f766e;background:#f5f5f4;border-radius:8px;font-size:14px;color:#44403c;line-height:1.5;white-space:pre-wrap;">${escapeHtml(preview)}</p>`
    : "";

  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#fafaf9;padding:32px 16px;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e7e5e4;border-radius:16px;overflow:hidden;">
      <div style="padding:24px;">
        <div style="font-size:18px;font-weight:700;color:#1c1917;">Guardian</div>
        <p style="margin:16px 0 8px;font-size:15px;color:#1c1917;line-height:1.5;">
          <strong>${escapeHtml(args.actorName)}</strong> ${action} to
          <strong>${escapeHtml(args.vaultName)}</strong>.
        </p>
        <p style="margin:0;font-size:14px;color:#57534e;line-height:1.6;">
          Someone on your team added ${vaultActivityKindLabel(args.kind)} to a shared vault you can access.
        </p>
        ${previewBlock}
        <a href="${escapeHtml(args.openUrl)}"
          style="display:inline-block;margin-top:20px;padding:12px 20px;border-radius:999px;background:#0f766e;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;">
          Open vault
        </a>
        <p style="margin:20px 0 0;font-size:12px;color:#78716c;line-height:1.5;">
          You can turn off shared vault activity emails in Settings.
        </p>
      </div>
    </div>
  </div>`;

  const textLines = [
    `${args.actorName} updated ${args.vaultName} in Guardian.`,
    "",
    args.kind === "document"
      ? `Uploaded: ${args.itemLabel}`
      : `Daily Log: ${args.itemLabel}`,
  ];
  if (preview) {
    textLines.push("", preview);
  }
  textLines.push("", `Open vault: ${args.openUrl}`, "", "Turn off these emails in Settings.");
  const text = textLines.join("\n");

  return { subject, html, text };
}

/** Sends a shared-vault activity email. Returns false when Resend isn't configured. */
export async function sendVaultActivityEmail(args: VaultActivityEmailArgs) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;

  const from =
    process.env.INVITE_FROM_EMAIL ??
    process.env.REMINDER_FROM_EMAIL ??
    "Guardian <onboarding@resend.dev>";
  const resend = new Resend(apiKey);
  const { subject, html, text } = renderVaultActivityEmail(args);
  const { error } = await resend.emails.send({
    from,
    to: args.to,
    subject,
    html,
    text,
  });
  if (error) {
    console.error("Vault activity email failed:", args.to, error.message);
    return false;
  }
  return true;
}

export type ExpertAssignedEmailArgs = {
  to: string;
  expertName: string;
  expertDescription: string;
  assignerName: string;
  openUrl: string;
};

export function renderExpertAssignedEmail(args: ExpertAssignedEmailArgs) {
  const subject = `You have a new Guardian Expert: ${args.expertName}`;
  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#fafaf9;padding:32px 16px;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e7e5e4;border-radius:16px;overflow:hidden;">
      <div style="padding:24px;">
        <div style="font-size:18px;font-weight:700;color:#1c1917;">Guardian</div>
        <p style="margin:16px 0 8px;font-size:15px;color:#1c1917;line-height:1.5;">
          ${escapeHtml(args.assignerName)} assigned
          <strong>${escapeHtml(args.expertName)}</strong> to your account.
        </p>
        <p style="margin:0 0 20px;font-size:14px;color:#57534e;line-height:1.6;">
          ${escapeHtml(args.expertDescription)}
        </p>
        <a href="${escapeHtml(args.openUrl)}"
          style="display:inline-block;padding:12px 20px;border-radius:999px;background:#0f766e;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;">
          Open Guardian Experts
        </a>
        <p style="margin:20px 0 0;font-size:12px;color:#78716c;line-height:1.5;">
          Sign in with this email address to start learning. If you didn’t expect this email, you can ignore it.
        </p>
      </div>
    </div>
  </div>`;
  const text = [
    `${args.assignerName} assigned ${args.expertName} to your Guardian account.`,
    "",
    args.expertDescription,
    "",
    `Open Guardian Experts: ${args.openUrl}`,
    "",
    "Sign in with this email address to start learning.",
  ].join("\n");
  return { subject, html, text };
}

/** Sends an expert assignment notification. Returns false when Resend isn't configured. */
export async function sendExpertAssignedEmail(args: ExpertAssignedEmailArgs) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;

  const from =
    process.env.INVITE_FROM_EMAIL ??
    process.env.REMINDER_FROM_EMAIL ??
    "Guardian <onboarding@resend.dev>";
  const resend = new Resend(apiKey);
  const { subject, html, text } = renderExpertAssignedEmail(args);
  const { error } = await resend.emails.send({
    from,
    to: args.to,
    subject,
    html,
    text,
  });
  if (error) {
    console.error("Expert assigned email failed:", args.to, error.message);
    return false;
  }
  return true;
}

/** Sends a vault collaborator invite. Returns false when Resend isn't configured. */
export async function sendVaultInviteEmail(args: VaultInviteEmailArgs) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;

  const from =
    process.env.INVITE_FROM_EMAIL ??
    process.env.REMINDER_FROM_EMAIL ??
    "Guardian <onboarding@resend.dev>";
  const resend = new Resend(apiKey);
  const { subject, html, text } = renderVaultInviteEmail(args);
  const { error } = await resend.emails.send({
    from,
    to: args.to,
    subject,
    html,
    text,
  });
  if (error) {
    console.error("Vault invite email failed:", args.to, error.message);
    return false;
  }
  return true;
}
