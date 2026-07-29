import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { appBaseUrl } from "@/lib/profiles/invitations";
import { normalizeInviteEmail, isValidInviteEmail } from "@/lib/profiles/invitations";
import { createAccessToken, hashAccessToken } from "./tokens";
import type { PayrollExportFormat } from "./types";

export function payrollShareUrl(token: string): string {
  return `${appBaseUrl()}/payroll-share/${encodeURIComponent(token)}`;
}

export function shareExpiresAt(hours: number, from = new Date()): string {
  const expires = new Date(from);
  expires.setTime(expires.getTime() + hours * 60 * 60 * 1000);
  return expires.toISOString();
}

export async function createPayrollShare(
  supabase: SupabaseClient,
  args: {
    reportId: string;
    profileId: string;
    recipientEmail: string;
    recipientName?: string;
    accessType: "view_only" | "view_and_download";
    allowedFormats: PayrollExportFormat[];
    expiresAt: string;
    requireEmailVerification: boolean;
    optionalMessage?: string;
    createdBy: string;
  }
): Promise<{ token: string; url: string; shareId: string; expiresAt: string } | null> {
  const normalized = normalizeInviteEmail(args.recipientEmail);
  if (!isValidInviteEmail(normalized)) return null;

  const token = createAccessToken();
  const tokenHash = hashAccessToken(token);

  const { data, error } = await supabase
    .from("payroll_shares")
    .insert({
      payroll_report_id: args.reportId,
      profile_id: args.profileId,
      recipient_email: args.recipientEmail.trim(),
      recipient_email_normalized: normalized,
      recipient_name: args.recipientName?.trim() || null,
      access_token_hash: tokenHash,
      access_type: args.accessType,
      allowed_formats: args.allowedFormats,
      require_email_verification: args.requireEmailVerification,
      expires_at: args.expiresAt,
      optional_message: args.optionalMessage?.trim() || null,
      created_by: args.createdBy,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("createPayrollShare:", error?.message);
    return null;
  }

  return {
    token,
    url: payrollShareUrl(token),
    shareId: data.id,
    expiresAt: args.expiresAt,
  };
}

export async function revokePayrollShare(
  supabase: SupabaseClient,
  shareId: string
): Promise<boolean> {
  const { error } = await supabase
    .from("payroll_shares")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", shareId);

  return !error;
}
