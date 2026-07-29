import "server-only";

import {
  createLlmClient,
  runStructuredJson,
  ANALYSIS_MODEL,
} from "@/lib/analysis/llm";
import type {
  EducationEntry,
  EmploymentEntry,
  RecruitmentJob,
  RecruitmentJobRequirements,
  RecommendationStatus,
} from "./types";

const EXTRACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "candidate_name",
    "email",
    "phone",
    "location",
    "current_title",
    "total_experience_years",
    "relevant_experience_years",
    "employment_history",
    "technical_skills",
    "domain_experience",
    "education",
    "certifications",
    "work_authorization",
    "availability",
    "evidence",
  ],
  properties: {
    candidate_name: { type: ["string", "null"] },
    email: { type: ["string", "null"] },
    phone: { type: ["string", "null"] },
    location: { type: ["string", "null"] },
    current_title: { type: ["string", "null"] },
    total_experience_years: { type: ["number", "null"] },
    relevant_experience_years: { type: ["number", "null"] },
    employment_history: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["company", "title"],
        properties: {
          company: { type: "string" },
          title: { type: "string" },
          start_date: { type: ["string", "null"] },
          end_date: { type: ["string", "null"] },
          description: { type: ["string", "null"] },
        },
      },
    },
    technical_skills: { type: "array", items: { type: "string" } },
    domain_experience: { type: "array", items: { type: "string" } },
    education: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["institution"],
        properties: {
          institution: { type: "string" },
          degree: { type: ["string", "null"] },
          field: { type: ["string", "null"] },
          graduation_year: { type: ["string", "null"] },
        },
      },
    },
    certifications: { type: "array", items: { type: "string" } },
    work_authorization: { type: ["string", "null"] },
    availability: { type: ["string", "null"] },
    evidence: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["field_name", "field_value", "evidence_text"],
        properties: {
          field_name: { type: "string" },
          field_value: { type: ["string", "null"] },
          evidence_text: { type: "string" },
        },
      },
    },
  },
} as const;

const ANALYSIS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "match_score",
    "recommendation_status",
    "required_skill_match_pct",
    "matched_requirements",
    "missing_requirements",
    "preferred_qualifications_matched",
    "unclear_information",
    "interview_questions",
    "candidate_summary",
    "strengths",
    "concerns",
    "category_scores",
    "evidence",
  ],
  properties: {
    match_score: { type: "number" },
    recommendation_status: {
      type: "string",
      enum: [
        "strong_match",
        "possible_match",
        "needs_review",
        "not_recommended",
      ],
    },
    required_skill_match_pct: { type: "number" },
    matched_requirements: { type: "array", items: { type: "string" } },
    missing_requirements: { type: "array", items: { type: "string" } },
    preferred_qualifications_matched: {
      type: "array",
      items: { type: "string" },
    },
    unclear_information: { type: "array", items: { type: "string" } },
    interview_questions: { type: "array", items: { type: "string" } },
    candidate_summary: { type: "string" },
    strengths: { type: "array", items: { type: "string" } },
    concerns: { type: "array", items: { type: "string" } },
    category_scores: {
      type: "object",
      additionalProperties: { type: "number" },
    },
    evidence: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["field_name", "field_value", "evidence_text"],
        properties: {
          field_name: { type: "string" },
          field_value: { type: ["string", "null"] },
          evidence_text: { type: "string" },
        },
      },
    },
  },
} as const;

export type ExtractionResult = {
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
  evidence: { field_name: string; field_value: string | null; evidence_text: string }[];
};

export type AnalysisResult = {
  match_score: number;
  recommendation_status: RecommendationStatus;
  required_skill_match_pct: number;
  matched_requirements: string[];
  missing_requirements: string[];
  preferred_qualifications_matched: string[];
  unclear_information: string[];
  interview_questions: string[];
  candidate_summary: string;
  strengths: string[];
  concerns: string[];
  category_scores: Record<string, number>;
  evidence: { field_name: string; field_value: string | null; evidence_text: string }[];
};

const EXTRACTION_SYSTEM = `You are a resume parsing assistant for a recruiting platform.
Extract ONLY information explicitly stated in the resume.
Do NOT infer protected characteristics (age, race, gender, religion, disability, national origin, marital status, etc.).
Do NOT infer work authorization or availability unless explicitly stated.
For each extracted field, provide evidence: a direct quote or paraphrase from the resume.
Return structured JSON matching the schema.`;

const ANALYSIS_SYSTEM = `You are a recruiting analysis assistant. Evaluate a candidate against a job description using the provided rubric weights.

CRITICAL RULES:
- You are NOT making a hiring decision. Provide recommendations for human review only.
- Do NOT use or infer protected characteristics in scoring.
- Do NOT automatically reject candidates. Use "not_recommended" only when clearly missing multiple mandatory requirements.
- Base scores only on job-relevant qualifications found in the resume.
- Provide evidence from the resume for key assessments.
- Generate 3-5 targeted interview questions.
- Category scores should reflect the rubric weights (each category scored 0-100, then weighted).

Recommendation status guidelines:
- strong_match: meets most required skills and experience
- possible_match: meets some requirements with gaps
- needs_review: insufficient information or borderline fit
- not_recommended: clearly missing critical mandatory requirements`;

export async function extractCandidateFromResume(
  resumeText: string
): Promise<ExtractionResult> {
  const client = createLlmClient();
  const result = await runStructuredJson<ExtractionResult>(client, {
    model: ANALYSIS_MODEL,
    system: EXTRACTION_SYSTEM,
    userContent: [
      {
        type: "text",
        text: `Extract candidate information from this resume:\n\n${resumeText.slice(0, 50000)}`,
      },
    ],
    schema: EXTRACTION_SCHEMA as unknown as Record<string, unknown>,
    schemaName: "resume_extraction",
  });
  return result;
}

export async function analyzeCandidateAgainstJob(args: {
  job: RecruitmentJob;
  rubric: RecruitmentJobRequirements;
  resumeText: string;
  extraction: ExtractionResult;
}): Promise<AnalysisResult> {
  const client = createLlmClient();

  const jobContext = `
JOB TITLE: ${args.job.title}
DEPARTMENT: ${args.job.department ?? "N/A"}
REQUIRED SKILLS: ${args.job.required_skills.join(", ") || "None specified"}
PREFERRED SKILLS: ${args.job.preferred_skills.join(", ") || "None specified"}
MIN YEARS EXPERIENCE: ${args.job.min_years_experience ?? "Not specified"}
REQUIRED EDUCATION: ${args.job.required_education ?? "Not specified"}
REQUIRED CERTIFICATIONS: ${args.job.required_certifications.join(", ") || "None"}
LOCATION: ${args.job.location ?? "Not specified"}
WORK MODE: ${args.job.work_mode ?? "Not specified"}
EMPLOYMENT TYPE: ${args.job.employment_type ?? "Not specified"}
WORK AUTHORIZATION: ${args.job.work_authorization_requirement ?? "Not specified"}

JOB DESCRIPTION:
${args.job.job_description}
`;

  const rubricContext = `
RUBRIC WEIGHTS (must total 100):
- Required skills: ${args.rubric.weight_required_skills}%
- Relevant experience: ${args.rubric.weight_relevant_experience}%
- Domain experience: ${args.rubric.weight_domain_experience}%
- Preferred skills: ${args.rubric.weight_preferred_skills}%
- Education & certifications: ${args.rubric.weight_education_certifications}%
- Career recency & stability: ${args.rubric.weight_career_stability}%
- Location/availability/authorization: ${args.rubric.weight_location_availability}%
`;

  const candidateContext = `
EXTRACTED CANDIDATE DATA:
${JSON.stringify(args.extraction, null, 2)}

RESUME TEXT:
${args.resumeText.slice(0, 40000)}
`;

  const result = await runStructuredJson<AnalysisResult>(client, {
    model: ANALYSIS_MODEL,
    system: ANALYSIS_SYSTEM,
    userContent: [
      {
        type: "text",
        text: `${jobContext}\n${rubricContext}\n${candidateContext}`,
      },
    ],
    schema: ANALYSIS_SCHEMA as unknown as Record<string, unknown>,
    schemaName: "candidate_analysis",
  });

  return {
    ...result,
    match_score: Math.min(100, Math.max(0, Math.round(result.match_score * 100) / 100)),
    interview_questions: result.interview_questions.slice(0, 5),
  };
}

export function buildEmailDraft(args: {
  jobTitle: string;
  hiringManager: string;
  applicantCount: number;
  recruiterName: string;
}): string {
  return `Subject: Shortlisted Candidates – ${args.jobTitle}

Hi ${args.hiringManager || "[Hiring Manager]"},

I reviewed ${args.applicantCount} applicants for the ${args.jobTitle} position. Based on the required experience, skills, and preferred qualifications, I recommend the attached candidates for initial review.

The report includes each candidate's qualifications, strengths, concerns, and suggested interview questions.

Please let me know which candidates you would like to move forward with.

Thank you,
${args.recruiterName}`;
}
