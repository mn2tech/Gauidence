import { NextResponse } from "next/server";
import type { User, SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { logIntakeAccess } from "@/lib/intake/external";
import { revokeIntakeRequest } from "@/lib/intake/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type Authed = { supabase: SupabaseClient; user: User };

type RouteContext = { params: Promise<{ id: string }> };

async function requireUser(): Promise<Authed | NextResponse> {
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
  return { supabase, user };
}

function isAuthed(v: Authed | NextResponse): v is Authed {
  return !(v instanceof NextResponse);
}

export async function POST(_request: Request, context: RouteContext) {
  const auth = await requireUser();
  if (!isAuthed(auth)) return auth;

  const { id } = await context.params;

  const { data: row } = await auth.supabase
    .from("contractor_intake_requests")
    .select("id, profile_id, recipient_email, status")
    .eq("id", id)
    .maybeSingle();

  if (!row) {
    return NextResponse.json({ error: "Request not found." }, { status: 404 });
  }

  const requestRow = row as {
    id: string;
    profile_id: string;
    recipient_email: string;
    status: string;
  };

  if (requestRow.status === "submitted") {
    return NextResponse.json(
      { error: "Can't revoke — information was already submitted." },
      { status: 400 }
    );
  }

  const ok = await revokeIntakeRequest(auth.supabase, id);
  if (!ok) {
    return NextResponse.json({ error: "Couldn't revoke link." }, { status: 502 });
  }

  const admin = createAdminClient();
  if (admin) {
    await logIntakeAccess(admin, {
      requestId: id,
      action: "revoked",
      recipientEmail: requestRow.recipient_email,
      actorUserId: auth.user.id,
    });
  }

  return NextResponse.json({ ok: true });
}
