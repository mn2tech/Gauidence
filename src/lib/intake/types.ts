export type IntakePurpose = "ssn_clearance" | "w9" | "onboarding";

export type IntakeRequestStatus =
  | "pending"
  | "opened"
  | "submitted"
  | "expired"
  | "revoked";

export type IntakeSubmissionType = "typed_ssn" | "document_upload" | "both";

export type ContractorIntakeRequest = {
  id: string;
  profile_id: string;
  employee_profile_id: string;
  recipient_email: string;
  recipient_email_normalized: string;
  recipient_name: string | null;
  purpose: IntakePurpose;
  access_token_hash: string;
  require_email_verification: boolean;
  status: IntakeRequestStatus;
  expires_at: string;
  revoked_at: string | null;
  optional_message: string | null;
  created_by: string;
  created_at: string;
  opened_at: string | null;
  submitted_at: string | null;
  last_accessed_at: string | null;
};

export type ContractorIntakeSubmission = {
  id: string;
  intake_request_id: string;
  profile_id: string;
  submission_type: IntakeSubmissionType;
  ssn_encrypted: string | null;
  ssn_last_four: string | null;
  document_id: string | null;
  created_at: string;
};

export type IntakeRequestSummary = {
  id: string;
  employeeProfileId: string;
  recipientEmail: string;
  recipientName: string | null;
  purpose: IntakePurpose;
  status: IntakeRequestStatus;
  expiresAt: string;
  createdAt: string;
  openedAt: string | null;
  submittedAt: string | null;
  submissionType: IntakeSubmissionType | null;
  ssnMasked: string | null;
  documentId: string | null;
  documentName: string | null;
};

export const INTAKE_TTL_DAYS = 14;

export const INTAKE_ACCEPTED_TYPES: Record<string, string> = {
  "application/pdf": "PDF",
  "image/jpeg": "JPEG",
  "image/png": "PNG",
  "image/webp": "WebP",
};

export const INTAKE_MAX_BYTES = 15 * 1024 * 1024;
