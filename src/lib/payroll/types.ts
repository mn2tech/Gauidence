export const PAYROLL_REPORT_STATUSES = [
  "draft",
  "approved",
  "shared",
  "processed",
  "revoked",
] as const;

export type PayrollReportStatus = (typeof PAYROLL_REPORT_STATUSES)[number];

export const PAYROLL_STATUS_LABELS: Record<PayrollReportStatus, string> = {
  draft: "Draft",
  approved: "Approved",
  shared: "Shared",
  processed: "Processed",
  revoked: "Revoked",
};

export const PAYROLL_STATUS_COLORS: Record<PayrollReportStatus, string> = {
  draft: "bg-amber-100 text-amber-800 border-amber-200",
  approved: "bg-emerald-100 text-emerald-800 border-emerald-200",
  shared: "bg-violet-100 text-violet-800 border-violet-200",
  processed: "bg-sky-100 text-sky-800 border-sky-200",
  revoked: "bg-red-100 text-red-800 border-red-200",
};

export const PAYROLL_ACCESS_TYPES = ["view_only", "view_and_download"] as const;
export type PayrollAccessType = (typeof PAYROLL_ACCESS_TYPES)[number];

export const PAYROLL_EXPORT_FORMATS = ["csv", "excel", "pdf"] as const;
export type PayrollExportFormat = (typeof PAYROLL_EXPORT_FORMATS)[number];

export const PAYROLL_SHARE_EXPIRY_OPTIONS = [
  { id: "24h", label: "24 hours", hours: 24 },
  { id: "7d", label: "7 days", hours: 24 * 7 },
  { id: "14d", label: "14 days", hours: 24 * 14 },
  { id: "custom", label: "Custom", hours: 0 },
] as const;

export const PAYROLL_AUDIT_ACTIONS = [
  "report_created",
  "report_approved",
  "report_shared",
  "email_sent",
  "verification_completed",
  "report_opened",
  "report_downloaded",
  "access_revoked",
  "report_corrected",
  "link_opened",
  "code_requested",
  "verified",
  "report_viewed",
  "csv_downloaded",
  "excel_downloaded",
  "pdf_downloaded",
  "access_denied",
] as const;

export type PayrollAuditAction = (typeof PAYROLL_AUDIT_ACTIONS)[number];

export type PayrollEmployee = {
  id: string;
  profile_id: string;
  employee_profile_id: string;
  payroll_employee_id: string | null;
  display_name: string;
  created_at: string;
  updated_at: string;
};

export type PayrollTimeEntry = {
  id: string;
  profile_id: string;
  employee_profile_id: string;
  entry_type: "punch" | "manual";
  work_date: string | null;
  manual_hours: number | null;
  clock_in_at: string | null;
  clock_out_at: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type PayrollReport = {
  id: string;
  profile_id: string;
  pay_period_start: string;
  pay_period_end: string;
  status: PayrollReportStatus;
  total_regular_hours: number;
  total_overtime_hours: number;
  total_hours: number;
  report_version: number;
  previous_report_id: string | null;
  correction_reason: string | null;
  created_by: string;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PayrollReportEntry = {
  id: string;
  payroll_report_id: string;
  employee_profile_id: string | null;
  employee_name: string;
  payroll_employee_id: string | null;
  regular_hours: number;
  overtime_hours: number;
  total_hours: number;
  adjustment_hours: number;
  adjustment_reason: string | null;
  owner_notes: string | null;
  missing_clock_out: boolean;
  created_at: string;
  updated_at: string;
};

export type PayrollShare = {
  id: string;
  payroll_report_id: string;
  profile_id: string;
  recipient_email: string;
  recipient_email_normalized: string;
  recipient_name: string | null;
  access_type: PayrollAccessType;
  allowed_formats: PayrollExportFormat[];
  require_email_verification: boolean;
  expires_at: string;
  revoked_at: string | null;
  created_by: string;
  created_at: string;
  last_accessed_at: string | null;
  download_count: number;
  opened_at: string | null;
  optional_message: string | null;
};

export type PayrollShareAccessLog = {
  id: string;
  payroll_share_id: string;
  action: string;
  recipient_email: string | null;
  actor_user_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  details: Record<string, unknown>;
  created_at: string;
};

export type EmployeeHoursSummary = {
  employee_profile_id: string;
  employee_name: string;
  payroll_employee_id: string | null;
  regular_hours: number;
  overtime_hours: number;
  total_hours: number;
  adjustment_hours: number;
  adjustment_reason: string | null;
  owner_notes: string | null;
  missing_clock_out: boolean;
  time_entry_count: number;
};

export type PayrollReportData = {
  businessName: string;
  profileId: string;
  report: PayrollReport;
  entries: PayrollReportEntry[];
  shares: PayrollShare[];
  auditLogs: PayrollShareAccessLog[];
};

export type ExternalPayrollReportData = {
  businessName: string;
  payPeriodStart: string;
  payPeriodEnd: string;
  status: PayrollReportStatus;
  approvedAt: string | null;
  entries: Array<{
    employeeName: string;
    payrollEmployeeId: string | null;
    regularHours: number;
    overtimeHours: number;
    adjustmentHours: number;
    totalHours: number;
    adjustmentReason: string | null;
  }>;
  totals: {
    regularHours: number;
    overtimeHours: number;
    totalHours: number;
  };
  accessType: PayrollAccessType;
  allowedFormats: PayrollExportFormat[];
};

export const PAYROLL_REPORT_SELECT =
  "id, profile_id, pay_period_start, pay_period_end, status, total_regular_hours, total_overtime_hours, total_hours, report_version, previous_report_id, correction_reason, created_by, approved_by, approved_at, created_at, updated_at";

export const PAYROLL_ENTRY_SELECT =
  "id, payroll_report_id, employee_profile_id, employee_name, payroll_employee_id, regular_hours, overtime_hours, total_hours, adjustment_hours, adjustment_reason, owner_notes, missing_clock_out, created_at, updated_at";

export const PAYROLL_SHARE_SELECT =
  "id, payroll_report_id, profile_id, recipient_email, recipient_email_normalized, recipient_name, access_type, allowed_formats, require_email_verification, expires_at, revoked_at, created_by, created_at, last_accessed_at, download_count, opened_at, optional_message";

/** Mask payroll employee ID for external display (show last 4 chars). */
export function maskPayrollEmployeeId(id: string | null): string | null {
  if (!id) return null;
  if (id.length <= 4) return "****";
  return `****${id.slice(-4)}`;
}
