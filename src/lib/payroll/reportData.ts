import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { computeEmployeeHours, sumReportTotals } from "./compute";
import {
  ensurePayrollEmployees,
  getAuditLogsForReport,
  getBusinessName,
  getPayrollReport,
  getReportEntries,
  getReportShares,
  listTimeEntriesForPeriod,
} from "./server";
import type { EmployeeHoursSummary, PayrollReportData } from "./types";

export async function buildDraftFromTimesheets(
  supabase: SupabaseClient,
  profileId: string,
  periodStart: string,
  periodEnd: string
): Promise<EmployeeHoursSummary[]> {
  await ensurePayrollEmployees(supabase, profileId);

  const { data: payrollEmps } = await supabase
    .from("payroll_employees")
    .select("employee_profile_id, display_name, payroll_employee_id")
    .eq("profile_id", profileId);

  const empMap = new Map(
    ((payrollEmps ?? []) as Array<{
      employee_profile_id: string;
      display_name: string;
      payroll_employee_id: string | null;
    }>).map((e) => [e.employee_profile_id, e])
  );

  const timeEntries = await listTimeEntriesForPeriod(
    supabase,
    profileId,
    periodStart,
    periodEnd
  );

  const enriched = timeEntries.map((t) => {
    const emp = empMap.get(t.employee_profile_id);
    return {
      employee_profile_id: t.employee_profile_id,
      employee_name: emp?.display_name ?? "Employee",
      payroll_employee_id: emp?.payroll_employee_id ?? null,
      clock_in_at: t.clock_in_at,
      clock_out_at: t.clock_out_at,
    };
  });

  const computed = computeEmployeeHours(enriched, periodStart, periodEnd);

  for (const emp of empMap.values()) {
    if (!computed.some((c) => c.employee_profile_id === emp.employee_profile_id)) {
      computed.push({
        employee_profile_id: emp.employee_profile_id,
        employee_name: emp.display_name,
        payroll_employee_id: emp.payroll_employee_id,
        regular_hours: 0,
        overtime_hours: 0,
        total_hours: 0,
        adjustment_hours: 0,
        adjustment_reason: null,
        owner_notes: null,
        missing_clock_out: false,
        time_entry_count: 0,
      });
    }
  }

  return computed;
}

export async function buildPayrollReportData(
  supabase: SupabaseClient,
  reportId: string
): Promise<PayrollReportData | null> {
  const report = await getPayrollReport(supabase, reportId);
  if (!report) return null;

  const [businessName, entries, shares, auditLogs] = await Promise.all([
    getBusinessName(supabase, report.profile_id),
    getReportEntries(supabase, reportId),
    getReportShares(supabase, reportId),
    getAuditLogsForReport(supabase, reportId),
  ]);

  return { businessName, profileId: report.profile_id, report, entries, shares, auditLogs };
}

export async function createDraftReport(
  supabase: SupabaseClient,
  args: {
    profileId: string;
    periodStart: string;
    periodEnd: string;
    createdBy: string;
  }
): Promise<{ reportId: string } | { error: string }> {
  const summaries = await buildDraftFromTimesheets(
    supabase,
    args.profileId,
    args.periodStart,
    args.periodEnd
  );

  const totals = sumReportTotals(summaries);

  const { data: report, error: reportError } = await supabase
    .from("payroll_reports")
    .insert({
      profile_id: args.profileId,
      pay_period_start: args.periodStart,
      pay_period_end: args.periodEnd,
      status: "draft",
      ...totals,
      created_by: args.createdBy,
    })
    .select("id")
    .single();

  if (reportError || !report) {
    if (reportError?.code === "23505") {
      return { error: "A report already exists for this pay period." };
    }
    return { error: "Couldn't create payroll report." };
  }

  const entryRows = summaries.map((s) => ({
    payroll_report_id: report.id,
    employee_profile_id: s.employee_profile_id,
    employee_name: s.employee_name,
    payroll_employee_id: s.payroll_employee_id,
    regular_hours: s.regular_hours,
    overtime_hours: s.overtime_hours,
    total_hours: s.total_hours,
    adjustment_hours: s.adjustment_hours,
    adjustment_reason: s.adjustment_reason,
    owner_notes: s.owner_notes,
    missing_clock_out: s.missing_clock_out,
  }));

  if (entryRows.length > 0) {
    const { error: entriesError } = await supabase
      .from("payroll_report_entries")
      .insert(entryRows);
    if (entriesError) {
      return { error: "Couldn't save employee hours." };
    }
  }

  return { reportId: report.id };
}

export async function approvePayrollReport(
  supabase: SupabaseClient,
  args: { reportId: string; approvedBy: string }
): Promise<{ ok: true } | { error: string }> {
  const report = await getPayrollReport(supabase, args.reportId);
  if (!report) return { error: "Report not found." };
  if (report.status !== "draft") {
    return { error: "Only draft reports can be approved." };
  }

  const summaries = await buildDraftFromTimesheets(
    supabase,
    report.profile_id,
    report.pay_period_start,
    report.pay_period_end
  );

  await supabase
    .from("payroll_report_entries")
    .delete()
    .eq("payroll_report_id", args.reportId);

  const entryRows = summaries.map((s) => ({
    payroll_report_id: args.reportId,
    employee_profile_id: s.employee_profile_id,
    employee_name: s.employee_name,
    payroll_employee_id: s.payroll_employee_id,
    regular_hours: s.regular_hours,
    overtime_hours: s.overtime_hours,
    total_hours: s.total_hours,
    adjustment_hours: s.adjustment_hours,
    adjustment_reason: s.adjustment_reason,
    owner_notes: s.owner_notes,
    missing_clock_out: s.missing_clock_out,
  }));

  if (entryRows.length > 0) {
    await supabase.from("payroll_report_entries").insert(entryRows);
  }

  const totals = sumReportTotals(summaries);
  const now = new Date().toISOString();

  const { error } = await supabase
    .from("payroll_reports")
    .update({
      status: "approved",
      approved_by: args.approvedBy,
      approved_at: now,
      updated_at: now,
      ...totals,
    })
    .eq("id", args.reportId);

  if (error) return { error: "Couldn't approve report." };
  return { ok: true };
}

export async function refreshDraftReport(
  supabase: SupabaseClient,
  reportId: string
): Promise<{ ok: true } | { error: string }> {
  const report = await getPayrollReport(supabase, reportId);
  if (!report) return { error: "Report not found." };
  if (report.status !== "draft") {
    return { error: "Only draft reports can be refreshed from timesheets." };
  }

  const summaries = await buildDraftFromTimesheets(
    supabase,
    report.profile_id,
    report.pay_period_start,
    report.pay_period_end
  );

  await supabase
    .from("payroll_report_entries")
    .delete()
    .eq("payroll_report_id", reportId);

  const entryRows = summaries.map((s) => ({
    payroll_report_id: reportId,
    employee_profile_id: s.employee_profile_id,
    employee_name: s.employee_name,
    payroll_employee_id: s.payroll_employee_id,
    regular_hours: s.regular_hours,
    overtime_hours: s.overtime_hours,
    total_hours: s.total_hours,
    adjustment_hours: s.adjustment_hours,
    adjustment_reason: s.adjustment_reason,
    owner_notes: s.owner_notes,
    missing_clock_out: s.missing_clock_out,
  }));

  if (entryRows.length > 0) {
    await supabase.from("payroll_report_entries").insert(entryRows);
  }

  const totals = sumReportTotals(summaries);
  await supabase
    .from("payroll_reports")
    .update({ ...totals, updated_at: new Date().toISOString() })
    .eq("id", reportId);

  return { ok: true };
}
