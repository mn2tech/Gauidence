import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  accountAgeHours,
  retentionEmailsToTry,
} from "@/lib/retention/eligibility";
import { sendRetentionEmail } from "@/lib/retention/email";
import {
  RETENTION_EMAIL_KEYS,
  type RetentionEmailKey,
  type UserActivitySnapshot,
} from "@/lib/retention/types";

export type RetentionProfileRow = {
  id: string;
  email: string;
  full_name: string | null;
  created_at: string;
  email_tips_enabled: boolean;
};

async function loadSentKeys(userId: string): Promise<Set<RetentionEmailKey>> {
  const admin = createAdminClient();
  if (!admin) return new Set();

  const { data, error } = await admin
    .from("user_retention_emails")
    .select("email_key")
    .eq("user_id", userId);

  if (error) {
    console.error("user_retention_emails load failed:", error.message);
    return new Set();
  }

  const sent = new Set<RetentionEmailKey>();
  for (const row of data ?? []) {
    const key = row.email_key as string;
    if ((RETENTION_EMAIL_KEYS as readonly string[]).includes(key)) {
      sent.add(key as RetentionEmailKey);
    }
  }
  return sent;
}

async function recordSent(userId: string, key: RetentionEmailKey): Promise<boolean> {
  const admin = createAdminClient();
  if (!admin) return false;

  const { error } = await admin.from("user_retention_emails").insert({
    user_id: userId,
    email_key: key,
  });

  if (error) {
    if (error.code === "23505") return false;
    console.error("user_retention_emails insert failed:", error.message);
    return false;
  }
  return true;
}

export async function loadUserActivity(
  admin: SupabaseClient,
  userId: string
): Promise<UserActivitySnapshot> {
  const [
    vaultRes,
    docRes,
    chatRes,
    researchRes,
  ] = await Promise.all([
    admin
      .from("guardian_profiles")
      .select("id", { count: "exact", head: true })
      .eq("owner_user_id", userId),
    admin
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId),
    admin
      .from("vault_chats")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId),
    admin
      .from("chat_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("feature", "research"),
  ]);

  return {
    hasVault: (vaultRes.count ?? 0) > 0,
    hasDocument: (docRes.count ?? 0) > 0,
    hasAskedGideon: (chatRes.count ?? 0) > 0,
    hasResearch: (researchRes.count ?? 0) > 0,
  };
}

export type RetentionSendResult = {
  sent: RetentionEmailKey[];
  skipped: boolean;
};

/**
 * Send any due retention emails for one user. Idempotent per email key.
 */
export async function processRetentionForUser(
  profile: RetentionProfileRow,
  activity?: UserActivitySnapshot
): Promise<RetentionSendResult> {
  if (!profile.email?.trim() || profile.email_tips_enabled === false) {
    return { sent: [], skipped: true };
  }

  const admin = createAdminClient();
  if (!admin) return { sent: [], skipped: true };

  const sentKeys = await loadSentKeys(profile.id);
  const ageHrs = accountAgeHours(profile.created_at);
  const snap =
    activity ?? (await loadUserActivity(admin, profile.id));
  const due = retentionEmailsToTry(ageHrs, snap, sentKeys);
  if (due.length === 0) {
    return { sent: [], skipped: false };
  }

  // At most one retention email per user per cron run (avoids catch-up bursts).
  const key = due[0]!;
  const ok = await sendRetentionEmail(profile.email, key, {
    fullName: profile.full_name,
  });
  if (!ok) return { sent: [], skipped: false };

  const recorded = await recordSent(profile.id, key);
  return { sent: recorded ? [key] : [], skipped: false };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type ProductEmailCampaignResult = {
  candidates: number;
  sent: number;
  skippedAlreadySent: number;
  skippedOptOut: number;
  failed: number;
  dryRun: boolean;
};

/**
 * One-time product announcement to all users with tips emails enabled.
 * Idempotent per user via user_retention_emails.
 */
export async function runProductEmailCampaign(
  key: RetentionEmailKey,
  options?: { dryRun?: boolean; limit?: number; delayMs?: number }
): Promise<ProductEmailCampaignResult> {
  const dryRun = options?.dryRun ?? false;
  const limit = options?.limit;
  const delayMs = options?.delayMs ?? 120;

  const admin = createAdminClient();
  if (!admin) {
    return {
      candidates: 0,
      sent: 0,
      skippedAlreadySent: 0,
      skippedOptOut: 0,
      failed: 0,
      dryRun,
    };
  }

  const { data: profiles, error } = await admin
    .from("profiles")
    .select("id, email, full_name, created_at, email_tips_enabled")
    .not("email", "is", null);

  if (error) {
    console.error("product email profiles load failed:", error.message);
    return {
      candidates: 0,
      sent: 0,
      skippedAlreadySent: 0,
      skippedOptOut: 0,
      failed: 0,
      dryRun,
    };
  }

  let sent = 0;
  let skippedAlreadySent = 0;
  let skippedOptOut = 0;
  let failed = 0;
  let candidates = 0;

  for (const row of (profiles ?? []) as RetentionProfileRow[]) {
    if (limit != null && sent >= limit) break;

    if (!row.email?.trim()) continue;
    if (row.email_tips_enabled === false) {
      skippedOptOut += 1;
      continue;
    }

    const sentKeys = await loadSentKeys(row.id);
    if (sentKeys.has(key)) {
      skippedAlreadySent += 1;
      continue;
    }

    candidates += 1;
    if (dryRun) {
      if (limit != null && candidates >= limit) break;
      continue;
    }

    const ok = await sendRetentionEmail(row.email, key, {
      fullName: row.full_name,
    });
    if (!ok) {
      failed += 1;
      continue;
    }

    const recorded = await recordSent(row.id, key);
    if (recorded) {
      sent += 1;
      if (limit != null && sent >= limit) break;
    }

    if (delayMs > 0) await sleep(delayMs);
  }

  return {
    candidates,
    sent,
    skippedAlreadySent,
    skippedOptOut,
    failed,
    dryRun,
  };
}

/** Welcome email only — used from auth callback after signup. */
export async function trySendWelcomeEmail(userId: string): Promise<boolean> {
  const admin = createAdminClient();
  if (!admin) return false;

  const { data: profile } = await admin
    .from("profiles")
    .select("id, email, full_name, created_at, email_tips_enabled")
    .eq("id", userId)
    .maybeSingle();

  if (!profile?.email || profile.email_tips_enabled === false) return false;

  const sentKeys = await loadSentKeys(userId);
  if (sentKeys.has("welcome")) return false;

  const ok = await sendRetentionEmail(profile.email, "welcome", {
    fullName: profile.full_name,
  });
  if (!ok) return false;
  return recordSent(userId, "welcome");
}

export async function runRetentionCampaign(): Promise<{
  usersProcessed: number;
  emailsSent: number;
  byKey: Record<RetentionEmailKey, number>;
}> {
  const admin = createAdminClient();
  if (!admin) {
    return {
      usersProcessed: 0,
      emailsSent: 0,
      byKey: {
        welcome: 0,
        nudge_no_vault: 0,
        nudge_no_document: 0,
        nudge_try_gideon: 0,
        product_gideon_attachments: 0,
      },
    };
  }

  const cutoff = new Date(Date.now() - 30 * 24 * 3_600_000).toISOString();
  const { data: profiles, error } = await admin
    .from("profiles")
    .select("id, email, full_name, created_at, email_tips_enabled")
    .not("email", "is", null)
    .eq("email_tips_enabled", true)
    .gte("created_at", cutoff);

  if (error) {
    console.error("retention profiles load failed:", error.message);
    return {
      usersProcessed: 0,
      emailsSent: 0,
      byKey: {
        welcome: 0,
        nudge_no_vault: 0,
        nudge_no_document: 0,
        nudge_try_gideon: 0,
        product_gideon_attachments: 0,
      },
    };
  }

  const byKey: Record<RetentionEmailKey, number> = {
    welcome: 0,
    nudge_no_vault: 0,
    nudge_no_document: 0,
    nudge_try_gideon: 0,
    product_gideon_attachments: 0,
  };

  let emailsSent = 0;
  const rows = (profiles ?? []) as RetentionProfileRow[];

  for (const profile of rows) {
    const result = await processRetentionForUser(profile);
    for (const key of result.sent) {
      byKey[key] += 1;
      emailsSent += 1;
    }
  }

  return { usersProcessed: rows.length, emailsSent, byKey };
}
