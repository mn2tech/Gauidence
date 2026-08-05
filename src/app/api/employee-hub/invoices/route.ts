import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  canAccessEmployeeInvoices,
  listEmployeeInvoices,
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
    .select("parent_profile_id, profile_type")
    .eq("id", employeeProfileId)
    .maybeSingle();

  const row = profile as {
    parent_profile_id: string | null;
    profile_type: string;
  } | null;
  if (!row || row.profile_type !== "employee" || !row.parent_profile_id) {
    return NextResponse.json({ error: "Employee not found." }, { status: 404 });
  }

  const allowed = await canAccessEmployeeInvoices(
    supabase,
    employeeProfileId,
    user.id
  );
  if (!allowed) {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }

  const invoices = await listEmployeeInvoices(supabase, employeeProfileId);
  return NextResponse.json({ invoices });
}
