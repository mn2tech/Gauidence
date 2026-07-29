import { NextResponse } from "next/server";
import {
  buildExternalReportData,
  logExternalAccess,
  lookupShareByToken,
} from "@/lib/payroll/external";
import { verifyShareSession } from "@/lib/payroll/session";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ token: string }> };

function clientIp(request: Request): string | undefined {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    undefined
  );
}

/** Public payroll share lookup — returns metadata only until verified. */
export async function GET(request: Request, context: RouteContext) {
  const { token } = await context.params;
  const lookup = await lookupShareByToken(token);
  if (!lookup.ok) {
    return NextResponse.json({ error: lookup.error }, { status: lookup.status });
  }

  const { share, admin } = lookup;
  const ip = clientIp(request);
  const ua = request.headers.get("user-agent") ?? undefined;

  await logExternalAccess(admin, {
    shareId: share.id,
    action: "link_opened",
    recipientEmail: share.recipient_email,
    ipAddress: ip,
    userAgent: ua,
  });

  const verified = await verifyShareSession(share.id);

  if (!verified && share.require_email_verification) {
    return NextResponse.json({
      requiresVerification: true,
      recipientEmail: share.recipient_email.replace(/(.{2}).*(@.*)/, "$1***$2"),
      businessName: null,
    });
  }

  const report = await buildExternalReportData(admin, share);
  if (!report) {
    return NextResponse.json({ error: "Report not available." }, { status: 404 });
  }

  if (!share.opened_at) {
    await admin
      .from("payroll_shares")
      .update({
        opened_at: new Date().toISOString(),
        last_accessed_at: new Date().toISOString(),
      })
      .eq("id", share.id);
    await logExternalAccess(admin, {
      shareId: share.id,
      action: "report_opened",
      recipientEmail: share.recipient_email,
      ipAddress: ip,
      userAgent: ua,
    });
  }

  await logExternalAccess(admin, {
    shareId: share.id,
    action: "report_viewed",
    recipientEmail: share.recipient_email,
    ipAddress: ip,
    userAgent: ua,
  });

  return NextResponse.json({ report, verified: true });
}
