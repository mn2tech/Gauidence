import { NextResponse } from "next/server";
import type { User, SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { decryptSsn } from "@/lib/intake/encryption";
import { formatSsnDisplay } from "@/lib/intake/ssn";
import { logIntakeAccess } from "@/lib/intake/external";
import { getIntakeSubmissionSsn } from "@/lib/intake/server";
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

/** Authorized business editors can reveal full SSN for clearance checks. */
export async function GET(_request: Request, context: RouteContext) {
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

  if (requestRow.status !== "submitted") {
    return NextResponse.json(
      { error: "SSN is only available after submission." },
      { status: 400 }
    );
  }

  const ssnRow = await getIntakeSubmissionSsn(auth.supabase, id);
  if (!ssnRow) {
    return NextResponse.json(
      { error: "No typed SSN was submitted for this request." },
      { status: 404 }
    );
  }

  try {
    const digits = decryptSsn(ssnRow.ssnEncrypted);
    const admin = createAdminClient();
    if (admin) {
      await logIntakeAccess(admin, {
        requestId: id,
        action: "ssn_revealed",
        recipientEmail: requestRow.recipient_email,
        actorUserId: auth.user.id,
      });
    }

    return NextResponse.json({
      ssn: formatSsnDisplay(digits),
      lastFour: ssnRow.ssnLastFour,
    });
  } catch {
    return NextResponse.json(
      { error: "Couldn't decrypt SSN. Contact support." },
      { status: 500 }
    );
  }
}
