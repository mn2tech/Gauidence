import "server-only";

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { encryptSsn } from "./encryption";
import { normalizeSsnInput, ssnLastFour } from "./ssn";
import type {
  ContractorIntakeRequest,
  EmploymentKind,
  IntakeSubmissionType,
} from "./types";
import { INTAKE_ACCEPTED_TYPES, INTAKE_MAX_BYTES } from "./types";
import { logIntakeAccess } from "./external";
import { normalizeContactEmail, normalizeContactPhone } from "./contact";
import { isEmploymentKind } from "@/lib/profiles/types";
import {
  applyEmploymentKindEntitlements,
  syncEmployeeProfileFromIntake,
} from "./employmentKind";

function safeFileName(name: string): string {
  return name.replace(/[^\w.\- ]/g, "_").trim() || "document";
}

function resolveMimeType(file: { type: string; name: string }): string {
  const direct = file.type?.trim();
  if (direct && INTAKE_ACCEPTED_TYPES[direct]) return direct;
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  return direct || "";
}

export type ProcessSubmissionArgs = {
  request: ContractorIntakeRequest;
  admin: SupabaseClient;
  legalName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  locationAddress?: string | null;
  employmentKind?: string | null;
  ssnRaw?: string | null;
  file?: File | null;
  ipAddress?: string;
  userAgent?: string;
};

export async function processIntakeSubmission(
  args: ProcessSubmissionArgs
): Promise<{ ok: true } | { ok: false; error: string; status?: number }> {
  const { request, admin } = args;

  const legalName = args.legalName?.trim() ?? "";
  if (!legalName || legalName.length < 2) {
    return {
      ok: false,
      status: 400,
      error: "Enter your full legal name.",
    };
  }

  const contactEmail = args.contactEmail
    ? normalizeContactEmail(args.contactEmail)
    : null;
  if (!contactEmail) {
    return {
      ok: false,
      status: 400,
      error: "Enter a valid email address.",
    };
  }

  const employmentKindRaw = args.employmentKind?.trim();
  if (!isEmploymentKind(employmentKindRaw)) {
    return {
      ok: false,
      status: 400,
      error: "Select whether you are an employee or contractor.",
    };
  }
  const employmentKind = employmentKindRaw as EmploymentKind;

  const contactPhone = args.contactPhone?.trim()
    ? normalizeContactPhone(args.contactPhone)
    : null;
  if (args.contactPhone?.trim() && !contactPhone) {
    return {
      ok: false,
      status: 400,
      error: "Enter a valid phone number (10 digits).",
    };
  }

  const locationAddress = args.locationAddress?.trim() || null;

  const ssnDigits = args.ssnRaw ? normalizeSsnInput(args.ssnRaw) : null;
  const file = args.file;

  if (!ssnDigits && !file) {
    return {
      ok: false,
      status: 400,
      error: "Enter your Social Security number or upload a document.",
    };
  }

  if (args.ssnRaw && !ssnDigits) {
    return {
      ok: false,
      status: 400,
      error: "Enter a valid 9-digit Social Security number.",
    };
  }

  if (file) {
    const mime = resolveMimeType(file);
    if (!INTAKE_ACCEPTED_TYPES[mime]) {
      return {
        ok: false,
        status: 400,
        error: "Unsupported file type. Upload a PDF, JPG, PNG, or WebP.",
      };
    }
    if (file.size > INTAKE_MAX_BYTES) {
      return {
        ok: false,
        status: 400,
        error: "File exceeds 15 MB. Please upload a smaller file.",
      };
    }
  }

  const { data: existing } = await admin
    .from("contractor_intake_submissions")
    .select("id")
    .eq("intake_request_id", request.id)
    .maybeSingle();

  if (existing) {
    return {
      ok: false,
      status: 410,
      error: "Information has already been submitted for this request.",
    };
  }

  const { data: employee } = await admin
    .from("guardian_profiles")
    .select("owner_user_id")
    .eq("id", request.employee_profile_id)
    .maybeSingle();

  const ownerUserId = (employee as { owner_user_id?: string } | null)?.owner_user_id;
  if (!ownerUserId) {
    return { ok: false, status: 500, error: "Employee record not found." };
  }

  let documentId: string | null = null;

  if (file) {
    const buffer = Buffer.from(await file.arrayBuffer());
    const mime = resolveMimeType(file);
    const path = `${ownerUserId}/${request.employee_profile_id}/intake/${request.id}/${randomUUID()}-${safeFileName(file.name)}`;

    const { error: uploadError } = await admin.storage
      .from("documents")
      .upload(path, buffer, { contentType: mime });

    if (uploadError) {
      console.error("intake upload:", uploadError.message);
      return { ok: false, status: 502, error: "Couldn't upload document." };
    }

    const { data: doc, error: docError } = await admin
      .from("documents")
      .insert({
        user_id: ownerUserId,
        profile_id: request.employee_profile_id,
        file_name: file.name,
        file_path: path,
        mime_type: mime,
        size_bytes: file.size,
        analysis_status: "uploaded",
      })
      .select("id")
      .single();

    if (docError || !doc) {
      await admin.storage.from("documents").remove([path]);
      return { ok: false, status: 502, error: "Couldn't save document." };
    }

    documentId = doc.id as string;
  }

  let submissionType: IntakeSubmissionType;
  if (ssnDigits && documentId) submissionType = "both";
  else if (ssnDigits) submissionType = "typed_ssn";
  else submissionType = "document_upload";

  const { error: subError } = await admin.from("contractor_intake_submissions").insert({
    intake_request_id: request.id,
    profile_id: request.profile_id,
    submission_type: submissionType,
    ssn_encrypted: ssnDigits ? encryptSsn(ssnDigits) : null,
    ssn_last_four: ssnDigits ? ssnLastFour(ssnDigits) : null,
    document_id: documentId,
    legal_name: legalName,
    contact_email: contactEmail,
    contact_phone: contactPhone,
    location_address: locationAddress,
    employment_kind: employmentKind,
  });

  if (subError) {
    if (documentId) {
      const { data: docRow } = await admin
        .from("documents")
        .select("file_path")
        .eq("id", documentId)
        .maybeSingle();
      if (docRow?.file_path) {
        await admin.storage.from("documents").remove([docRow.file_path as string]);
      }
      await admin.from("documents").delete().eq("id", documentId);
    }
    console.error("intake submission insert:", subError.message);
    return { ok: false, status: 502, error: "Couldn't save submission." };
  }

  await syncEmployeeProfileFromIntake(admin, request.employee_profile_id, {
    legalName,
    contactEmail,
    contactPhone,
    locationAddress,
    employmentKind,
  });

  await applyEmploymentKindEntitlements(
    admin,
    request.profile_id,
    request.employee_profile_id,
    employmentKind
  );

  const now = new Date().toISOString();
  await admin
    .from("contractor_intake_requests")
    .update({
      status: "submitted",
      submitted_at: now,
      last_accessed_at: now,
    })
    .eq("id", request.id);

  await logIntakeAccess(admin, {
    requestId: request.id,
    action: "submitted",
    recipientEmail: contactEmail,
    ipAddress: args.ipAddress,
    userAgent: args.userAgent,
    details: {
      submission_type: submissionType,
      has_document: Boolean(documentId),
      has_ssn: Boolean(ssnDigits),
      employment_kind: employmentKind,
    },
  });

  return { ok: true };
}
