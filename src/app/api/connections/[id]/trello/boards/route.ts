import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getConnectedSourceWithSecrets } from "@/lib/connectors/services/connectedSources";
import {
  listTrelloBoards,
  TrelloApiError,
} from "@/lib/connectors/trello/client";
import { getTrelloCredentials } from "@/lib/connectors/trello/scan";
import {
  sortTrelloBoardsForPicker,
  trelloSelectedBoardId,
} from "@/lib/connectors/trello/selectedBoard";

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

  const source = await getConnectedSourceWithSecrets(supabase, user.id, id);
  if (!source || source.sourceType !== "trello") {
    return NextResponse.json({ error: "Trello connection not found." }, { status: 404 });
  }
  if (source.status === "disconnected" || source.status === "permission_revoked") {
    return NextResponse.json(
      { error: "Reconnect Trello to list boards." },
      { status: 403 }
    );
  }

  const creds = getTrelloCredentials(source);
  if (!creds) {
    return NextResponse.json(
      { error: "Trello credentials are missing. Reconnect with a new token." },
      { status: 400 }
    );
  }

  try {
    const boards = sortTrelloBoardsForPicker(await listTrelloBoards(creds)).map(
      (board) => ({
        id: board.id,
        name: board.name || "Untitled board",
      })
    );
    return NextResponse.json({
      boards,
      selectedBoardId: trelloSelectedBoardId(source.settings),
    });
  } catch (err) {
    if (err instanceof TrelloApiError && (err.status === 401 || err.status === 403)) {
      return NextResponse.json(
        {
          error: "permission_revoked",
          message: "Trello rejected the saved token. Reconnect with a fresh token.",
        },
        { status: 403 }
      );
    }
    const message =
      err instanceof Error ? err.message : "Couldn't list Trello boards.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
