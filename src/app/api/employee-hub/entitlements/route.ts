import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  canEditEmployeeEntitlements,
  ensureEmployeeHubEntitlements,
  getEmployeeHubEntitlements,
  updateEmployeeHubEntitlements,
} from "@/lib/employee-hub/server";

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
    .select("id, parent_profile_id, profile_type")
    .eq("id", employeeProfileId)
    .maybeSingle();

  if (!profile || (profile as { profile_type: string }).profile_type !== "employee") {
    return NextResponse.json({ error: "Employee not found." }, { status: 404 });
  }

  const row = profile as { parent_profile_id: string | null };
  if (!row.parent_profile_id) {
    return NextResponse.json({ error: "Employee not linked." }, { status: 400 });
  }

  let entitlements = await getEmployeeHubEntitlements(supabase, employeeProfileId);
  if (!entitlements) {
    await ensureEmployeeHubEntitlements(
      supabase,
      row.parent_profile_id,
      employeeProfileId
    );
    entitlements = await getEmployeeHubEntitlements(supabase, employeeProfileId);
  }

  return NextResponse.json({ entitlements });
}

const patchSchema = z.object({
  employeeProfileId: z.string().uuid(),
  time_tracking: z.boolean().optional(),
  manual_time_entry: z.boolean().optional(),
  status_reports: z.boolean().optional(),
  invoice_upload: z.boolean().optional(),
  leave_requests: z.boolean().optional(),
  documents: z.boolean().optional(),
  gideon_chat: z.boolean().optional(),
  research: z.boolean().optional(),
  work_memory: z.boolean().optional(),
  experts: z.boolean().optional(),
  recruit: z.boolean().optional(),
  payroll_admin: z.boolean().optional(),
});

export async function PATCH(request: Request) {
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

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input." },
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

  const canEdit = await canEditEmployeeEntitlements(
    supabase,
    row.parent_profile_id,
    user.id
  );
  if (!canEdit) {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }

  const { employeeProfileId, ...patch } = parsed.data;
  const entitlements = await updateEmployeeHubEntitlements(
    supabase,
    employeeProfileId,
    patch
  );

  if (!entitlements) {
    return NextResponse.json({ error: "Couldn't update entitlements." }, { status: 502 });
  }

  return NextResponse.json({ entitlements });
}
