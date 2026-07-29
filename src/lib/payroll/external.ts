import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashAccessToken, hashVerificationCode, tokensMatch } from "./tokens";
import { getReportEntries } from "./server";
import type { ExternalPayrollReportData, PayrollShare } from "./types";
import { maskPayrollEmployeeId } from "./types";

export type ShareLookupResult =
  | { ok: true; share: PayrollShare; admin: SupabaseClient }
  | { ok: false; status: number; error: string };

export async function lookupShareByToken(token: string): Promise<ShareLookupResult> {
  if (!token || token.length < 16 || token.length > 128) {
    return { ok: false, status: 400, error: "Invalid access link." };
  }

  const admin = createAdminClient();
  if (!admin) {
    return { ok: false, status: 503, error: "Payroll sharing isn't configured." };
  }

  const tokenHash = hashAccessToken(token);
  const { data, error } = await admin
    .from("payroll_shares")
    .select("*")
    .eq("access_token_hash", tokenHash)
    .maybeSingle();

  if (error || !data) {
    return { ok: false, status: 404, error: "This access link is invalid or has been removed." };
  }

  const share = data as PayrollShare;

  if (share.revoked_at) {
    return { ok: false, status: 410, error: "This access link has been revoked." };
  }

  if (new Date(share.expires_at).getTime() < Date.now()) {
    return { ok: false, status: 410, error: "This access link has expired." };
  }

  return { ok: true, share, admin };
}

export async function logExternalAccess(
  admin: SupabaseClient,
  args: {
    shareId: string;
    action: string;
    recipientEmail?: string;
    ipAddress?: string;
    userAgent?: string;
    details?: Record<string, unknown>;
  }
): Promise<void> {
  await admin.from("payroll_share_access_logs").insert({
    payroll_share_id: args.shareId,
    action: args.action,
    recipient_email: args.recipientEmail ?? null,
    ip_address: args.ipAddress ?? null,
    user_agent: args.userAgent ?? null,
    details: args.details ?? {},
  });
}

export async function buildExternalReportData(
  admin: SupabaseClient,
  share: PayrollShare
): Promise<ExternalPayrollReportData | null> {
  const { data: report, error } = await admin
    .from("payroll_reports")
    .select("*")
    .eq("id", share.payroll_report_id)
    .maybeSingle();

  if (error || !report) return null;

  const r = report as {
    id: string;
    profile_id: string;
    pay_period_start: string;
    pay_period_end: string;
    status: string;
    approved_at: string | null;
    total_regular_hours: number;
    total_overtime_hours: number;
    total_hours: number;
  };

  if (r.status === "draft") return null;

  const { data: profile } = await admin
    .from("guardian_profiles")
    .select("display_name, company_name")
    .eq("id", r.profile_id)
    .maybeSingle();

  const businessName =
    (profile as { company_name?: string; display_name?: string } | null)?.company_name?.trim() ||
    (profile as { display_name?: string } | null)?.display_name?.trim() ||
    "Business";

  const entries = await getReportEntries(admin, r.id);

  return {
    businessName,
    payPeriodStart: r.pay_period_start,
    payPeriodEnd: r.pay_period_end,
    status: r.status as ExternalPayrollReportData["status"],
    approvedAt: r.approved_at,
    entries: entries.map((e) => ({
      employeeName: e.employee_name,
      payrollEmployeeId: maskPayrollEmployeeId(e.payroll_employee_id),
      regularHours: Number(e.regular_hours),
      overtimeHours: Number(e.overtime_hours),
      adjustmentHours: Number(e.adjustment_hours),
      totalHours: Number(e.total_hours) + Number(e.adjustment_hours),
      adjustmentReason: e.adjustment_reason,
    })),
    totals: {
      regularHours: Number(r.total_regular_hours),
      overtimeHours: Number(r.total_overtime_hours),
      totalHours: Number(r.total_hours),
    },
    accessType: share.access_type,
    allowedFormats: share.allowed_formats,
  };
}

const MAX_CODE_ATTEMPTS = 5;
const CODE_TTL_MINUTES = 10;
const MAX_CODES_PER_HOUR = 5;

export async function requestVerificationCode(
  admin: SupabaseClient,
  share: PayrollShare,
  ipAddress?: string
): Promise<{ ok: true; code: string } | { ok: false; error: string }> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await admin
    .from("payroll_verification_codes")
    .select("id", { count: "exact", head: true })
    .eq("payroll_share_id", share.id)
    .gte("created_at", oneHourAgo);

  if ((count ?? 0) >= MAX_CODES_PER_HOUR) {
    return { ok: false, error: "Too many verification requests. Try again later." };
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expires = new Date();
  expires.setMinutes(expires.getMinutes() + CODE_TTL_MINUTES);

  const { error } = await admin.from("payroll_verification_codes").insert({
    payroll_share_id: share.id,
    recipient_email: share.recipient_email,
    recipient_email_normalized: share.recipient_email_normalized,
    code_hash: hashVerificationCode(code),
    expires_at: expires.toISOString(),
  });

  if (error) {
    return { ok: false, error: "Couldn't send verification code." };
  }

  await logExternalAccess(admin, {
    shareId: share.id,
    action: "code_requested",
    recipientEmail: share.recipient_email,
    ipAddress,
  });

  return { ok: true, code };
}

export async function verifyCode(
  admin: SupabaseClient,
  share: PayrollShare,
  code: string,
  ipAddress?: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: codes, error } = await admin
    .from("payroll_verification_codes")
    .select("*")
    .eq("payroll_share_id", share.id)
    .is("used_at", null)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error || !codes?.length) {
    return { ok: false, error: "No active verification code. Request a new one." };
  }

  const record = codes[0] as {
    id: string;
    code_hash: string;
    expires_at: string;
    attempt_count: number;
  };

  if (record.attempt_count >= MAX_CODE_ATTEMPTS) {
    return { ok: false, error: "Too many failed attempts. Request a new code." };
  }

  if (new Date(record.expires_at).getTime() < Date.now()) {
    return { ok: false, error: "Verification code expired. Request a new one." };
  }

  const valid = tokensMatch(record.code_hash, code, hashVerificationCode);

  if (!valid) {
    await admin
      .from("payroll_verification_codes")
      .update({ attempt_count: record.attempt_count + 1 })
      .eq("id", record.id);
    await logExternalAccess(admin, {
      shareId: share.id,
      action: "access_denied",
      recipientEmail: share.recipient_email,
      ipAddress,
      details: { reason: "invalid_code" },
    });
    return { ok: false, error: "Invalid verification code." };
  }

  await admin
    .from("payroll_verification_codes")
    .update({ used_at: new Date().toISOString() })
    .eq("id", record.id);

  await logExternalAccess(admin, {
    shareId: share.id,
    action: "verified",
    recipientEmail: share.recipient_email,
    ipAddress,
  });

  return { ok: true };
}

export { MAX_CODE_ATTEMPTS, CODE_TTL_MINUTES };
