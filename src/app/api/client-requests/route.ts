import { NextResponse } from "next/server";
import type { User, SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import {
  getActiveGuardianProfile,
  requireAccessibleGuardianProfile,
  requireEditableGuardianProfile,
} from "@/lib/profiles/server";
import { isOrgStyleProfile } from "@/lib/profiles/types";
import { notifyClientRequestActivity } from "@/lib/client-requests/notify";
import { isClientRequestStatus } from "@/lib/client-requests/types";

export const runtime = "nodejs";

type Authed = { supabase: SupabaseClient; user: User };

const REQUEST_SELECT =
  "id, profile_id, created_by, title, description, status, document_id, created_at, updated_at, resolved_at";

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

async function clientVaultIdsForBusiness(
  supabase: SupabaseClient,
  businessProfileId: string
): Promise<string[]> {
  const { data } = await supabase
    .from("guardian_profiles")
    .select("id")
    .eq("parent_profile_id", businessProfileId)
    .eq("profile_type", "client");
  return (data ?? []).map((row) => String(row.id));
}

/** List or create client requests for the active (or specified) vault. */
export async function GET(request: Request) {
  const auth = await requireUser();
  if (!isAuthed(auth)) return auth;
  const { supabase, user } = auth;

  const url = new URL(request.url);
  let profileId = url.searchParams.get("profileId");
  const status = url.searchParams.get("status")?.trim();
  const scope = url.searchParams.get("scope")?.trim();

  let profile = null;
  if (profileId) {
    profile = await requireAccessibleGuardianProfile(
      supabase,
      user.id,
      profileId
    );
    if (!profile) {
      return NextResponse.json({ error: "Profile not found." }, { status: 404 });
    }
  } else {
    profile = await getActiveGuardianProfile(supabase, user);
    if (!profile) {
      return NextResponse.json(
        { error: "Create a vault first." },
        { status: 400 }
      );
    }
    profileId = profile.id;
  }

  let profileIds: string[] = [profileId];
  if (
    scope === "clients" ||
    (isOrgStyleProfile(profile.profile_type) && profile.profile_type !== "client")
  ) {
    const clientIds = await clientVaultIdsForBusiness(supabase, profile.id);
    profileIds = clientIds.length > 0 ? clientIds : [];
  } else if (profile.profile_type !== "client") {
    return NextResponse.json({ requests: [] });
  }

  if (profileIds.length === 0) {
    return NextResponse.json({ requests: [] });
  }

  let query = supabase
    .from("client_requests")
    .select(REQUEST_SELECT)
    .in("profile_id", profileIds)
    .order("updated_at", { ascending: false })
    .limit(100);

  if (status && isClientRequestStatus(status)) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  if (error) {
    console.error("client_requests list failed:", error.message);
    return NextResponse.json(
      { error: "Couldn't load requests." },
      { status: 502 }
    );
  }

  const profileIdsInResults = [
    ...new Set((data ?? []).map((row) => String(row.profile_id))),
  ];
  const profileNames = new Map<string, string>();
  if (profileIdsInResults.length > 0) {
    const { data: profiles } = await supabase
      .from("guardian_profiles")
      .select("id, display_name")
      .in("id", profileIdsInResults);
    for (const row of profiles ?? []) {
      profileNames.set(String(row.id), String(row.display_name ?? "Client"));
    }
  }

  const requests = (data ?? []).map((row) => ({
    ...row,
    profile_name: profileNames.get(String(row.profile_id)) ?? null,
  }));

  return NextResponse.json({ requests });
}

export async function POST(request: Request) {
  const auth = await requireUser();
  if (!isAuthed(auth)) return auth;
  const { supabase, user } = auth;

  let body: {
    profileId?: string;
    title?: string;
    description?: string;
    documentId?: string | null;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const title = body.title?.trim();
  const description = body.description?.trim();
  if (!title || !description) {
    return NextResponse.json(
      { error: "Title and description are required." },
      { status: 400 }
    );
  }

  let profileId = body.profileId?.trim();
  if (!profileId) {
    const active = await getActiveGuardianProfile(supabase, user);
    if (!active) {
      return NextResponse.json(
        { error: "Create a vault first." },
        { status: 400 }
      );
    }
    profileId = active.id;
  }

  const profile = await requireEditableGuardianProfile(
    supabase,
    user.id,
    profileId
  );
  if (!profile) {
    return NextResponse.json({ error: "Profile not found." }, { status: 404 });
  }
  if (profile.profile_type !== "client") {
    return NextResponse.json(
      { error: "Requests can only be created in client vaults." },
      { status: 400 }
    );
  }

  const documentId = body.documentId?.trim() || null;
  if (documentId) {
    const { data: doc } = await supabase
      .from("documents")
      .select("id")
      .eq("id", documentId)
      .eq("profile_id", profileId)
      .maybeSingle();
    if (!doc) {
      return NextResponse.json(
        { error: "Attached document not found in this vault." },
        { status: 400 }
      );
    }
  }

  const { data, error } = await supabase
    .from("client_requests")
    .insert({
      profile_id: profileId,
      created_by: user.id,
      title,
      description,
      document_id: documentId,
    })
    .select(REQUEST_SELECT)
    .single();

  if (error || !data) {
    console.error("client_requests create failed:", error?.message);
    return NextResponse.json(
      { error: "Couldn't create request." },
      { status: 502 }
    );
  }

  void notifyClientRequestActivity(supabase, {
    profileId,
    actorUserId: user.id,
    requestId: String(data.id),
    requestTitle: title,
    preview: description,
    kind: "created",
  });

  return NextResponse.json({ request: data });
}
