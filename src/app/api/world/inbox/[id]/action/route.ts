import { NextResponse } from "next/server";
import { applyInboxCorrection } from "@/lib/world/inbox";
import { isWorldAuthed, requireWorldUser } from "@/lib/world/routeAuth";

export const runtime = "nodejs";

const ACTIONS = new Set([
  "confirm",
  "edit",
  "merge",
  "reject",
  "ignore",
]);

/** Apply a World Inbox decision (Confirm / Edit / Merge / Reject / Ignore). */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireWorldUser();
  if (!isWorldAuthed(auth)) return auth;

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  let body: {
    action?: string;
    mergeIntoEntityId?: string;
    editedName?: string;
    editedAliases?: string[];
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const action = body.action;
  if (!action || !ACTIONS.has(action)) {
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }

  try {
    const result = await applyInboxCorrection(auth.supabase, {
      userId: auth.user.id,
      inboxItemId: id,
      action: action as
        | "confirm"
        | "edit"
        | "merge"
        | "reject"
        | "ignore",
      mergeIntoEntityId: body.mergeIntoEntityId,
      editedName: body.editedName,
      editedAliases: body.editedAliases,
    });
    return NextResponse.json(result);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Couldn't apply that action.";
    const status = /not found/i.test(message) ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
