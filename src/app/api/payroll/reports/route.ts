import { NextResponse } from "next/server";
import { isAuthed, requirePayrollUser } from "@/lib/payroll/auth";
import { createDraftReport } from "@/lib/payroll/reportData";
import { listPayrollReports, logPayrollAudit, verifyProfileAccess } from "@/lib/payroll/server";
import { generateReportSchema, parsePayPeriodDates } from "@/lib/payroll/validators";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requirePayrollUser();
  if (!isAuthed(auth)) return auth;

  const profileId = new URL(request.url).searchParams.get("profileId");
  if (!profileId) {
    return NextResponse.json({ error: "profileId is required." }, { status: 400 });
  }

  const allowed = await verifyProfileAccess(auth.supabase, profileId, auth.user.id);
  if (!allowed) {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }

  const reports = await listPayrollReports(auth.supabase, profileId);
  return NextResponse.json({ reports });
}

export async function POST(request: Request) {
  const auth = await requirePayrollUser();
  if (!isAuthed(auth)) return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = generateReportSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
  }

  const { profileId, payPeriodStart, payPeriodEnd } = parsed.data;
  const periodCheck = parsePayPeriodDates(payPeriodStart, payPeriodEnd);
  if (!periodCheck.ok) {
    return NextResponse.json({ error: periodCheck.error }, { status: 400 });
  }

  const allowed = await verifyProfileAccess(auth.supabase, profileId, auth.user.id);
  if (!allowed) {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }

  const result = await createDraftReport(auth.supabase, {
    profileId,
    periodStart: payPeriodStart,
    periodEnd: payPeriodEnd,
    createdBy: auth.user.id,
  });

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  await logPayrollAudit(auth.supabase, {
    reportId: result.reportId,
    action: "report_created",
    actorUserId: auth.user.id,
    details: { payPeriodStart, payPeriodEnd },
  });

  return NextResponse.json({ reportId: result.reportId });
}
