import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_EMPLOYEE_HUB_ENTITLEMENTS,
  EMPLOYEE_HUB_ENTITLEMENT_SELECT,
  type EmployeeHubEntitlements,
  type EmployeeLeaveRequest,
  type BusinessLeaveRequest,
  type EmployeeInvoiceDocument,
} from "./types";

export async function getEmployeeHubEntitlements(
  supabase: SupabaseClient,
  employeeProfileId: string
): Promise<EmployeeHubEntitlements | null> {
  const { data, error } = await supabase
    .from("employee_hub_entitlements")
    .select(EMPLOYEE_HUB_ENTITLEMENT_SELECT)
    .eq("employee_profile_id", employeeProfileId)
    .maybeSingle();

  if (error) {
    console.error("getEmployeeHubEntitlements:", error.message);
    return null;
  }
  return (data as EmployeeHubEntitlements | null) ?? null;
}

export async function ensureEmployeeHubEntitlements(
  supabase: SupabaseClient,
  businessProfileId: string,
  employeeProfileId: string
): Promise<void> {
  const { error } = await supabase.from("employee_hub_entitlements").upsert(
    {
      business_profile_id: businessProfileId,
      employee_profile_id: employeeProfileId,
      ...DEFAULT_EMPLOYEE_HUB_ENTITLEMENTS,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "employee_profile_id", ignoreDuplicates: true }
  );

  if (error) {
    console.error("ensureEmployeeHubEntitlements:", error.message);
  }
}

export async function updateEmployeeHubEntitlements(
  supabase: SupabaseClient,
  employeeProfileId: string,
  patch: Partial<
    Omit<
      EmployeeHubEntitlements,
      "id" | "business_profile_id" | "employee_profile_id" | "created_at" | "updated_at"
    >
  >
): Promise<EmployeeHubEntitlements | null> {
  const { data, error } = await supabase
    .from("employee_hub_entitlements")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("employee_profile_id", employeeProfileId)
    .select(EMPLOYEE_HUB_ENTITLEMENT_SELECT)
    .maybeSingle();

  if (error) {
    console.error("updateEmployeeHubEntitlements:", error.message);
    return null;
  }
  return (data as EmployeeHubEntitlements | null) ?? null;
}

export async function listLeaveRequests(
  supabase: SupabaseClient,
  employeeProfileId: string
): Promise<EmployeeLeaveRequest[]> {
  const { data, error } = await supabase
    .from("employee_leave_requests")
    .select("*")
    .eq("employee_profile_id", employeeProfileId)
    .order("start_date", { ascending: false })
    .limit(20);

  if (error) {
    console.error("listLeaveRequests:", error.message);
    return [];
  }
  return (data ?? []) as EmployeeLeaveRequest[];
}

export async function listBusinessLeaveRequests(
  supabase: SupabaseClient,
  businessProfileId: string,
  status?: "pending" | "approved" | "denied" | "cancelled"
): Promise<BusinessLeaveRequest[]> {
  let query = supabase
    .from("employee_leave_requests")
    .select("*")
    .eq("business_profile_id", businessProfileId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  if (error) {
    console.error("listBusinessLeaveRequests:", error.message);
    return [];
  }

  const rows = (data ?? []) as EmployeeLeaveRequest[];
  if (rows.length === 0) return [];

  const employeeIds = [...new Set(rows.map((r) => r.employee_profile_id))];
  const { data: profiles } = await supabase
    .from("guardian_profiles")
    .select("id, display_name")
    .in("id", employeeIds);

  const names = new Map(
    (profiles ?? []).map((p) => [
      (p as { id: string }).id,
      (p as { display_name: string }).display_name,
    ])
  );

  return rows.map((r) => ({
    ...r,
    employee_name: names.get(r.employee_profile_id)?.trim() || "Employee",
  }));
}

export async function reviewLeaveRequest(
  supabase: SupabaseClient,
  requestId: string,
  reviewerId: string,
  status: "approved" | "denied"
): Promise<EmployeeLeaveRequest | null> {
  const { data, error } = await supabase
    .from("employee_leave_requests")
    .update({
      status,
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", requestId)
    .select("*")
    .maybeSingle();

  if (error) {
    console.error("reviewLeaveRequest:", error.message);
    return null;
  }
  return (data as EmployeeLeaveRequest | null) ?? null;
}

export async function canEditEmployeeEntitlements(
  supabase: SupabaseClient,
  businessProfileId: string,
  userId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("guardian_profile_members")
    .select("role")
    .eq("profile_id", businessProfileId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!data) return false;
  const role = (data as { role: string }).role;
  return role === "owner" || role === "editor";
}

export type { EmployeeInvoiceDocument };

export async function canAccessEmployeeInvoices(
  supabase: SupabaseClient,
  employeeProfileId: string,
  userId: string
): Promise<boolean> {
  const entitlements = await getEmployeeHubEntitlements(supabase, employeeProfileId);
  if (!entitlements?.invoice_upload) return false;

  const { data, error } = await supabase
    .from("guardian_profile_members")
    .select("user_id")
    .eq("profile_id", employeeProfileId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("canAccessEmployeeInvoices:", error.message);
    return false;
  }
  return Boolean(data);
}

export async function listEmployeeInvoices(
  supabase: SupabaseClient,
  employeeProfileId: string
): Promise<EmployeeInvoiceDocument[]> {
  const [docsRes, analysesRes] = await Promise.all([
    supabase
      .from("documents")
      .select("id, file_name, created_at, analysis_status")
      .eq("profile_id", employeeProfileId)
      .order("created_at", { ascending: false }),
    supabase
      .from("extracted_data")
      .select("document_id, title, document_type")
      .eq("profile_id", employeeProfileId),
  ]);

  if (docsRes.error) {
    console.error("listEmployeeInvoices:", docsRes.error.message);
    return [];
  }

  const analyses = new Map(
    (analysesRes.data ?? []).map((row) => [
      String((row as { document_id: string }).document_id),
      row as { title: string | null; document_type: string | null },
    ])
  );

  return (docsRes.data ?? []).map((doc) => {
    const analysis = analyses.get(String(doc.id));
    return {
      id: String(doc.id),
      file_name: String(doc.file_name),
      created_at: String(doc.created_at),
      analysis_status: String(doc.analysis_status ?? "uploaded"),
      title: analysis?.title ?? null,
      document_type: analysis?.document_type ?? null,
    };
  });
}
