import { NextResponse } from "next/server";
import { isAuthed, requirePayrollUser } from "@/lib/payroll/auth";
import { answerPayrollGideonQuery } from "@/lib/payroll/gideonChat";
import { verifyProfileAccess } from "@/lib/payroll/server";

export const runtime = "nodejs";

/** Gideon payroll command handler — never approves or shares without owner confirmation. */
export async function POST(request: Request) {
  const auth = await requirePayrollUser();
  if (!isAuthed(auth)) return auth;

  let body: { query?: string; profileId?: string; reportId?: string; confirmed?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const query = body.query?.trim();
  const profileId = body.profileId;
  if (!query || !profileId) {
    return NextResponse.json({ error: "query and profileId are required." }, { status: 400 });
  }

  const allowed = await verifyProfileAccess(auth.supabase, profileId, auth.user.id);
  if (!allowed) {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }

  const result = await answerPayrollGideonQuery(auth.supabase, {
    query,
    profileId,
    reportId: body.reportId,
    confirmed: body.confirmed,
  });

  if (!result) {
    return NextResponse.json({ message: "I couldn't process that payroll question." });
  }

  return NextResponse.json({
    message: result.message,
    requiresConfirmation: result.requiresConfirmation,
    intent: result.intent,
    action: result.href ? { type: "navigate", href: result.href } : undefined,
  });
}
