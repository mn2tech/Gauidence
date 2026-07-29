import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthed, requirePayrollUser } from "@/lib/payroll/auth";
import { canSubmitTimeEntry } from "@/lib/payroll/server";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  clockOutAt: z.string().datetime(),
  notes: z.string().max(500).optional(),
});

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requirePayrollUser();
  if (!isAuthed(auth)) return auth;
  const { id } = await context.params;

  const { data: entry, error: fetchError } = await auth.supabase
    .from("payroll_time_entries")
    .select("id, profile_id, employee_profile_id, clock_out_at")
    .eq("id", id)
    .maybeSingle();

  if (fetchError || !entry) {
    return NextResponse.json({ error: "Time entry not found." }, { status: 404 });
  }

  const row = entry as {
    id: string;
    profile_id: string;
    employee_profile_id: string;
    clock_out_at: string | null;
  };
  const allowed = await canSubmitTimeEntry(
    auth.supabase,
    row.profile_id,
    row.employee_profile_id,
    auth.user.id
  );
  if (!allowed) {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }

  if (row.clock_out_at) {
    return NextResponse.json({ error: "This entry is already closed." }, { status: 400 });
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

  const { error } = await auth.supabase
    .from("payroll_time_entries")
    .update({
      clock_out_at: parsed.data.clockOutAt,
      notes: parsed.data.notes ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: "Couldn't clock out." }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
