import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  canEditEmployeeEntitlements,
  reviewLeaveRequest,
} from "@/lib/employee-hub/server";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  status: z.enum(["approved", "denied", "cancelled"]),
});

export async function PATCH(request: Request, context: RouteContext) {
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

  const { id } = await context.params;

  const { data: existing } = await supabase
    .from("employee_leave_requests")
    .select("id, business_profile_id, status, employee_profile_id")
    .eq("id", id)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: "Leave request not found." }, { status: 404 });
  }

  const row = existing as {
    business_profile_id: string;
    status: string;
    employee_profile_id: string;
  };

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

  const isOwner = await canEditEmployeeEntitlements(
    supabase,
    row.business_profile_id,
    user.id
  );

  if (!isOwner) {
    const { data: member } = await supabase
      .from("guardian_profile_members")
      .select("role")
      .eq("profile_id", row.employee_profile_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!member || parsed.data.status !== "cancelled") {
      return NextResponse.json({ error: "Access denied." }, { status: 403 });
    }
  }

  if (row.status !== "pending" && parsed.data.status !== "cancelled") {
    return NextResponse.json(
      { error: "This request has already been reviewed." },
      { status: 400 }
    );
  }

  if (parsed.data.status === "cancelled") {
    const { error } = await supabase
      .from("employee_leave_requests")
      .update({
        status: "cancelled",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: "Couldn't cancel request." }, { status: 502 });
    }
    return NextResponse.json({ ok: true });
  }

  const updated = await reviewLeaveRequest(
    supabase,
    id,
    user.id,
    parsed.data.status
  );

  if (!updated) {
    return NextResponse.json({ error: "Couldn't update request." }, { status: 502 });
  }

  return NextResponse.json({ request: updated });
}
