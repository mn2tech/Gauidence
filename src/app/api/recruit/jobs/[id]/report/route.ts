import { NextResponse } from "next/server";
import { isAuthed, requireRecruitUser } from "@/lib/recruit/auth";
import { buildEmailDraft } from "@/lib/recruit/ai";
import {
  generateCsvReport,
  generateDocxReport,
  generateHtmlReport,
  type ReportData,
} from "@/lib/recruit/export";
import {
  effectiveScore,
  ensureJobRequirements,
  getRecruitmentJob,
  listCandidatesWithDetails,
  logRecruitAudit,
} from "@/lib/recruit/server";

export const runtime = "nodejs";
export const maxDuration = 60;

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  const auth = await requireRecruitUser();
  if (!isAuthed(auth)) return auth;
  const { id: jobId } = await context.params;

  const url = new URL(request.url);
  const format = url.searchParams.get("format") ?? "json";

  const job = await getRecruitmentJob(auth.supabase, jobId);
  if (!job) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }

  const rubric = await ensureJobRequirements(auth.supabase, jobId);
  if (!rubric) {
    return NextResponse.json({ error: "Rubric not found." }, { status: 404 });
  }

  const candidates = await listCandidatesWithDetails(auth.supabase, jobId);
  const analyzed = candidates.filter((c) => c.score);

  const sorted = [...analyzed].sort((a, b) => {
    const rankA = a.manual_rank ?? 9999;
    const rankB = b.manual_rank ?? 9999;
    if (rankA !== rankB) return rankA - rankB;
    return (effectiveScore(b.score) ?? 0) - (effectiveScore(a.score) ?? 0);
  });

  const shortlisted = sorted
    .filter((c) => c.review_status === "shortlisted" || c.review_status === "hm_review")
    .slice(0, job.shortlist_count);

  const fallbackShortlist =
    shortlisted.length > 0
      ? shortlisted
      : sorted.slice(0, job.shortlist_count);

  const recruiterName =
    auth.user.user_metadata?.full_name ??
    auth.user.email?.split("@")[0] ??
    "Recruiter";

  const reportData: ReportData = {
    job,
    rubric,
    candidates: analyzed,
    shortlisted: fallbackShortlist,
    generatedAt: new Date().toISOString(),
    recruiterName,
  };

  const emailDraft = buildEmailDraft({
    jobTitle: job.title,
    hiringManager: job.hiring_manager ?? "",
    applicantCount: analyzed.length,
    recruiterName,
  });

  if (format === "csv") {
    const csv = generateCsvReport(reportData);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="shortlist-${job.title.replace(/[^\w]/g, "-")}.csv"`,
      },
    });
  }

  if (format === "html" || format === "pdf") {
    const html = generateHtmlReport(reportData);
    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html",
        "Content-Disposition": `inline; filename="report-${job.title.replace(/[^\w]/g, "-")}.html"`,
      },
    });
  }

  if (format === "docx") {
    const buffer = await generateDocxReport(reportData);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="report-${job.title.replace(/[^\w]/g, "-")}.docx"`,
      },
    });
  }

  await auth.supabase.from("recruitment_reports").insert({
    job_id: jobId,
    generated_by: auth.user.id,
    report_data: reportData as unknown as Record<string, unknown>,
    email_draft: emailDraft,
  });

  await logRecruitAudit(auth.supabase, {
    jobId,
    actorUserId: auth.user.id,
    action: "report_generated",
  });

  await auth.supabase
    .from("recruitment_jobs")
    .update({
      current_step: "export",
      status: "shortlisted",
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);

  return NextResponse.json({
    report: reportData,
    emailDraft,
    exportUrls: {
      csv: `/api/recruit/jobs/${jobId}/report?format=csv`,
      html: `/api/recruit/jobs/${jobId}/report?format=html`,
      docx: `/api/recruit/jobs/${jobId}/report?format=docx`,
    },
  });
}
