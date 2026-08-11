import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { maskSsnLastFour } from "./encryption";
import type {
  ContractorIntakeRequest,
  ContractorIntakeSubmission,
  IntakeRequestSummary,
} from "./types";

export async function getEmployeeForIntake(
  supabase: SupabaseClient,
  employeeProfileId: string,
  businessProfileId: string
): Promise<{
  id: string;
  display_name: string;
  owner_user_id: string;
  parent_profile_id: string | null;
} | null> {
  const { data } = await supabase
    .from("guardian_profiles")
    .select("id, display_name, owner_user_id, parent_profile_id, profile_type")
    .eq("id", employeeProfileId)
    .maybeSingle();

  const row = data as {
    id: string;
    display_name: string;
    owner_user_id: string;
    parent_profile_id: string | null;
    profile_type: string;
  } | null;

  if (
    !row ||
    row.profile_type !== "employee" ||
    row.parent_profile_id !== businessProfileId
  ) {
    return null;
  }

  return row;
}

export async function listIntakeRequests(
  supabase: SupabaseClient,
  employeeProfileId: string
): Promise<IntakeRequestSummary[]> {
  const { data: requests, error } = await supabase
    .from("contractor_intake_requests")
    .select("*")
    .eq("employee_profile_id", employeeProfileId)
    .order("created_at", { ascending: false });

  if (error || !requests?.length) return [];

  const ids = requests.map((r) => (r as ContractorIntakeRequest).id);
  const { data: submissions } = await supabase
    .from("contractor_intake_submissions")
    .select("*")
    .in("intake_request_id", ids);

  const submissionMap = new Map<string, ContractorIntakeSubmission>();
  for (const sub of submissions ?? []) {
    submissionMap.set(
      (sub as ContractorIntakeSubmission).intake_request_id,
      sub as ContractorIntakeSubmission
    );
  }

  const documentIds = (submissions ?? [])
    .map((s) => (s as ContractorIntakeSubmission).document_id)
    .filter(Boolean) as string[];

  const docNameMap = new Map<string, string>();
  if (documentIds.length > 0) {
    const { data: docs } = await supabase
      .from("documents")
      .select("id, file_name")
      .in("id", documentIds);
    for (const doc of docs ?? []) {
      docNameMap.set(String(doc.id), String(doc.file_name));
    }
  }

  return (requests as ContractorIntakeRequest[]).map((r) => {
    const sub = submissionMap.get(r.id);
    return {
      id: r.id,
      employeeProfileId: r.employee_profile_id,
      recipientEmail: r.recipient_email,
      recipientName: r.recipient_name,
      purpose: r.purpose,
      status: r.status,
      expiresAt: r.expires_at,
      createdAt: r.created_at,
      openedAt: r.opened_at,
      submittedAt: r.submitted_at,
      submissionType: sub?.submission_type ?? null,
      ssnMasked: sub?.ssn_last_four
        ? maskSsnLastFour(sub.ssn_last_four)
        : null,
      documentId: sub?.document_id ?? null,
      documentName: sub?.document_id
        ? docNameMap.get(sub.document_id) ?? null
        : null,
    };
  });
}

export async function revokeIntakeRequest(
  supabase: SupabaseClient,
  requestId: string
): Promise<boolean> {
  const { error } = await supabase
    .from("contractor_intake_requests")
    .update({
      status: "revoked",
      revoked_at: new Date().toISOString(),
    })
    .eq("id", requestId);

  return !error;
}

export async function getIntakeSubmissionSsn(
  supabase: SupabaseClient,
  requestId: string
): Promise<{ ssnEncrypted: string; ssnLastFour: string } | null> {
  const { data } = await supabase
    .from("contractor_intake_submissions")
    .select("ssn_encrypted, ssn_last_four")
    .eq("intake_request_id", requestId)
    .maybeSingle();

  const row = data as {
    ssn_encrypted: string | null;
    ssn_last_four: string | null;
  } | null;

  if (!row?.ssn_encrypted || !row.ssn_last_four) return null;

  return {
    ssnEncrypted: row.ssn_encrypted,
    ssnLastFour: row.ssn_last_four,
  };
}
