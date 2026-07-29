export const RECRUIT_STEPS = [
  "create_job",
  "upload_resumes",
  "configure_criteria",
  "analyze",
  "review",
  "shortlist",
  "export",
] as const;

export type RecruitStep = (typeof RECRUIT_STEPS)[number];

export const RECRUIT_STEP_LABELS: Record<RecruitStep, string> = {
  create_job: "Create Job",
  upload_resumes: "Upload Resumes",
  configure_criteria: "Configure Criteria",
  analyze: "Analyze",
  review: "Review",
  shortlist: "Shortlist",
  export: "Export",
};

export const WORK_MODES = ["remote", "hybrid", "onsite"] as const;
export type WorkMode = (typeof WORK_MODES)[number];

export const RECOMMENDATION_STATUSES = [
  "strong_match",
  "possible_match",
  "needs_review",
  "not_recommended",
] as const;

export type RecommendationStatus = (typeof RECOMMENDATION_STATUSES)[number];

export const RECOMMENDATION_LABELS: Record<RecommendationStatus, string> = {
  strong_match: "Strong Match",
  possible_match: "Possible Match",
  needs_review: "Needs Review",
  not_recommended: "Not Recommended",
};

export const REVIEW_STATUSES = [
  "pending",
  "shortlisted",
  "declined",
  "hm_review",
] as const;

export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const PROCESSING_STATUSES = [
  "pending",
  "extracting",
  "extracted",
  "analyzing",
  "analyzed",
  "failed",
] as const;

export type ProcessingStatus = (typeof PROCESSING_STATUSES)[number];

export type RubricWeights = {
  weight_required_skills: number;
  weight_relevant_experience: number;
  weight_domain_experience: number;
  weight_preferred_skills: number;
  weight_education_certifications: number;
  weight_career_stability: number;
  weight_location_availability: number;
};

export type RecruitmentJob = {
  id: string;
  profile_id: string;
  owner_user_id: string;
  title: string;
  department: string | null;
  hiring_manager: string | null;
  job_description: string;
  required_skills: string[];
  preferred_skills: string[];
  min_years_experience: number | null;
  required_education: string | null;
  required_certifications: string[];
  location: string | null;
  work_mode: WorkMode | null;
  employment_type: string | null;
  work_authorization_requirement: string | null;
  salary_range: string | null;
  shortlist_count: number;
  status: string;
  current_step: RecruitStep;
  created_at: string;
  updated_at: string;
};

export type RecruitmentJobRequirements = RubricWeights & {
  id: string;
  job_id: string;
  created_at: string;
  updated_at: string;
};

export type RecruitmentCandidate = {
  id: string;
  job_id: string;
  display_name: string | null;
  email: string | null;
  phone: string | null;
  processing_status: ProcessingStatus;
  processing_error: string | null;
  manual_rank: number | null;
  review_status: ReviewStatus;
  created_at: string;
  updated_at: string;
};

export type RecruitmentCandidateFile = {
  id: string;
  candidate_id: string;
  job_id: string;
  file_name: string;
  file_path: string;
  mime_type: string;
  size_bytes: number;
  file_hash: string;
  storage_bucket: string;
  created_at: string;
};

export type EmploymentEntry = {
  company: string;
  title: string;
  start_date?: string | null;
  end_date?: string | null;
  description?: string | null;
};

export type EducationEntry = {
  institution: string;
  degree?: string | null;
  field?: string | null;
  graduation_year?: string | null;
};

export type RecruitmentCandidateExtraction = {
  id: string;
  candidate_id: string;
  candidate_name: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  current_title: string | null;
  total_experience_years: number | null;
  relevant_experience_years: number | null;
  employment_history: EmploymentEntry[];
  technical_skills: string[];
  domain_experience: string[];
  education: EducationEntry[];
  certifications: string[];
  work_authorization: string | null;
  availability: string | null;
  raw_extraction: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type RecruitmentCandidateScore = {
  id: string;
  candidate_id: string;
  match_score: number;
  overridden_score: number | null;
  recommendation_status: RecommendationStatus;
  required_skill_match_pct: number | null;
  matched_requirements: string[];
  missing_requirements: string[];
  preferred_qualifications_matched: string[];
  unclear_information: string[];
  interview_questions: string[];
  candidate_summary: string | null;
  strengths: string[];
  concerns: string[];
  category_scores: Record<string, number>;
  analyzed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type RecruitmentCandidateEvidence = {
  id: string;
  candidate_id: string;
  field_name: string;
  field_value: string | null;
  evidence_text: string;
  created_at: string;
};

export type RecruitmentReview = {
  id: string;
  candidate_id: string;
  reviewer_user_id: string;
  recruiter_notes: string | null;
  edited_summary: string | null;
  review_status: ReviewStatus;
  created_at: string;
  updated_at: string;
};

export type CandidateWithDetails = RecruitmentCandidate & {
  files: RecruitmentCandidateFile[];
  extraction: RecruitmentCandidateExtraction | null;
  score: RecruitmentCandidateScore | null;
  evidence: RecruitmentCandidateEvidence[];
  review: RecruitmentReview | null;
};

export const JOB_SELECT =
  "id, profile_id, owner_user_id, title, department, hiring_manager, job_description, required_skills, preferred_skills, min_years_experience, required_education, required_certifications, location, work_mode, employment_type, work_authorization_requirement, salary_range, shortlist_count, status, current_step, created_at, updated_at";

export const CANDIDATE_SELECT =
  "id, job_id, display_name, email, phone, processing_status, processing_error, manual_rank, review_status, created_at, updated_at";

export const ACCEPTED_RESUME_TYPES: Record<string, string> = {
  "application/pdf": "PDF",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "DOCX",
  "text/plain": "TXT",
};

export const MAX_RESUME_BYTES = 15 * 1024 * 1024;
