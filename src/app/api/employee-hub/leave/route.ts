import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { listLeaveRequests } from "@/lib/employee-hub/server";
import { canSubmitTimeEntry } from "@/lib/payroll/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const employeeProfileId = new URL(request.url).searchParams.get(
    "employeeProfileId"
  );
  if (!employeeProfileId) {
    return NextResponse.json(
      { error: "employeeProfileId is required." },
      { status: 400 }
    );
  }

  const { data: profile } = await supabase
    .from("guardian_profiles")
    .select("parent_profile_id, profile_type")
    .eq("id", employeeProfileId)
    .maybeSingle();

  const row = profile as { parent_profile_id: string | null; profile_type: string } | null;
  if (!row || row.profile_type !== "employee" || !row.parent_profile_id) {
    return NextResponse.json({ error: "Employee not found." }, { status: 404 });
  }

  const allowed = await canSubmitTimeEntry(
    supabase,
    row.parent_profile_id,
    employeeProfileId,
    user.id
  );
  if (!allowed) {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }

  const requests = await listLeaveRequests(supabase, employeeProfileId);
  return NextResponse.json({ requests });
}

const createSchema = z.object({
  employeeProfileId: z.string().uuid(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  leaveType: z.enum(["pto", "sick", "ooo", "other"]).default("pto"),
  reason: z.string().max(1000).optional(),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 }
    );
  }

  if (parsed.data.endDate < parsed.data.startDate) {
    return NextResponse.json(
      { error: "End date must be on or after start date." },
      { status: 400 }
    );
  }

  const { data: profile } = await supabase
    .from("guardian_profiles")
    .select("parent_profile_id, profile_type")
    .eq("id", parsed.data.employeeProfileId)
    .maybeSingle();

  const row = profile as { parent_profile_id: string | null; profile_type: string } | null;
  if (!row || row.profile_type !== "employee" || !row.parent_profile_id) {
    return NextResponse.json({ error: "Employee not found." }, { status: 404 });
  }

  const allowed = await canSubmitTimeEntry(
    supabase,
    row.parent_profile_id,
    parsed.data.employeeProfileId,
    user.id
  );
  if (!allowed) {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("employee_leave_requests")
    .insert({
      business_profile_id: row.parent_profile_id,
      employee_profile_id: parsed.data.employeeProfileId,
      start_date: parsed.data.startDate,
      end_date: parsed.data.endDate,
      leave_type: parsed.data.leaveType,
      reason: parsed.data.reason ?? null,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Couldn't submit request." }, { status: 502 });
  }

  return NextResponse.json({ id: data.id });
}
