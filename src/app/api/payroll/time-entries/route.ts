import { NextResponse } from "next/server";
import { isAuthed, requirePayrollUser } from "@/lib/payroll/auth";
import { verifyProfileAccess } from "@/lib/payroll/server";
import { timeEntrySchema } from "@/lib/payroll/validators";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requirePayrollUser();
  if (!isAuthed(auth)) return auth;

  const url = new URL(request.url);
  const profileId = url.searchParams.get("profileId");
  const employeeProfileId = url.searchParams.get("employeeProfileId");
  const periodStart = url.searchParams.get("periodStart");
  const periodEnd = url.searchParams.get("periodEnd");

  if (!profileId) {
    return NextResponse.json({ error: "profileId is required." }, { status: 400 });
  }

  const allowed = await verifyProfileAccess(auth.supabase, profileId, auth.user.id);
  if (!allowed) {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }

  let query = auth.supabase
    .from("payroll_time_entries")
    .select("id, employee_profile_id, clock_in_at, clock_out_at, notes")
    .eq("profile_id", profileId)
    .order("clock_in_at", { ascending: false });

  if (employeeProfileId) {
    query = query.eq("employee_profile_id", employeeProfileId);
  }

  if (periodStart && periodEnd) {
    query = query
      .gte("clock_in_at", `${periodStart}T00:00:00.000Z`)
      .lte("clock_in_at", `${periodEnd}T23:59:59.999Z`);
  }

  const { data, error } = await query.limit(100);
  if (error) {
    return NextResponse.json({ error: "Couldn't load time entries." }, { status: 502 });
  }

  return NextResponse.json({ entries: data ?? [] });
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

  const parsed = timeEntrySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 }
    );
  }

  const allowed = await verifyProfileAccess(
    auth.supabase,
    parsed.data.profileId,
    auth.user.id
  );
  if (!allowed) {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }

  const { data: existing } = await auth.supabase
    .from("payroll_time_entries")
    .select("id")
    .eq("profile_id", parsed.data.profileId)
    .eq("employee_profile_id", parsed.data.employeeProfileId)
    .is("clock_out_at", null)
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      { error: "This employee already has an open clock-in. Clock out first." },
      { status: 400 }
    );
  }

  const { data, error } = await auth.supabase
    .from("payroll_time_entries")
    .insert({
      profile_id: parsed.data.profileId,
      employee_profile_id: parsed.data.employeeProfileId,
      clock_in_at: parsed.data.clockInAt,
      clock_out_at: parsed.data.clockOutAt ?? null,
      notes: parsed.data.notes ?? null,
      created_by: auth.user.id,
    })
    .select("id")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Couldn't save time entry." }, { status: 502 });
  }

  return NextResponse.json({ id: data.id });
}
