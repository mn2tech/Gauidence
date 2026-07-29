import "server-only";

import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  analyzeCandidateAgainstJob,
  extractCandidateFromResume,
} from "./ai";
import { extractResumeText } from "./resumeExtract";
import {
  ensureJobRequirements,
  getRecruitmentJob,
  logRecruitAudit,
} from "./server";

export function hashFileBuffer(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export async function processCandidateResume(
  supabase: SupabaseClient,
  args: {
    candidateId: string;
    jobId: string;
    actorUserId: string;
  }
): Promise<{ ok: boolean; error?: string }> {
  const job = await getRecruitmentJob(supabase, args.jobId);
  if (!job) return { ok: false, error: "Job not found." };

  const rubric = await ensureJobRequirements(supabase, args.jobId);
  if (!rubric) return { ok: false, error: "Could not load rubric." };

  await supabase
    .from("recruitment_candidates")
    .update({
      processing_status: "extracting",
      processing_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", args.candidateId);

  const { data: files } = await supabase
    .from("recruitment_candidate_files")
    .select("*")
    .eq("candidate_id", args.candidateId)
    .limit(1);

  const file = files?.[0];
  if (!file) {
    await supabase
      .from("recruitment_candidates")
      .update({
        processing_status: "failed",
        processing_error: "No resume file found.",
        updated_at: new Date().toISOString(),
      })
      .eq("id", args.candidateId);
    return { ok: false, error: "No resume file found." };
  }

  const { data: fileData, error: downloadError } = await supabase.storage
    .from(file.storage_bucket)
    .download(file.file_path);

  if (downloadError || !fileData) {
    await supabase
      .from("recruitment_candidates")
      .update({
        processing_status: "failed",
        processing_error: "Could not download resume file.",
        updated_at: new Date().toISOString(),
      })
      .eq("id", args.candidateId);
    return { ok: false, error: "Could not download resume file." };
  }

  const buffer = Buffer.from(await fileData.arrayBuffer());
  const base64 = buffer.toString("base64");

  const { text: resumeText, error: extractError } = await extractResumeText({
    mimeType: file.mime_type,
    base64,
    fileName: file.file_name,
  });

  if (!resumeText || extractError) {
    await supabase
      .from("recruitment_candidates")
      .update({
        processing_status: "failed",
        processing_error: extractError ?? "Could not extract resume text.",
        updated_at: new Date().toISOString(),
      })
      .eq("id", args.candidateId);
    return { ok: false, error: extractError ?? "Could not extract resume text." };
  }

  try {
    const extraction = await extractCandidateFromResume(resumeText);

    await supabase.from("recruitment_candidate_extractions").upsert(
      {
        candidate_id: args.candidateId,
        candidate_name: extraction.candidate_name,
        email: extraction.email,
        phone: extraction.phone,
        location: extraction.location,
        current_title: extraction.current_title,
        total_experience_years: extraction.total_experience_years,
        relevant_experience_years: extraction.relevant_experience_years,
        employment_history: extraction.employment_history,
        technical_skills: extraction.technical_skills,
        domain_experience: extraction.domain_experience,
        education: extraction.education,
        certifications: extraction.certifications,
        work_authorization: extraction.work_authorization,
        availability: extraction.availability,
        raw_extraction: extraction,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "candidate_id" }
    );

    await supabase
      .from("recruitment_candidate_evidence")
      .delete()
      .eq("candidate_id", args.candidateId);

    if (extraction.evidence.length > 0) {
      await supabase.from("recruitment_candidate_evidence").insert(
        extraction.evidence.map((e) => ({
          candidate_id: args.candidateId,
          field_name: e.field_name,
          field_value: e.field_value,
          evidence_text: e.evidence_text,
        }))
      );
    }

    await supabase
      .from("recruitment_candidates")
      .update({
        display_name: extraction.candidate_name,
        email: extraction.email,
        phone: extraction.phone,
        processing_status: "extracted",
        updated_at: new Date().toISOString(),
      })
      .eq("id", args.candidateId);

    await supabase
      .from("recruitment_candidates")
      .update({ processing_status: "analyzing" })
      .eq("id", args.candidateId);

    const analysis = await analyzeCandidateAgainstJob({
      job,
      rubric,
      resumeText,
      extraction,
    });

    await supabase.from("recruitment_candidate_scores").upsert(
      {
        candidate_id: args.candidateId,
        match_score: analysis.match_score,
        recommendation_status: analysis.recommendation_status,
        required_skill_match_pct: analysis.required_skill_match_pct,
        matched_requirements: analysis.matched_requirements,
        missing_requirements: analysis.missing_requirements,
        preferred_qualifications_matched: analysis.preferred_qualifications_matched,
        unclear_information: analysis.unclear_information,
        interview_questions: analysis.interview_questions,
        candidate_summary: analysis.candidate_summary,
        strengths: analysis.strengths,
        concerns: analysis.concerns,
        category_scores: analysis.category_scores,
        analyzed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "candidate_id" }
    );

    if (analysis.evidence.length > 0) {
      await supabase.from("recruitment_candidate_evidence").insert(
        analysis.evidence.map((e) => ({
          candidate_id: args.candidateId,
          field_name: e.field_name,
          field_value: e.field_value,
          evidence_text: e.evidence_text,
        }))
      );
    }

    await supabase
      .from("recruitment_candidates")
      .update({
        processing_status: "analyzed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", args.candidateId);

    await logRecruitAudit(supabase, {
      jobId: args.jobId,
      candidateId: args.candidateId,
      actorUserId: args.actorUserId,
      action: "candidate_analyzed",
      details: {
        match_score: analysis.match_score,
        recommendation_status: analysis.recommendation_status,
      },
    });

    return { ok: true };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Analysis failed unexpectedly.";
    await supabase
      .from("recruitment_candidates")
      .update({
        processing_status: "failed",
        processing_error: message,
        updated_at: new Date().toISOString(),
      })
      .eq("id", args.candidateId);
    return { ok: false, error: message };
  }
}
