import { NextResponse } from "next/server";
import { isAuthed, requirePayrollUser } from "@/lib/payroll/auth";
import { getPayrollReport, getReportEntries, verifyProfileAccess } from "@/lib/payroll/server";
import { updateEntrySchema } from "@/lib/payroll/validators";
import { sumReportTotals } from "@/lib/payroll/compute";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string; entryId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requirePayrollUser();
  if (!isAuthed(auth)) return auth;
  const { id: reportId, entryId } = await context.params;

  const report = await getPayrollReport(auth.supabase, reportId);
  if (!report) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }

  if (report.status !== "draft") {
    return NextResponse.json(
      { error: "Only draft reports can be edited." },
      { status: 400 }
    );
  }

  const allowed = await verifyProfileAccess(auth.supabase, report.profile_id, auth.user.id);
  if (!allowed) {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = updateEntrySchema.safeParse({ ...body as object, entryId });
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 }
    );
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (parsed.data.adjustmentHours !== undefined) {
    updates.adjustment_hours = parsed.data.adjustmentHours;
  }
  if (parsed.data.adjustmentReason !== undefined) {
    updates.adjustment_reason = parsed.data.adjustmentReason;
  }
  if (parsed.data.ownerNotes !== undefined) {
    updates.owner_notes = parsed.data.ownerNotes;
  }

  const { error } = await auth.supabase
    .from("payroll_report_entries")
    .update(updates)
    .eq("id", entryId)
    .eq("payroll_report_id", reportId);

  if (error) {
    return NextResponse.json({ error: "Couldn't update entry." }, { status: 502 });
  }

  const entries = await getReportEntries(auth.supabase, reportId);
  const totals = sumReportTotals(entries);
  await auth.supabase
    .from("payroll_reports")
    .update({ ...totals, updated_at: new Date().toISOString() })
    .eq("id", reportId);

  return NextResponse.json({ ok: true, entries, totals });
}
