import { NextResponse } from "next/server";
import { sendPayrollShareEmail } from "@/lib/email";
import { isAuthed, requirePayrollUser } from "@/lib/payroll/auth";
import { formatPayPeriod } from "@/lib/payroll/compute";
import { payrollShareUrl, revokePayrollShare } from "@/lib/payroll/shareReport";
import {
  getBusinessName,
  getPayrollReport,
  logPayrollAudit,
  verifyProfileAccess,
} from "@/lib/payroll/server";
import { createAccessToken, hashAccessToken } from "@/lib/payroll/tokens";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const auth = await requirePayrollUser();
  if (!isAuthed(auth)) return auth;
  const { id: shareId } = await context.params;

  const { data: share, error } = await auth.supabase
    .from("payroll_shares")
    .select("*")
    .eq("id", shareId)
    .maybeSingle();

  if (error || !share) {
    return NextResponse.json({ error: "Share not found." }, { status: 404 });
  }

  const s = share as { profile_id: string; payroll_report_id: string; recipient_email: string; recipient_name: string | null; expires_at: string; access_token_hash: string; revoked_at: string | null };
  const allowed = await verifyProfileAccess(auth.supabase, s.profile_id, auth.user.id);
  if (!allowed) {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }

  let action = "revoke";
  try {
    const body = await request.json();
    if (typeof body.action === "string") action = body.action;
  } catch {
    // default
  }

  if (action === "revoke") {
    if (s.revoked_at) {
      return NextResponse.json({ error: "Share already revoked." }, { status: 400 });
    }
    const ok = await revokePayrollShare(auth.supabase, shareId);
    if (!ok) {
      return NextResponse.json({ error: "Couldn't revoke access." }, { status: 502 });
    }
    await logPayrollAudit(auth.supabase, {
      shareId,
      action: "access_revoked",
      actorUserId: auth.user.id,
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "resend") {
    if (s.revoked_at) {
      return NextResponse.json({ error: "Share has been revoked." }, { status: 400 });
    }
    if (new Date(s.expires_at).getTime() < Date.now()) {
      return NextResponse.json({ error: "Share has expired." }, { status: 400 });
    }

    const report = await getPayrollReport(auth.supabase, s.payroll_report_id);
    if (!report) {
      return NextResponse.json({ error: "Report not found." }, { status: 404 });
    }

    const businessName = await getBusinessName(auth.supabase, s.profile_id);
    const payPeriod = formatPayPeriod(report.pay_period_start, report.pay_period_end);
    const ownerName =
      auth.user.user_metadata?.full_name ??
      auth.user.email?.split("@")[0] ??
      "Business Owner";

    const newToken = createAccessToken();
    await auth.supabase
      .from("payroll_shares")
      .update({ access_token_hash: hashAccessToken(newToken) })
      .eq("id", shareId);

    const sent = await sendPayrollShareEmail({
      to: s.recipient_email,
      recipientName: s.recipient_name ?? "",
      businessName,
      payPeriod,
      shareUrl: payrollShareUrl(newToken),
      expiresAt: s.expires_at,
      ownerName,
    });

    if (!sent) {
      return NextResponse.json({ error: "Couldn't resend email." }, { status: 502 });
    }

    await logPayrollAudit(auth.supabase, {
      shareId,
      action: "email_sent",
      actorUserId: auth.user.id,
      recipientEmail: s.recipient_email,
      details: { resent: true },
    });

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
