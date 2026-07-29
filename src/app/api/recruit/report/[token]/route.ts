import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildRecruitReportData } from "@/lib/recruit/reportData";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ token: string }> };

/** Public report lookup via secure token (no login required). */
export async function GET(_request: Request, context: RouteContext) {
  const { token } = await context.params;
  if (!token || token.length < 16 || token.length > 128) {
    return NextResponse.json({ error: "Invalid report link." }, { status: 400 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Report sharing isn't configured on this deployment." },
      { status: 503 }
    );
  }

  const { data: link, error: linkError } = await admin
    .from("recruitment_report_links")
    .select("id, job_id, expires_at, revoked_at, invited_email")
    .eq("token", token)
    .maybeSingle();

  if (linkError || !link) {
    return NextResponse.json(
      { error: "This report link is invalid or has been removed." },
      { status: 404 }
    );
  }

  if (link.revoked_at) {
    return NextResponse.json(
      { error: "This report link has been revoked." },
      { status: 410 }
    );
  }

  if (new Date(link.expires_at).getTime() < Date.now()) {
    return NextResponse.json(
      { error: "This report link has expired." },
      { status: 410 }
    );
  }

  const report = await buildRecruitReportData(admin, link.job_id);
  if (!report) {
    return NextResponse.json(
      { error: "Report data is no longer available." },
      { status: 404 }
    );
  }

  await admin
    .from("recruitment_report_links")
    .update({ last_accessed_at: new Date().toISOString() })
    .eq("id", link.id);

  return NextResponse.json({
    report,
    invitedEmail: link.invited_email,
  });
}
