import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  disconnectConnectedSource,
  getConnectedSource,
  getConnectedSourceWithSecrets,
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
    trelloBoardId?: string | null;
    trelloBoardName?: string | null;
    googleDriveFolderId?: string | null;
    googleDriveFolderName?: string | null;
    googleDriveDriveId?: string | null;
    googleDriveFolderKind?: string | null;
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

    let settings = body.settings;
    if (body.trelloBoardId !== undefined) {
      if (existing.sourceType !== "trello") {
        return NextResponse.json(
          { error: "Only Trello connections can save a board." },
          { status: 400 }
        );
      }
      const withSecrets = await getConnectedSourceWithSecrets(
        supabase,
        user.id,
        id
      );
      const boardId = String(body.trelloBoardId ?? "").trim();
      settings = {
        ...(withSecrets?.settings ?? existing.settings),
        boardId: boardId || null,
        boardName: String(body.trelloBoardName ?? "").trim() || null,
      };
    }
    if (body.googleDriveFolderId !== undefined) {
      if (existing.sourceType !== "google_drive") {
        return NextResponse.json(
          { error: "Only Google Drive connections can save a folder." },
          { status: 400 }
        );
      }
      const withSecrets = await getConnectedSourceWithSecrets(
        supabase,
        user.id,
        id
      );
      const folderId = String(body.googleDriveFolderId ?? "").trim() || "root";
      const kindRaw = String(body.googleDriveFolderKind ?? "").trim();
      const folderKind =
        kindRaw === "shared_drive" || kindRaw === "folder" || kindRaw === "my_drive"
          ? kindRaw
          : folderId === "root"
            ? "my_drive"
            : "folder";
      settings = {
        ...(withSecrets?.settings ?? existing.settings),
        folderId,
        folderName:
          String(body.googleDriveFolderName ?? "").trim() ||
          (folderId === "root" ? "My Drive" : null),
        driveId: String(body.googleDriveDriveId ?? "").trim() || null,
        folderKind,
      };
    }

    const source = await updateConnectedSource(supabase, user.id, id, {
      status: body.status,
      displayName: body.displayName,
      settings,
      lastScanAt: body.lastScanAt,
      profileId: body.profileId,
    });
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
    if (existing.sourceType === "google_drive") {
      const source = await updateConnectedSource(supabase, user.id, id, {
        status: "disconnected",
        settings: {
          email: existing.settings.email ?? null,
          accountName: existing.settings.accountName ?? null,
          folderId: existing.settings.folderId ?? null,
          folderName: existing.settings.folderName ?? null,
          driveId: existing.settings.driveId ?? null,
          folderKind: existing.settings.folderKind ?? null,
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
