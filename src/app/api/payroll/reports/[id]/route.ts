import { NextResponse } from "next/server";
import { isAuthed, requirePayrollUser } from "@/lib/payroll/auth";
import { buildPayrollReportData, refreshDraftReport } from "@/lib/payroll/reportData";
import { getPayrollReport, verifyProfileAccess } from "@/lib/payroll/server";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const auth = await requirePayrollUser();
  if (!isAuthed(auth)) return auth;
  const { id } = await context.params;

  const report = await getPayrollReport(auth.supabase, id);
  if (!report) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }

  const allowed = await verifyProfileAccess(auth.supabase, report.profile_id, auth.user.id);
  if (!allowed) {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }

  const data = await buildPayrollReportData(auth.supabase, id);
  return NextResponse.json({ data });
}

export async function POST(request: Request, context: RouteContext) {
  const auth = await requirePayrollUser();
  if (!isAuthed(auth)) return auth;
  const { id } = await context.params;

  const report = await getPayrollReport(auth.supabase, id);
  if (!report) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }

  const allowed = await verifyProfileAccess(auth.supabase, report.profile_id, auth.user.id);
  if (!allowed) {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }

  let action = "refresh";
  try {
    const body = await request.json();
    if (typeof body.action === "string") action = body.action;
  } catch {
    // default refresh
  }

  if (action === "refresh") {
    const result = await refreshDraftReport(auth.supabase, id);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    const data = await buildPayrollReportData(auth.supabase, id);
    return NextResponse.json({ ok: true, data });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
