import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  hashAccessToken,
  hashVerificationCode,
  tokensMatch,
} from "@/lib/payroll/tokens";
import type { ContractorIntakeRequest } from "./types";

export type IntakeLookupResult =
  | { ok: true; request: ContractorIntakeRequest; admin: SupabaseClient }
  | { ok: false; status: number; error: string };

export async function lookupIntakeByToken(
  token: string
): Promise<IntakeLookupResult> {
  if (!token || token.length < 16 || token.length > 128) {
    return { ok: false, status: 400, error: "Invalid access link." };
  }

  const admin = createAdminClient();
  if (!admin) {
    return {
      ok: false,
      status: 503,
      error: "Secure intake isn't configured.",
    };
  }

  const tokenHash = hashAccessToken(token);
  const { data, error } = await admin
    .from("contractor_intake_requests")
    .select("*")
    .eq("access_token_hash", tokenHash)
    .maybeSingle();

  if (error || !data) {
    return {
      ok: false,
      status: 404,
      error: "This link is invalid or has been removed.",
    };
  }

  const request = data as ContractorIntakeRequest;

  if (request.revoked_at || request.status === "revoked") {
    return {
      ok: false,
      status: 410,
      error: "This link has been revoked.",
    };
  }

  if (request.status === "submitted") {
    return {
      ok: false,
      status: 410,
      error: "Information has already been submitted for this request.",
    };
  }

  if (new Date(request.expires_at).getTime() < Date.now()) {
    if (request.status !== "expired") {
      await admin
        .from("contractor_intake_requests")
        .update({ status: "expired" })
        .eq("id", request.id);
    }
    return { ok: false, status: 410, error: "This link has expired." };
  }

  return { ok: true, request, admin };
}

export async function logIntakeAccess(
  admin: SupabaseClient,
  args: {
    requestId: string;
    action: string;
    recipientEmail?: string;
    actorUserId?: string;
    ipAddress?: string;
    userAgent?: string;
    details?: Record<string, unknown>;
  }
): Promise<void> {
  await admin.from("contractor_intake_access_logs").insert({
    intake_request_id: args.requestId,
    action: args.action,
    recipient_email: args.recipientEmail ?? null,
    actor_user_id: args.actorUserId ?? null,
    ip_address: args.ipAddress ?? null,
    user_agent: args.userAgent ?? null,
    details: args.details ?? {},
  });
}

const MAX_CODE_ATTEMPTS = 5;
const CODE_TTL_MINUTES = 10;
const MAX_CODES_PER_HOUR = 5;

export async function requestIntakeVerificationCode(
  admin: SupabaseClient,
  request: ContractorIntakeRequest,
  ipAddress?: string
): Promise<{ ok: true; code: string } | { ok: false; error: string }> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await admin
    .from("contractor_intake_verification_codes")
    .select("id", { count: "exact", head: true })
    .eq("intake_request_id", request.id)
    .gte("created_at", oneHourAgo);

  if ((count ?? 0) >= MAX_CODES_PER_HOUR) {
    return {
      ok: false,
      error: "Too many verification requests. Try again later.",
    };
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expires = new Date();
  expires.setMinutes(expires.getMinutes() + CODE_TTL_MINUTES);

  const { error } = await admin.from("contractor_intake_verification_codes").insert({
    intake_request_id: request.id,
    recipient_email: request.recipient_email,
    recipient_email_normalized: request.recipient_email_normalized,
    code_hash: hashVerificationCode(code),
    expires_at: expires.toISOString(),
  });

  if (error) {
    return { ok: false, error: "Couldn't send verification code." };
  }

  await logIntakeAccess(admin, {
    requestId: request.id,
    action: "code_requested",
    recipientEmail: request.recipient_email,
    ipAddress,
  });

  return { ok: true, code };
}

export async function verifyIntakeCode(
  admin: SupabaseClient,
  request: ContractorIntakeRequest,
  code: string,
  ipAddress?: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: codes, error } = await admin
    .from("contractor_intake_verification_codes")
    .select("*")
    .eq("intake_request_id", request.id)
    .is("used_at", null)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error || !codes?.length) {
    return {
      ok: false,
      error: "No active verification code. Request a new one.",
    };
  }

  const record = codes[0] as {
    id: string;
    code_hash: string;
    expires_at: string;
    attempt_count: number;
  };

  if (record.attempt_count >= MAX_CODE_ATTEMPTS) {
    return {
      ok: false,
      error: "Too many failed attempts. Request a new code.",
    };
  }

  if (new Date(record.expires_at).getTime() < Date.now()) {
    return {
      ok: false,
      error: "Verification code expired. Request a new one.",
    };
  }

  const valid = tokensMatch(record.code_hash, code, hashVerificationCode);

  if (!valid) {
    await admin
      .from("contractor_intake_verification_codes")
      .update({ attempt_count: record.attempt_count + 1 })
      .eq("id", record.id);
    await logIntakeAccess(admin, {
      requestId: request.id,
      action: "access_denied",
      recipientEmail: request.recipient_email,
      ipAddress,
      details: { reason: "invalid_code" },
    });
    return { ok: false, error: "Invalid verification code." };
  }

  await admin
    .from("contractor_intake_verification_codes")
    .update({ used_at: new Date().toISOString() })
    .eq("id", record.id);

  await logIntakeAccess(admin, {
    requestId: request.id,
    action: "verified",
    recipientEmail: request.recipient_email,
    ipAddress,
  });

  return { ok: true };
}

export async function getIntakeBusinessName(
  admin: SupabaseClient,
  profileId: string
): Promise<string> {
  const { data } = await admin
    .from("guardian_profiles")
    .select("display_name, business_legal_name, company_name")
    .eq("id", profileId)
    .maybeSingle();

  const row = data as {
    display_name?: string;
    business_legal_name?: string;
    company_name?: string;
  } | null;

  return (
    row?.business_legal_name?.trim() ||
    row?.company_name?.trim() ||
    row?.display_name?.trim() ||
    "Your organization"
  );
}

export async function getIntakeEmployeeName(
  admin: SupabaseClient,
  employeeProfileId: string
): Promise<string> {
  const { data } = await admin
    .from("guardian_profiles")
    .select("display_name")
    .eq("id", employeeProfileId)
    .maybeSingle();

  return (data as { display_name?: string } | null)?.display_name?.trim() || "Contractor";
}
