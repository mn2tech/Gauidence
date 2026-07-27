import { NextResponse } from "next/server";
import type { User, SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { requireEditableGuardianProfile } from "@/lib/profiles/server";
import { notifyVaultActivity } from "@/lib/vault/notifyActivity";

export const runtime = "nodejs";

type Authed = { supabase: SupabaseClient; user: User };

async function requireUser(): Promise<Authed | NextResponse> {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Sign-in isn't configured on this deployment." },
      { status: 503 }
    );
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "You need to be signed in." },
      { status: 401 }
    );
  }
  return { supabase, user };
}

function isAuthed(v: Authed | NextResponse): v is Authed {
  return !(v instanceof NextResponse);
}

/** Notify other members of a shared vault about a new document or Daily Log. */
export async function POST(request: Request) {
  const auth = await requireUser();
  if (!isAuthed(auth)) return auth;
  const { supabase, user } = auth;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const profileId =
    typeof body.profileId === "string" ? body.profileId.trim() : "";
  const kind = body.kind === "document" || body.kind === "daily_log" ? body.kind : null;
  const documentId =
    typeof body.documentId === "string" ? body.documentId.trim() : undefined;
  const logId = typeof body.logId === "string" ? body.logId.trim() : undefined;

  if (!profileId || !kind) {
    return NextResponse.json(
      { error: "profileId and kind are required." },
      { status: 400 }
    );
  }

  const editable = await requireEditableGuardianProfile(
    supabase,
    user.id,
    profileId
  );
  if (!editable) {
    return NextResponse.json({ error: "Vault not found." }, { status: 404 });
  }

  if (kind === "document" && !documentId) {
    return NextResponse.json(
      { error: "documentId is required for document activity." },
      { status: 400 }
    );
  }
  if (kind === "daily_log" && !logId) {
    return NextResponse.json(
      { error: "logId is required for daily_log activity." },
      { status: 400 }
    );
  }

  void notifyVaultActivity(supabase, {
    profileId,
    actorUserId: user.id,
    kind,
    documentId,
    logId,
  }).catch((err) => {
    console.error("Vault activity notify failed:", err);
  });

  return NextResponse.json({ ok: true });
}
