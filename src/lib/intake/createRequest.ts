import "server-only";

import { appBaseUrl } from "@/lib/profiles/invitations";
import {
  normalizeInviteEmail,
  isValidInviteEmail,
} from "@/lib/profiles/invitations";
import { createAccessToken, hashAccessToken } from "@/lib/payroll/tokens";
import { INTAKE_TTL_DAYS } from "./types";

export function intakePortalUrl(token: string): string {
  return `${appBaseUrl()}/intake/${encodeURIComponent(token)}`;
}

export function intakeExpiresAt(from = new Date()): string {
  const expires = new Date(from);
  expires.setUTCDate(expires.getUTCDate() + INTAKE_TTL_DAYS);
  return expires.toISOString();
}

export async function createIntakeRequestRecord(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  args: {
    profileId: string;
    employeeProfileId: string;
    recipientEmail: string;
    recipientName?: string;
    purpose: "ssn_clearance" | "w9" | "onboarding";
    requireEmailVerification: boolean;
    optionalMessage?: string;
    createdBy: string;
  }
): Promise<{
  token: string;
  url: string;
  requestId: string;
  expiresAt: string;
} | null> {
  const normalized = normalizeInviteEmail(args.recipientEmail);
  if (!isValidInviteEmail(normalized)) return null;

  const token = createAccessToken();
  const tokenHash = hashAccessToken(token);
  const expiresAt = intakeExpiresAt();

  const { data, error } = await supabase
    .from("contractor_intake_requests")
    .insert({
      profile_id: args.profileId,
      employee_profile_id: args.employeeProfileId,
      recipient_email: args.recipientEmail.trim(),
      recipient_email_normalized: normalized,
      recipient_name: args.recipientName?.trim() || null,
      purpose: args.purpose,
      access_token_hash: tokenHash,
      require_email_verification: args.requireEmailVerification,
      expires_at: expiresAt,
      optional_message: args.optionalMessage?.trim() || null,
      created_by: args.createdBy,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("createIntakeRequestRecord:", error?.message);
    return null;
  }

  return {
    token,
    url: intakePortalUrl(token),
    requestId: data.id,
    expiresAt,
  };
}
