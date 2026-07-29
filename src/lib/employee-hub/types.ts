export type EmployeeHubEntitlements = {
  id: string;
  business_profile_id: string;
  employee_profile_id: string;
  time_tracking: boolean;
  manual_time_entry: boolean;
  status_reports: boolean;
  invoice_upload: boolean;
  leave_requests: boolean;
  documents: boolean;
  gideon_chat: boolean;
  research: boolean;
  work_memory: boolean;
  experts: boolean;
  recruit: boolean;
  payroll_admin: boolean;
  created_at: string;
  updated_at: string;
};

export type EmployeeLeaveRequest = {
  id: string;
  business_profile_id: string;
  employee_profile_id: string;
  start_date: string;
  end_date: string;
  leave_type: "pto" | "sick" | "ooo" | "other";
  reason: string | null;
  status: "pending" | "approved" | "denied" | "cancelled";
  created_by: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type BusinessLeaveRequest = EmployeeLeaveRequest & {
  employee_name: string;
};

export const EMPLOYEE_HUB_ENTITLEMENT_SELECT =
  "id, business_profile_id, employee_profile_id, time_tracking, manual_time_entry, status_reports, invoice_upload, leave_requests, documents, gideon_chat, research, work_memory, experts, recruit, payroll_admin, created_at, updated_at";

export const DEFAULT_EMPLOYEE_HUB_ENTITLEMENTS = {
  time_tracking: true,
  manual_time_entry: true,
  status_reports: true,
  invoice_upload: false,
  leave_requests: true,
  documents: false,
  gideon_chat: true,
  research: false,
  work_memory: false,
  experts: false,
  recruit: false,
  payroll_admin: false,
} as const;
