import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  canEditEmployeeEntitlements,
  listBusinessLeaveRequests,
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

  const url = new URL(request.url);
  const businessProfileId = url.searchParams.get("businessProfileId");
  if (!businessProfileId) {
    return NextResponse.json(
      { error: "businessProfileId is required." },
      { status: 400 }
    );
  }

  const canEdit = await canEditEmployeeEntitlements(
    supabase,
    businessProfileId,
    user.id
  );
  if (!canEdit) {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }

  const status = url.searchParams.get("status");
  const requests = await listBusinessLeaveRequests(
    supabase,
    businessProfileId,
    status === "pending" ||
      status === "approved" ||
      status === "denied" ||
      status === "cancelled"
      ? status
      : undefined
  );

  return NextResponse.json({ requests });
}
