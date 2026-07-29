import { NextResponse } from "next/server";
import { sendPayrollShareEmail } from "@/lib/email";
import { isAuthed, requirePayrollUser } from "@/lib/payroll/auth";
import { formatPayPeriod } from "@/lib/payroll/compute";
import { buildPayrollReportData } from "@/lib/payroll/reportData";
import { createPayrollShare } from "@/lib/payroll/shareReport";
import {
  getActiveShare,
  getBusinessName,
  getPayrollReport,
  logPayrollAudit,
  verifyProfileAccess,
} from "@/lib/payroll/server";
import { createShareSchema } from "@/lib/payroll/validators";

export const runtime = "nodejs";
export const maxDuration = 60;

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const auth = await requirePayrollUser();
  if (!isAuthed(auth)) return auth;
  const { id: reportId } = await context.params;

  const report = await getPayrollReport(auth.supabase, reportId);
  if (!report) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }

  const allowed = await verifyProfileAccess(auth.supabase, report.profile_id, auth.user.id);
  if (!allowed) {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }

  if (report.status !== "approved" && report.status !== "shared") {
    return NextResponse.json(
      { error: "Only approved reports can be shared. Approve the report first." },
      { status: 400 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = createShareSchema.safeParse({ ...body as object, reportId });
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 }
    );
  }

  const existing = await getActiveShare(auth.supabase, reportId);
  if (existing && !parsed.data.replaceExisting) {
    return NextResponse.json(
      {
        error: "A share already exists for this report. Confirm to replace it.",
        requiresConfirmation: true,
        existingShare: {
          recipientEmail: existing.recipient_email,
          expiresAt: existing.expires_at,
        },
      },
      { status: 409 }
    );
  }

  if (existing && parsed.data.replaceExisting) {
    await auth.supabase
      .from("payroll_shares")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", existing.id);
    await logPayrollAudit(auth.supabase, {
      shareId: existing.id,
      action: "access_revoked",
      actorUserId: auth.user.id,
      details: { reason: "replaced" },
    });
  }

  const share = await createPayrollShare(auth.supabase, {
    reportId,
    profileId: report.profile_id,
    recipientEmail: parsed.data.recipientEmail,
    recipientName: parsed.data.recipientName,
    accessType: parsed.data.accessType,
    allowedFormats: parsed.data.allowedFormats,
    expiresAt: parsed.data.expiresAt,
    requireEmailVerification: parsed.data.requireEmailVerification,
    optionalMessage: parsed.data.optionalMessage,
    createdBy: auth.user.id,
  });

  if (!share) {
    return NextResponse.json({ error: "Couldn't create secure share." }, { status: 502 });
  }

  const businessName = await getBusinessName(auth.supabase, report.profile_id);
  const payPeriod = formatPayPeriod(report.pay_period_start, report.pay_period_end);
  const ownerName =
    auth.user.user_metadata?.full_name ??
    auth.user.email?.split("@")[0] ??
    "Business Owner";

  const sent = await sendPayrollShareEmail({
    to: parsed.data.recipientEmail,
    recipientName: parsed.data.recipientName ?? "",
    businessName,
    payPeriod,
    shareUrl: share.url,
    expiresAt: share.expiresAt,
    optionalMessage: parsed.data.optionalMessage,
    ownerName,
  });

  await auth.supabase
    .from("payroll_reports")
    .update({ status: "shared", updated_at: new Date().toISOString() })
    .eq("id", reportId);

  await logPayrollAudit(auth.supabase, {
    shareId: share.shareId,
    action: "report_shared",
    actorUserId: auth.user.id,
    recipientEmail: parsed.data.recipientEmail,
    details: { expiresAt: share.expiresAt },
  });

  if (sent) {
    await logPayrollAudit(auth.supabase, {
      shareId: share.shareId,
      action: "email_sent",
      actorUserId: auth.user.id,
      recipientEmail: parsed.data.recipientEmail,
    });
  }

  const data = await buildPayrollReportData(auth.supabase, reportId);

  return NextResponse.json({
    ok: true,
    shareUrl: share.url,
    expiresAt: share.expiresAt,
    emailSent: sent,
    data,
  });
}
