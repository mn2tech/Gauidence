import { NextResponse } from "next/server";
import { isAuthed, requirePayrollUser } from "@/lib/payroll/auth";
import { approvePayrollReport } from "@/lib/payroll/reportData";
import { getPayrollReport, logPayrollAudit, verifyProfileAccess } from "@/lib/payroll/server";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
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

  const result = await approvePayrollReport(auth.supabase, {
    reportId: id,
    approvedBy: auth.user.id,
  });

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  await logPayrollAudit(auth.supabase, {
    reportId: id,
    action: "report_approved",
    actorUserId: auth.user.id,
  });

  return NextResponse.json({ ok: true });
}
