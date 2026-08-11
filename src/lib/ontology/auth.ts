import "server-only";

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isPlatformAdmin } from "@/lib/admin";
import {
  requireAccessibleGuardianProfile,
  requireEditableGuardianProfile,
} from "@/lib/profiles/server";

export type OntologyAuthed = {
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>;
  user: { id: string; email?: string | null };
};

export async function requireOntologyUser(): Promise<
  OntologyAuthed | NextResponse
> {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "You need to be signed in." }, { status: 401 });
  }

  return { supabase, user };
}

export function isOntologyAuthed(
  value: OntologyAuthed | NextResponse
): value is OntologyAuthed {
  return "supabase" in value;
}

export async function requireOntologyAdmin(): Promise<
  OntologyAuthed | NextResponse
> {
  const auth = await requireOntologyUser();
  if (!isOntologyAuthed(auth)) return auth;
  if (!isPlatformAdmin(auth.user.email)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  return auth;
}

export async function requireOntologySpaceAccess(
  supabase: OntologyAuthed["supabase"],
  userId: string,
  profileId: string
) {
  return requireAccessibleGuardianProfile(supabase, userId, profileId);
}

export async function requireOntologySpaceEdit(
  supabase: OntologyAuthed["supabase"],
  userId: string,
  profileId: string
) {
  return requireEditableGuardianProfile(supabase, userId, profileId);
}
