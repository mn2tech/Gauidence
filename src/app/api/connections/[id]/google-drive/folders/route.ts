import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getConnectedSourceWithSecrets } from "@/lib/connectors/services/connectedSources";
import { googleDriveAccessTokenForSource } from "@/lib/connectors/googleDrive/access";
import {
  GoogleDriveApiError,
  listChildFolders,
  listSharedDrives,
} from "@/lib/connectors/googleDrive/client";
import {
  googleDriveSelectedDriveId,
  googleDriveSelectedFolderId,
} from "@/lib/connectors/googleDrive/selectedFolder";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
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

  const source = await getConnectedSourceWithSecrets(supabase, user.id, id);
  if (!source || source.sourceType !== "google_drive") {
    return NextResponse.json(
      { error: "Google Drive connection not found." },
      { status: 404 }
    );
  }
  if (source.status === "disconnected" || source.status === "permission_revoked") {
    return NextResponse.json(
      { error: "Reconnect Google Drive to list folders." },
      { status: 403 }
    );
  }

  const url = new URL(req.url);
  const parentId = url.searchParams.get("parentId")?.trim() || "root";
  const driveIdParam = url.searchParams.get("driveId")?.trim() || "";

  try {
    const accessToken = await googleDriveAccessTokenForSource(
      supabase,
      user.id,
      source
    );
    const sharedDrives = await listSharedDrives(accessToken);
    const locations = [
      { id: "root", name: "My Drive", kind: "my_drive" as const, driveId: null },
      ...sharedDrives.map((drive) => ({
        id: drive.id,
        name: drive.name,
        kind: "shared_drive" as const,
        driveId: drive.id,
      })),
    ];

    const parentIsSharedDrive = sharedDrives.some((d) => d.id === parentId);
    const driveId = parentIsSharedDrive
      ? parentId
      : driveIdParam || googleDriveSelectedDriveId(source.settings) || null;
    const folderParentId = parentId || "root";

    const folders = await listChildFolders(
      accessToken,
      folderParentId,
      parentIsSharedDrive || driveIdParam ? driveId : null
    );

    return NextResponse.json({
      locations,
      folders,
      parentId: folderParentId,
      selectedFolderId: googleDriveSelectedFolderId(source.settings),
      selectedDriveId: googleDriveSelectedDriveId(source.settings),
      email: String(source.settings.email ?? ""),
    });
  } catch (err) {
    if (err instanceof GoogleDriveApiError && (err.status === 401 || err.status === 403)) {
      await supabase
        .from("connected_sources")
        .update({ status: "permission_revoked" })
        .eq("id", id)
        .eq("user_id", user.id);
      return NextResponse.json(
        {
          error: "permission_revoked",
          message: "Google Drive access was revoked. Reconnect to continue.",
        },
        { status: 403 }
      );
    }
    const message =
      err instanceof Error ? err.message : "Couldn't list Google Drive folders.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
