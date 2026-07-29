import "server-only";

import { randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { appBaseUrl } from "@/lib/profiles/invitations";
import { normalizeInviteEmail, isValidInviteEmail } from "@/lib/profiles/invitations";

const REPORT_LINK_TTL_DAYS = 30;

export function createReportToken(): string {
  return randomBytes(32).toString("base64url");
}

export function reportLinkUrl(token: string): string {
  return `${appBaseUrl()}/recruit/report/${encodeURIComponent(token)}`;
}

export function authenticatedReportUrl(jobId: string): string {
  return `${appBaseUrl()}/recruit/${jobId}/report`;
}

export async function grantHiringManagerAccess(
  supabase: SupabaseClient,
  args: {
    jobId: string;
    email: string;
    sharedBy: string;
  }
): Promise<{ granted: boolean; userId?: string }> {
  const normalized = normalizeInviteEmail(args.email);
  if (!isValidInviteEmail(normalized)) return { granted: false };

  const admin = createAdminClient();
  if (!admin) return { granted: false };

  const { data: profile } = await admin
    .from("profiles")
    .select("id")
    .ilike("email", normalized)
    .maybeSingle();

  if (!profile?.id) return { granted: false };

  const { error } = await supabase.from("recruitment_job_shares").upsert(
    {
      job_id: args.jobId,
      user_id: profile.id,
      role: "hiring_manager",
      shared_by: args.sharedBy,
    },
    { onConflict: "job_id,user_id" }
  );

  if (error) {
    console.error("grantHiringManagerAccess:", error.message);
    return { granted: false };
  }

  return { granted: true, userId: profile.id };
}

export async function createReportLink(
  supabase: SupabaseClient,
  args: {
    jobId: string;
    email: string;
    createdBy: string;
    reportId?: string;
  }
): Promise<{ token: string; url: string; expiresAt: string } | null> {
  const normalized = normalizeInviteEmail(args.email);
  if (!isValidInviteEmail(normalized)) return null;

  const token = createReportToken();
  const expires = new Date();
  expires.setUTCDate(expires.getUTCDate() + REPORT_LINK_TTL_DAYS);
  const expiresAt = expires.toISOString();

  const { error } = await supabase.from("recruitment_report_links").insert({
    job_id: args.jobId,
    report_id: args.reportId ?? null,
    token,
    invited_email: args.email.trim(),
    invited_email_normalized: normalized,
    created_by: args.createdBy,
    expires_at: expiresAt,
  });

  if (error) {
    console.error("createReportLink:", error.message);
    return null;
  }

  return { token, url: reportLinkUrl(token), expiresAt };
}
