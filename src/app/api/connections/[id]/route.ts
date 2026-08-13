import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  disconnectConnectedSource,
  getConnectedSource,
  updateConnectedSource,
} from "@/lib/connectors/services/connectedSources";
import type { ConnectedSourceStatus } from "@/lib/connectors/types";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
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
    const source = await getConnectedSource(supabase, user.id, id);
    if (!source) {
      return NextResponse.json({ error: "Connection not found." }, { status: 404 });
    }
    return NextResponse.json({ source });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Couldn't load connection.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
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
    status?: ConnectedSourceStatus;
    displayName?: string;
    settings?: Record<string, unknown>;
    lastScanAt?: string | null;
    profileId?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    const existing = await getConnectedSource(supabase, user.id, id);
    if (!existing) {
      return NextResponse.json({ error: "Connection not found." }, { status: 404 });
    }
    const source = await updateConnectedSource(supabase, user.id, id, body);
    return NextResponse.json({ source });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Couldn't update connection.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
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
    const existing = await getConnectedSource(supabase, user.id, id);
    if (!existing) {
      return NextResponse.json({ error: "Connection not found." }, { status: 404 });
    }
    if (existing.sourceType === "trello") {
      const source = await updateConnectedSource(supabase, user.id, id, {
        status: "disconnected",
        settings: {
          username: existing.settings.username ?? null,
          fullName: existing.settings.fullName ?? null,
          memberId: existing.settings.memberId ?? null,
        },
      });
      return NextResponse.json({ source });
    }
    const source = await disconnectConnectedSource(supabase, user.id, id);
    return NextResponse.json({ source });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Couldn't disconnect.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
