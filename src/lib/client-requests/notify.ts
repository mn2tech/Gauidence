import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { sendClientRequestEmail, type ClientRequestEmailKind } from "@/lib/email";
import { appBaseUrl } from "@/lib/profiles/invitations";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  filterActivityEmailRecipients,
  formatVaultActivityVaultName,
  pickVaultActivityRecipients,
  truncateActivityPreview,
} from "@/lib/vault/notifyActivity";

export type ClientRequestNotifyPayload = {
  profileId: string;
  actorUserId: string;
  requestId: string;
  requestTitle: string;
  preview?: string | null;
  kind: ClientRequestEmailKind;
  /** When set, only these users receive email (e.g. assignee). */
  notifyUserIds?: string[];
};

export async function notifyClientRequestActivity(
  _supabase: SupabaseClient,
  payload: ClientRequestNotifyPayload
): Promise<{ sent: number; skipped: boolean }> {
  const admin = createAdminClient();
  if (!admin) {
    console.warn("Client request notify skipped: admin client not configured.");
    return { sent: 0, skipped: true };
  }

  const { profileId, actorUserId, requestId, requestTitle, preview, kind } =
    payload;

  const [{ data: members }, { data: vault }] = await Promise.all([
    admin
      .from("guardian_profile_members")
      .select("user_id")
      .eq("profile_id", profileId),
    admin
      .from("guardian_profiles")
      .select("display_name, parent_profile_id")
      .eq("id", profileId)
      .maybeSingle(),
  ]);

  const memberIds = (members ?? []).map((m) => String(m.user_id));
  const recipientIds =
    payload.notifyUserIds?.length
      ? payload.notifyUserIds.filter((id) => id !== actorUserId)
      : pickVaultActivityRecipients(memberIds, actorUserId);
  if (recipientIds.length === 0) {
    return { sent: 0, skipped: true };
  }

  const parentProfileId = vault?.parent_profile_id as string | null | undefined;
  let parentDisplayName: string | null = null;
  if (parentProfileId) {
    const { data: parentVault } = await admin
      .from("guardian_profiles")
      .select("display_name")
      .eq("id", parentProfileId)
      .maybeSingle();
    parentDisplayName = (parentVault?.display_name as string | null) ?? null;
  }

  const vaultName = formatVaultActivityVaultName(
    String(vault?.display_name ?? ""),
    parentDisplayName
  );
  const openUrl = `${appBaseUrl()}/requests?id=${requestId}`;

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
      const ok = await sendClientRequestEmail({
        to: recipient.email,
        vaultName,
        actorName,
        requestTitle,
        preview: preview ? truncateActivityPreview(preview) : null,
        openUrl,
        kind,
      });
      if (ok) sent += 1;
    })
  );

  return { sent, skipped: false };
}
