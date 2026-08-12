import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  createConnectedSource,
  listConnectedSources,
  updateConnectedSource,
} from "@/lib/connectors/services/connectedSources";
import type { ConnectedSourceType } from "@/lib/connectors/types";

export const runtime = "nodejs";

export async function GET() {
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
    return NextResponse.json({ error: "You need to be signed in." }, { status: 401 });
  }

  try {
    const sources = await listConnectedSources(supabase, user.id);
    return NextResponse.json({ sources });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Couldn't load connections.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
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
    return NextResponse.json({ error: "You need to be signed in." }, { status: 401 });
  }

  let body: {
    sourceType?: string;
    displayName?: string;
    sourceUri?: string;
    settings?: Record<string, unknown>;
    profileId?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const sourceType = body.sourceType as ConnectedSourceType | undefined;
  if (sourceType !== "android_storage") {
    return NextResponse.json(
      { error: "Unsupported source type for create." },
      { status: 400 }
    );
  }
  if (!body.displayName?.trim() || !body.sourceUri?.trim()) {
    return NextResponse.json(
      { error: "displayName and sourceUri are required." },
      { status: 400 }
    );
  }

  try {
    // Reconnect: if a disconnected/revoked android_storage exists, update it.
    const existing = await listConnectedSources(supabase, user.id);
    const prior = existing.find(
      (s) =>
        s.sourceType === "android_storage" &&
        (s.status === "disconnected" ||
          s.status === "permission_revoked" ||
          s.status === "error" ||
          s.status === "connected")
    );

    if (prior) {
      const source = await updateConnectedSource(supabase, user.id, prior.id, {
        displayName: body.displayName.trim(),
        sourceUri: body.sourceUri.trim(),
        status: "connected",
        settings: body.settings ?? {},
      });
      return NextResponse.json({ source, reused: true });
    }

    const source = await createConnectedSource(supabase, {
      userId: user.id,
      profileId: body.profileId ?? null,
      sourceType,
      displayName: body.displayName.trim(),
      sourceUri: body.sourceUri.trim(),
      settings: body.settings ?? {},
    });
    return NextResponse.json({ source, reused: false }, { status: 201 });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Couldn't create connection.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
