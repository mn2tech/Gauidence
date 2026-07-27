import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { sendVaultActivityEmail, type VaultActivityKind } from "@/lib/email";
import { appBaseUrl } from "@/lib/profiles/invitations";
import { createAdminClient } from "@/lib/supabase/admin";
import { dailyLogHref, documentsHref } from "@/lib/routes";

export type VaultActivityPayload = {
  profileId: string;
  actorUserId: string;
  kind: VaultActivityKind;
  documentId?: string;
  logId?: string;
};

const PREVIEW_MAX = 280;

export function truncateActivityPreview(text: string, max = PREVIEW_MAX): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1).trimEnd()}…`;
}

export function dailyLogActivityLabel(title: string | null, content: string): string {
  const t = title?.trim();
  if (t) return t;
  const snippet = content.trim().split(/\n/)[0]?.trim() ?? "";
  if (!snippet) return "Daily Log";
  return truncateActivityPreview(snippet, 80);
}

type Recipient = { userId: string; email: string };

/** Members of a vault except the actor — only when the vault has 2+ members. */
export function pickVaultActivityRecipients(
  memberUserIds: string[],
  actorUserId: string
): string[] {
  if (memberUserIds.length < 2) return [];
  return memberUserIds.filter((id) => id !== actorUserId);
}

export function filterActivityEmailRecipients(
  recipients: Recipient[],
  prefs: Map<string, boolean | null | undefined>
): Recipient[] {
  return recipients.filter((r) => {
    const enabled = prefs.get(r.userId);
    return enabled !== false && Boolean(r.email?.trim());
  });
}

/**
 * Email other vault members when someone adds a document or Daily Log to a shared vault.
 * Fire-and-forget safe — logs errors, never throws to callers.
 */
export async function notifyVaultActivity(
  _supabase: SupabaseClient,
  payload: VaultActivityPayload
): Promise<{ sent: number; skipped: boolean }> {
  const admin = createAdminClient();
  if (!admin) {
    console.warn("Vault activity notify skipped: admin client not configured.");
    return { sent: 0, skipped: true };
  }

  const { profileId, actorUserId, kind, documentId, logId } = payload;

  const [{ data: members }, { data: vault }] = await Promise.all([
    admin
      .from("guardian_profile_members")
      .select("user_id")
      .eq("profile_id", profileId),
    admin
      .from("guardian_profiles")
      .select("display_name")
      .eq("id", profileId)
      .maybeSingle(),
  ]);

  const memberIds = (members ?? []).map((m) => String(m.user_id));
  const recipientIds = pickVaultActivityRecipients(memberIds, actorUserId);
  if (recipientIds.length === 0) {
    return { sent: 0, skipped: true };
  }

  const vaultName = vault?.display_name?.trim() || "Shared vault";
  const base = appBaseUrl();

  let itemLabel = kind === "document" ? "Document" : "Daily Log";
  let preview: string | null = null;
  let openUrl = `${base}${documentsHref(profileId)}`;

  if (kind === "document" && documentId) {
    const { data: doc } = await admin
      .from("documents")
      .select("file_name")
      .eq("id", documentId)
      .eq("profile_id", profileId)
      .maybeSingle();
    if (doc?.file_name) itemLabel = String(doc.file_name);
  }

  if (kind === "daily_log" && logId) {
    const { data: log } = await admin
      .from("daily_logs")
      .select("title, content")
      .eq("id", logId)
      .eq("profile_id", profileId)
      .maybeSingle();
    if (log) {
      itemLabel = dailyLogActivityLabel(
        (log.title as string | null) ?? null,
        String(log.content ?? "")
      );
      preview = truncateActivityPreview(String(log.content ?? ""));
    }
    openUrl = `${base}${dailyLogHref(profileId)}`;
  }

  const [{ data: actorProfile }, { data: recipientProfiles }] = await Promise.all([
    admin
      .from("profiles")
      .select("full_name, email")
      .eq("id", actorUserId)
      .maybeSingle(),
    admin
      .from("profiles")
      .select("id, email, email_vault_activity_enabled, full_name")
      .in("id", recipientIds),
  ]);

  const actorName =
    actorProfile?.full_name?.trim() ||
    actorProfile?.email?.split("@")[0]?.trim() ||
    "Someone";

  const prefs = new Map(
    (recipientProfiles ?? []).map((p) => [
      String(p.id),
      p.email_vault_activity_enabled as boolean | null | undefined,
    ])
  );

  const toEmail = filterActivityEmailRecipients(
    (recipientProfiles ?? []).map((p) => ({
      userId: String(p.id),
      email: String(p.email ?? "").trim(),
    })),
    prefs
  );

  let sent = 0;
  await Promise.all(
    toEmail.map(async (recipient) => {
      const ok = await sendVaultActivityEmail({
        to: recipient.email,
        vaultName,
        actorName,
        kind,
        itemLabel,
        preview: kind === "daily_log" ? preview : null,
        openUrl,
      });
      if (ok) sent += 1;
    })
  );

  return { sent, skipped: false };
}
