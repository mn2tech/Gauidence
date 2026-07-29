import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";
import type { ReportData } from "./types";
import { effectiveCandidateScore } from "./types";
import {
  ensureJobRequirements,
  getRecruitmentJob,
  listCandidatesWithDetails,
} from "./server";

export async function buildRecruitReportData(
  supabase: SupabaseClient,
  jobId: string,
  user?: User
): Promise<ReportData | null> {
  const job = await getRecruitmentJob(supabase, jobId);
  if (!job) return null;

  const rubric = await ensureJobRequirements(supabase, jobId);
  if (!rubric) return null;

  const candidates = await listCandidatesWithDetails(supabase, jobId);
  const analyzed = candidates.filter((c) => c.score);

  const sorted = [...analyzed].sort((a, b) => {
    const rankA = a.manual_rank ?? 9999;
    const rankB = b.manual_rank ?? 9999;
    if (rankA !== rankB) return rankA - rankB;
    return (effectiveCandidateScore(b.score) ?? 0) - (effectiveCandidateScore(a.score) ?? 0);
  });

  const shortlisted = sorted
    .filter(
      (c) =>
        c.review_status === "shortlisted" || c.review_status === "hm_review"
    )
    .slice(0, job.shortlist_count);

  const fallbackShortlist =
    shortlisted.length > 0 ? shortlisted : sorted.slice(0, job.shortlist_count);

  const recruiterName =
    user?.user_metadata?.full_name ??
    user?.email?.split("@")[0] ??
    "Recruiter";

  return {
    job,
    rubric,
    candidates: analyzed,
    shortlisted: fallbackShortlist,
    generatedAt: new Date().toISOString(),
    recruiterName,
  };
}
