import { NextResponse } from "next/server";
import { isAuthed, requireRecruitUser } from "@/lib/recruit/auth";
import { buildEmailDraft } from "@/lib/recruit/ai";
import {
  generateCsvReport,
  generateDocxReport,
  generateHtmlReport,
} from "@/lib/recruit/export";
import { buildRecruitReportData } from "@/lib/recruit/reportData";
import { authenticatedReportUrl } from "@/lib/recruit/shareReport";
import { logRecruitAudit } from "@/lib/recruit/server";

export const runtime = "nodejs";
export const maxDuration = 60;

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  const auth = await requireRecruitUser();
  if (!isAuthed(auth)) return auth;
  const { id: jobId } = await context.params;

  const url = new URL(request.url);
  const format = url.searchParams.get("format") ?? "json";

  const reportData = await buildRecruitReportData(
    auth.supabase,
    jobId,
    auth.user
  );
  if (!reportData) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }

  const recruiterName = reportData.recruiterName;
  const reportUrl = authenticatedReportUrl(jobId);

  const emailDraft = buildEmailDraft({
    jobTitle: reportData.job.title,
    hiringManager: reportData.job.hiring_manager ?? "",
    applicantCount: reportData.candidates.length,
    recruiterName,
    reportUrl,
  });

  if (format === "csv") {
    const csv = generateCsvReport(reportData);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="shortlist-${reportData.job.title.replace(/[^\w]/g, "-")}.csv"`,
      },
    });
  }

  if (format === "html" || format === "pdf") {
    const html = generateHtmlReport(reportData);
    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html",
        "Content-Disposition": `inline; filename="report-${reportData.job.title.replace(/[^\w]/g, "-")}.html"`,
      },
    });
  }

  if (format === "docx") {
    const buffer = await generateDocxReport(reportData);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="report-${reportData.job.title.replace(/[^\w]/g, "-")}.docx"`,
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
    reportUrl,
    exportUrls: {
      csv: `/api/recruit/jobs/${jobId}/report?format=csv`,
      html: `/api/recruit/jobs/${jobId}/report?format=html`,
      docx: `/api/recruit/jobs/${jobId}/report?format=docx`,
      inApp: `/recruit/${jobId}/report`,
    },
  });
}
