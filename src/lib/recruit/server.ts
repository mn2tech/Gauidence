import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CANDIDATE_SELECT,
  JOB_SELECT,
  type CandidateWithDetails,
  type RecruitmentCandidate,
  type RecruitmentJob,
  type RecruitmentJobRequirements,
} from "./types";
import { effectiveCandidateScore } from "./types";
import { DEFAULT_RUBRIC } from "./rubric";

export async function listRecruitmentJobs(
  supabase: SupabaseClient,
  profileId?: string
): Promise<RecruitmentJob[]> {
  let query = supabase
    .from("recruitment_jobs")
    .select(JOB_SELECT)
    .order("updated_at", { ascending: false });

  if (profileId) {
    query = query.eq("profile_id", profileId);
  }

  const { data, error } = await query;
  if (error) {
    console.error("listRecruitmentJobs:", error.message);
    return [];
  }
  return (data ?? []) as RecruitmentJob[];
}

export async function getRecruitmentJob(
  supabase: SupabaseClient,
  jobId: string
): Promise<RecruitmentJob | null> {
  const { data, error } = await supabase
    .from("recruitment_jobs")
    .select(JOB_SELECT)
    .eq("id", jobId)
    .maybeSingle();

  if (error) {
    console.error("getRecruitmentJob:", error.message);
    return null;
  }
  return (data as RecruitmentJob | null) ?? null;
}

export async function getJobRequirements(
  supabase: SupabaseClient,
  jobId: string
): Promise<RecruitmentJobRequirements | null> {
  const { data, error } = await supabase
    .from("recruitment_job_requirements")
    .select("*")
    .eq("job_id", jobId)
    .maybeSingle();

  if (error) {
    console.error("getJobRequirements:", error.message);
    return null;
  }
  return (data as RecruitmentJobRequirements | null) ?? null;
}

export async function ensureJobRequirements(
  supabase: SupabaseClient,
  jobId: string
): Promise<RecruitmentJobRequirements | null> {
  const existing = await getJobRequirements(supabase, jobId);
  if (existing) return existing;

  const { data, error } = await supabase
    .from("recruitment_job_requirements")
    .insert({ job_id: jobId, ...DEFAULT_RUBRIC })
    .select("*")
    .single();

  if (error) {
    console.error("ensureJobRequirements:", error.message);
    return null;
  }
  return data as RecruitmentJobRequirements;
}

export async function listCandidates(
  supabase: SupabaseClient,
  jobId: string
): Promise<RecruitmentCandidate[]> {
  const { data, error } = await supabase
    .from("recruitment_candidates")
    .select(CANDIDATE_SELECT)
    .eq("job_id", jobId)
    .order("manual_rank", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  if (error) {
    console.error("listCandidates:", error.message);
    return [];
  }
  return (data ?? []) as RecruitmentCandidate[];
}

export async function getCandidateWithDetails(
  supabase: SupabaseClient,
  candidateId: string
): Promise<CandidateWithDetails | null> {
  const { data: candidate, error } = await supabase
    .from("recruitment_candidates")
    .select(CANDIDATE_SELECT)
    .eq("id", candidateId)
    .maybeSingle();

  if (error || !candidate) return null;

  const [files, extraction, score, evidence, review] = await Promise.all([
    supabase
      .from("recruitment_candidate_files")
      .select("*")
      .eq("candidate_id", candidateId),
    supabase
      .from("recruitment_candidate_extractions")
      .select("*")
      .eq("candidate_id", candidateId)
      .maybeSingle(),
    supabase
      .from("recruitment_candidate_scores")
      .select("*")
      .eq("candidate_id", candidateId)
      .maybeSingle(),
    supabase
      .from("recruitment_candidate_evidence")
      .select("*")
      .eq("candidate_id", candidateId),
    supabase
      .from("recruitment_reviews")
      .select("*")
      .eq("candidate_id", candidateId)
      .maybeSingle(),
  ]);

  return {
    ...(candidate as RecruitmentCandidate),
    files: files.data ?? [],
    extraction: (extraction.data as CandidateWithDetails["extraction"]) ?? null,
    score: (score.data as CandidateWithDetails["score"]) ?? null,
    evidence: evidence.data ?? [],
    review: (review.data as CandidateWithDetails["review"]) ?? null,
  };
}

export async function listCandidatesWithDetails(
  supabase: SupabaseClient,
  jobId: string
): Promise<CandidateWithDetails[]> {
  const candidates = await listCandidates(supabase, jobId);
  const results: CandidateWithDetails[] = [];
  for (const c of candidates) {
    const details = await getCandidateWithDetails(supabase, c.id);
    if (details) results.push(details);
  }
  return results;
}

export async function logRecruitAudit(
  supabase: SupabaseClient,
  args: {
    jobId: string;
    actorUserId: string;
    action: string;
    candidateId?: string;
    details?: Record<string, unknown>;
  }
): Promise<void> {
  const { error } = await supabase.from("recruitment_audit_logs").insert({
    job_id: args.jobId,
    candidate_id: args.candidateId ?? null,
    actor_user_id: args.actorUserId,
    action: args.action,
    details: args.details ?? {},
  });
  if (error) {
    console.error("logRecruitAudit:", error.message);
  }
}

export function effectiveScore(
  score: { match_score: number; overridden_score: number | null } | null
): number | null {
  return effectiveCandidateScore(score);
}
