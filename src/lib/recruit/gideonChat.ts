import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  listCandidatesWithDetails,
  listRecruitmentJobs,
  logRecruitAudit,
} from "./server";
import type { CandidateWithDetails, RecruitmentJob } from "./types";
import {
  formatCandidateLine,
  formatRecruitCandidates,
  formatRecruitJobs,
  formatRecruitShortlist,
  parseRecruitGideonQuery,
  wantsRecruitQuery,
  type RecruitGideonIntent,
} from "./gideonQuery";

export { wantsRecruitQuery };

export type RecruitGideonAnswer = {
  message: string;
  requiresConfirmation?: boolean;
  intent?: RecruitGideonIntent;
  href?: string;
};

function matchJob(jobs: RecruitmentJob[], title?: string): RecruitmentJob | null {
  if (jobs.length === 1) return jobs[0]!;
  const q = title?.trim().toLowerCase();
  if (!q) return null;
  return (
    jobs.find((job) => job.title.toLowerCase().includes(q) || q.includes(job.title.toLowerCase())) ??
    null
  );
}

function matchCandidate(
  candidates: CandidateWithDetails[],
  name?: string
): CandidateWithDetails | null {
  const q = name?.trim().toLowerCase();
  if (!q) return null;
  return (
    candidates.find((c) => {
      const display = c.display_name?.toLowerCase() ?? "";
      const extracted = c.extraction?.candidate_name?.toLowerCase() ?? "";
      return display.includes(q) || extracted.includes(q) || (display.length > 2 && q.includes(display));
    }) ?? null
  );
}

async function loadJobCandidates(
  supabase: SupabaseClient,
  jobs: RecruitmentJob[],
  jobTitle?: string
): Promise<{ job: RecruitmentJob; candidates: CandidateWithDetails[] } | { error: string }> {
  const job = matchJob(jobs, jobTitle);
  if (!job) {
    if (!jobs.length) {
      return { error: "No recruitment jobs yet. Open Recruit to create one." };
    }
    return {
      error: `Which job? ${jobs
        .slice(0, 5)
        .map((j) => j.title)
        .join(", ")}.`,
    };
  }
  const candidates = await listCandidatesWithDetails(supabase, job.id);
  return { job, candidates };
}

export async function answerRecruitGideonQuery(
  supabase: SupabaseClient,
  args: {
    query: string;
    profileId: string;
    userId: string;
    confirmed?: boolean;
    chatHistory?: { role: string; content: string }[];
  }
): Promise<RecruitGideonAnswer | null> {
  let parsed = parseRecruitGideonQuery(args.query);
  if (parsed.intent === "unknown" && !wantsRecruitQuery(args.query)) {
    return null;
  }

  const isConfirmed = args.confirmed || parsed.confirmed;
  if (isConfirmed && parsed.intent === "shortlist" && !parsed.candidateName) {
    const priorUser = [...(args.chatHistory ?? [])]
      .reverse()
      .find((turn) => turn.role === "user");
    if (priorUser?.content) {
      const prior = parseRecruitGideonQuery(priorUser.content);
      if (prior.intent === "shortlist") {
        parsed = { ...prior, confirmed: true, requiresConfirmation: false };
      }
    }
  }
  const href = "/recruit";
  const jobs = await listRecruitmentJobs(supabase, args.profileId);

  if (parsed.intent === "list_jobs" || parsed.intent === "unknown") {
    return { message: formatRecruitJobs(jobs), intent: "list_jobs", href };
  }

  const loaded = await loadJobCandidates(supabase, jobs, parsed.jobTitle);
  if ("error" in loaded) {
    return { message: `${loaded.error}\n\n→ ${href}`, intent: parsed.intent, href };
  }

  if (parsed.intent === "candidates" || parsed.intent === "top_matches") {
    return {
      message: formatRecruitCandidates(
        loaded.job,
        loaded.candidates,
        parsed.intent === "top_matches" ? 5 : 8
      ),
      intent: parsed.intent,
      href: `/recruit/${loaded.job.id}`,
    };
  }

  if (parsed.intent === "candidate_lookup") {
    const candidate = matchCandidate(loaded.candidates, parsed.candidateName);
    if (!candidate) {
      return {
        message: parsed.candidateName
          ? `I couldn't find a candidate matching "${parsed.candidateName}" for ${loaded.job.title}.`
          : formatRecruitCandidates(loaded.job, loaded.candidates),
        href: `/recruit/${loaded.job.id}`,
        intent: "candidate_lookup",
      };
    }
    const summary = candidate.score?.candidate_summary?.trim();
    return {
      message: [
        formatCandidateLine(candidate, loaded.job.title),
        summary,
        "",
        `→ /recruit/${loaded.job.id}`,
      ]
        .filter(Boolean)
        .join("\n"),
      intent: "candidate_lookup",
      href: `/recruit/${loaded.job.id}`,
    };
  }

  if (parsed.intent === "shortlist") {
    if (!parsed.candidateName || !parsed.reviewStatus) {
      return {
        message: formatRecruitShortlist(loaded.job, loaded.candidates),
        intent: "shortlist",
        href: `/recruit/${loaded.job.id}`,
      };
    }

    const candidate = matchCandidate(loaded.candidates, parsed.candidateName);
    if (!candidate) {
      return {
        message: `I couldn't find a candidate matching "${parsed.candidateName}" for ${loaded.job.title}.`,
        href: `/recruit/${loaded.job.id}`,
        intent: "shortlist",
      };
    }

    const actionLabel = parsed.reviewStatus === "declined" ? "Decline" : "Shortlist";
    if (!isConfirmed) {
      return {
        message: `${actionLabel} ${formatCandidateLine(candidate)}? Reply "yes, ${parsed.reviewStatus === "declined" ? "decline" : "shortlist"}" to confirm.`,
        requiresConfirmation: true,
        intent: "shortlist",
        href: `/recruit/${loaded.job.id}`,
      };
    }

    const reviewStatus = parsed.reviewStatus;
    await supabase.from("recruitment_reviews").upsert(
      {
        candidate_id: candidate.id,
        reviewer_user_id: args.userId,
        review_status: reviewStatus,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "candidate_id,reviewer_user_id" }
    );
    await supabase
      .from("recruitment_candidates")
      .update({
        review_status: reviewStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", candidate.id);

    if (reviewStatus === "shortlisted") {
      const { data: existing } = await supabase
        .from("recruitment_shortlists")
        .select("rank")
        .eq("job_id", loaded.job.id)
        .order("rank", { ascending: false })
        .limit(1);
      const nextRank = (existing?.[0]?.rank ?? 0) + 1;
      await supabase.from("recruitment_shortlists").upsert(
        {
          job_id: loaded.job.id,
          candidate_id: candidate.id,
          rank: nextRank,
          added_by: args.userId,
        },
        { onConflict: "job_id,candidate_id" }
      );
    }

    await logRecruitAudit(supabase, {
      jobId: loaded.job.id,
      candidateId: candidate.id,
      actorUserId: args.userId,
      action: reviewStatus === "declined" ? "candidate_declined" : "candidate_shortlisted",
    });

    return {
      message: `${actionLabel === "Decline" ? "Declined" : "Shortlisted"} ${candidate.display_name ?? "the candidate"} for ${loaded.job.title}.`,
      intent: "shortlist",
      href: `/recruit/${loaded.job.id}`,
    };
  }

  return { message: formatRecruitJobs(jobs), intent: "list_jobs", href };
}
