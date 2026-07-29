import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  PAYROLL_ENTRY_SELECT,
  PAYROLL_REPORT_SELECT,
  PAYROLL_SHARE_SELECT,
  type PayrollReport,
  type PayrollReportEntry,
  type PayrollShare,
  type PayrollShareAccessLog,
  type PayrollTimeEntry,
} from "./types";

export async function listPayrollReports(
  supabase: SupabaseClient,
  profileId: string
): Promise<PayrollReport[]> {
  const { data, error } = await supabase
    .from("payroll_reports")
    .select(PAYROLL_REPORT_SELECT)
    .eq("profile_id", profileId)
    .order("pay_period_start", { ascending: false });

  if (error) {
    console.error("listPayrollReports:", error.message);
    return [];
  }
  return (data ?? []) as PayrollReport[];
}

export async function getPayrollReport(
  supabase: SupabaseClient,
  reportId: string
): Promise<PayrollReport | null> {
  const { data, error } = await supabase
    .from("payroll_reports")
    .select(PAYROLL_REPORT_SELECT)
    .eq("id", reportId)
    .maybeSingle();

  if (error) {
    console.error("getPayrollReport:", error.message);
    return null;
  }
  return (data as PayrollReport | null) ?? null;
}

export async function getReportEntries(
  supabase: SupabaseClient,
  reportId: string
): Promise<PayrollReportEntry[]> {
  const { data, error } = await supabase
    .from("payroll_report_entries")
    .select(PAYROLL_ENTRY_SELECT)
    .eq("payroll_report_id", reportId)
    .order("employee_name");

  if (error) {
    console.error("getReportEntries:", error.message);
    return [];
  }
  return (data ?? []) as PayrollReportEntry[];
}

export async function getReportShares(
  supabase: SupabaseClient,
  reportId: string
): Promise<PayrollShare[]> {
  const { data, error } = await supabase
    .from("payroll_shares")
    .select(PAYROLL_SHARE_SELECT)
    .eq("payroll_report_id", reportId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("getReportShares:", error.message);
    return [];
  }
  return (data ?? []) as PayrollShare[];
}

export async function getActiveShare(
  supabase: SupabaseClient,
  reportId: string
): Promise<PayrollShare | null> {
  const shares = await getReportShares(supabase, reportId);
  const now = Date.now();
  return (
    shares.find(
      (s) => !s.revoked_at && new Date(s.expires_at).getTime() > now
    ) ?? null
  );
}

export async function listTimeEntriesForPeriod(
  supabase: SupabaseClient,
  profileId: string,
  periodStart: string,
  periodEnd: string
): Promise<PayrollTimeEntry[]> {
  const startIso = `${periodStart}T00:00:00.000Z`;
  const endIso = `${periodEnd}T23:59:59.999Z`;

  const { data, error } = await supabase
    .from("payroll_time_entries")
    .select("*")
    .eq("profile_id", profileId)
    .gte("clock_in_at", startIso)
    .lte("clock_in_at", endIso)
    .order("clock_in_at");

  if (error) {
    console.error("listTimeEntriesForPeriod:", error.message);
    return [];
  }
  return (data ?? []) as PayrollTimeEntry[];
}

export async function getBusinessName(
  supabase: SupabaseClient,
  profileId: string
): Promise<string> {
  const { data } = await supabase
    .from("guardian_profiles")
    .select("display_name, company_name")
    .eq("id", profileId)
    .maybeSingle();

  if (!data) return "Business";
  const row = data as { display_name?: string; company_name?: string };
  return row.company_name?.trim() || row.display_name?.trim() || "Business";
}

export async function verifyProfileAccess(
  supabase: SupabaseClient,
  profileId: string,
  userId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("guardian_profiles")
    .select("id, profile_type")
    .eq("id", profileId)
    .maybeSingle();

  if (error || !data) return false;
  const profile = data as { id: string; profile_type: string };
  if (profile.profile_type !== "business" && profile.profile_type !== "non_profit") {
    return false;
  }

  const { data: member } = await supabase
    .from("guardian_profile_members")
    .select("role")
    .eq("profile_id", profileId)
    .eq("user_id", userId)
    .maybeSingle();

  return Boolean(member);
}

export async function logPayrollAudit(
  supabase: SupabaseClient,
  args: {
    shareId?: string;
    reportId?: string;
    action: string;
    recipientEmail?: string;
    actorUserId?: string;
    ipAddress?: string;
    userAgent?: string;
    details?: Record<string, unknown>;
  }
): Promise<void> {
  const { error } = await supabase.from("payroll_share_access_logs").insert({
    payroll_share_id: args.shareId ?? null,
    payroll_report_id: args.reportId ?? null,
    action: args.action,
    recipient_email: args.recipientEmail ?? null,
    actor_user_id: args.actorUserId ?? null,
    ip_address: args.ipAddress ?? null,
    user_agent: args.userAgent ?? null,
    details: args.details ?? {},
  });

  if (error) {
    console.error("logPayrollAudit:", error.message);
  }
}

export async function getAuditLogsForReport(
  supabase: SupabaseClient,
  reportId: string
): Promise<PayrollShareAccessLog[]> {
  const shares = await getReportShares(supabase, reportId);
  const shareIds = shares.map((s) => s.id);

  let query = supabase
    .from("payroll_share_access_logs")
    .select("*")
    .order("created_at", { ascending: false });

  if (shareIds.length > 0) {
    query = query.or(
      `payroll_report_id.eq.${reportId},payroll_share_id.in.(${shareIds.join(",")})`
    );
  } else {
    query = query.eq("payroll_report_id", reportId);
  }

  const { data, error } = await query;

  if (error) {
    console.error("getAuditLogsForReport:", error.message);
    return [];
  }
  return (data ?? []) as PayrollShareAccessLog[];
}

export async function ensurePayrollEmployees(
  supabase: SupabaseClient,
  profileId: string
): Promise<void> {
  const { data: employees, error } = await supabase
    .from("guardian_profiles")
    .select("id, display_name")
    .eq("parent_profile_id", profileId)
    .eq("profile_type", "employee");

  if (error || !employees) return;

  for (const emp of employees as { id: string; display_name: string }[]) {
    await supabase.from("payroll_employees").upsert(
      {
        profile_id: profileId,
        employee_profile_id: emp.id,
        display_name: emp.display_name || "Employee",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "profile_id,employee_profile_id" }
    );
  }
}
