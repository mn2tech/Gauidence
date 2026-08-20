import { NextResponse } from "next/server";
import type { User, SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import {
  requireAccessibleGuardianProfile,
  requireEditableGuardianProfile,
} from "@/lib/profiles/server";
import {
  isSpaceKnowledgeKind,
  SPACE_KNOWLEDGE_ITEM_SELECT,
} from "@/lib/space-conversations/types";
import { deriveKnowledgeTitle } from "@/lib/space-conversations/helpers";
import { listSpaceKnowledgeItems } from "@/lib/space-conversations/server";

export const runtime = "nodejs";

type Authed = { supabase: SupabaseClient; user: User };
type RouteCtx = { params: Promise<{ profileId: string }> };

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

/** GET — list durable knowledge items (optionally ?kind=decision). */
export async function GET(req: Request, ctx: RouteCtx) {
  const auth = await requireUser();
  if (!isAuthed(auth)) return auth;
  const { profileId } = await ctx.params;
  const kindParam = new URL(req.url).searchParams.get("kind");

  const profile = await requireAccessibleGuardianProfile(
    auth.supabase,
    auth.user.id,
    profileId
  );
  if (!profile) {
    return NextResponse.json(
      { error: "Space not found or you don't have access." },
      { status: 403 }
    );
  }

  try {
    const items = await listSpaceKnowledgeItems(
      auth.supabase,
      profile.id,
      kindParam ?? undefined
    );
    return NextResponse.json({ items });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** POST — Save as Decision / Task / Note from a conversation message. */
export async function POST(req: Request, ctx: RouteCtx) {
  const auth = await requireUser();
  if (!isAuthed(auth)) return auth;
  const { profileId } = await ctx.params;

  let body: {
    kind?: string;
    messageId?: string;
    title?: string;
    content?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  if (!isSpaceKnowledgeKind(body.kind)) {
    return NextResponse.json(
      { error: "kind must be decision, task, or note." },
      { status: 400 }
    );
  }

  const profile = await requireEditableGuardianProfile(
    auth.supabase,
    auth.user.id,
    profileId
  );
  if (!profile) {
    return NextResponse.json(
      { error: "You need editor access to save knowledge in this Space." },
      { status: 403 }
    );
  }

  try {
    let content =
      typeof body.content === "string" ? body.content.trim() : "";
    let sourceConversationId: string | null = null;
    let sourceMessageId: string | null = null;
    let title =
      typeof body.title === "string" && body.title.trim()
        ? body.title.trim()
        : null;

    const messageId =
      typeof body.messageId === "string" && body.messageId.trim()
        ? body.messageId.trim()
        : null;

    if (messageId) {
      const { data: msg, error } = await auth.supabase
        .from("space_conversation_messages")
        .select("id, profile_id, conversation_id, content")
        .eq("id", messageId)
        .maybeSingle();
      if (error || !msg || String(msg.profile_id) !== profile.id) {
        return NextResponse.json(
          { error: "Message not found in this Space." },
          { status: 404 }
        );
      }
      content = content || String(msg.content ?? "").trim();
      sourceConversationId = String(msg.conversation_id);
      sourceMessageId = String(msg.id);
    }

    if (!content) {
      return NextResponse.json(
        { error: "Content is required." },
        { status: 400 }
      );
    }

    if (!title) title = deriveKnowledgeTitle(content);

    const insert = await auth.supabase
      .from("space_knowledge_items")
      .insert({
        profile_id: profile.id,
        kind: body.kind,
        title,
        content,
        created_by: auth.user.id,
        source_conversation_id: sourceConversationId,
        source_message_id: sourceMessageId,
      })
      .select(SPACE_KNOWLEDGE_ITEM_SELECT)
      .single();

    if (insert.error || !insert.data) {
      return NextResponse.json(
        { error: insert.error?.message ?? "Could not save." },
        { status: 500 }
      );
    }

    return NextResponse.json({ item: insert.data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
