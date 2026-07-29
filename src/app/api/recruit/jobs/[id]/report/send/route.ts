import { NextResponse } from "next/server";
import { sendRecruitReportReadyEmail } from "@/lib/email";
import { isValidInviteEmail, normalizeInviteEmail } from "@/lib/profiles/invitations";
import { isAuthed, requireRecruitUser } from "@/lib/recruit/auth";
import { buildRecruitReportData } from "@/lib/recruit/reportData";
import {
  createReportLink,
  grantHiringManagerAccess,
} from "@/lib/recruit/shareReport";
import { getRecruitmentJob, logRecruitAudit } from "@/lib/recruit/server";

export const runtime = "nodejs";
export const maxDuration = 60;

type RouteContext = { params: Promise<{ id: string }> };

const LINK_TTL_DAYS = 30;

/** Generate report and email hiring manager an in-Guardian link. */
export async function POST(request: Request, context: RouteContext) {
  const auth = await requireRecruitUser();
  if (!isAuthed(auth)) return auth;
  const { id: jobId } = await context.params;

  const job = await getRecruitmentJob(auth.supabase, jobId);
  if (!job) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }

  let bodyEmail: string | undefined;
  try {
    const body = await request.json();
    if (typeof body.email === "string") bodyEmail = body.email.trim();
  } catch {
    // optional body
  }

  const toEmail = normalizeInviteEmail(
    bodyEmail || job.hiring_manager_email || ""
  );
  if (!isValidInviteEmail(toEmail)) {
    return NextResponse.json(
      {
        error:
          "Add a valid hiring manager email on the job before sending the report.",
      },
      { status: 400 }
    );
  }

  const reportData = await buildRecruitReportData(
    auth.supabase,
    jobId,
    auth.user
  );
  if (!reportData) {
    return NextResponse.json(
      { error: "Couldn't build report. Analyze candidates first." },
      { status: 400 }
    );
  }

  if (reportData.shortlisted.length === 0) {
    return NextResponse.json(
      { error: "No analyzed candidates to include in the report." },
      { status: 400 }
    );
  }

  const { data: savedReport, error: reportError } = await auth.supabase
    .from("recruitment_reports")
    .insert({
      job_id: jobId,
      generated_by: auth.user.id,
      report_data: reportData as unknown as Record<string, unknown>,
    })
    .select("id")
    .single();

  if (reportError || !savedReport) {
    return NextResponse.json(
      { error: "Couldn't save report." },
      { status: 502 }
    );
  }

  const link = await createReportLink(auth.supabase, {
    jobId,
    email: toEmail,
    createdBy: auth.user.id,
    reportId: savedReport.id,
  });
  if (!link) {
    return NextResponse.json(
      { error: "Couldn't create secure report link." },
      { status: 502 }
    );
  }

  await grantHiringManagerAccess(auth.supabase, {
    jobId,
    email: toEmail,
    sharedBy: auth.user.id,
  });

  if (toEmail !== job.hiring_manager_email) {
    await auth.supabase
      .from("recruitment_jobs")
      .update({
        hiring_manager_email: toEmail,
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);
  }

  const recruiterName =
    auth.user.user_metadata?.full_name ??
    auth.user.email?.split("@")[0] ??
    "Recruiter";

  const sent = await sendRecruitReportReadyEmail({
    to: toEmail,
    hiringManagerName: job.hiring_manager ?? "",
    jobTitle: job.title,
    applicantCount: reportData.candidates.length,
    shortlistCount: reportData.shortlisted.length,
    recruiterName,
    reportUrl: link.url,
    expiresInDays: LINK_TTL_DAYS,
  });

  if (!sent) {
    return NextResponse.json(
      {
        error:
          "Report saved but email couldn't be sent. Check RESEND_API_KEY and INVITE_FROM_EMAIL.",
        reportUrl: link.url,
      },
      { status: 502 }
    );
  }

  await logRecruitAudit(auth.supabase, {
    jobId,
    actorUserId: auth.user.id,
    action: "report_emailed",
    details: { to: toEmail, link_expires_at: link.expiresAt },
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
    ok: true,
    sentTo: toEmail,
    reportUrl: link.url,
    expiresAt: link.expiresAt,
    authenticatedUrl: `/recruit/${jobId}/report`,
  });
}
