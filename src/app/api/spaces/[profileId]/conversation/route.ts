import { NextResponse } from "next/server";
import type { User, SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { requireAccessibleGuardianProfile } from "@/lib/profiles/server";
import { SPACE_CONVERSATION_MESSAGE_SELECT } from "@/lib/space-conversations/types";
import {
  getOrCreateSpaceConversation,
  listSpaceConversationMessages,
} from "@/lib/space-conversations/server";
import {
  extractGideonQuestion,
  mentionsGideon,
} from "@/lib/space-conversations/helpers";
import { answerSpaceConversationGideon } from "@/lib/space-conversations/gideonAnswer";

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

/** GET — load (or create) the Space Conversation + messages. */
export async function GET(_req: Request, ctx: RouteCtx) {
  const auth = await requireUser();
  if (!isAuthed(auth)) return auth;
  const { profileId } = await ctx.params;

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
    const conversation = await getOrCreateSpaceConversation(
      auth.supabase,
      profile.id
    );
    const messages = await listSpaceConversationMessages(
      auth.supabase,
      conversation.id
    );
    return NextResponse.json({ conversation, messages });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** POST — send a human message; if @Gideon, also generate and save a reply. */
export async function POST(req: Request, ctx: RouteCtx) {
  const auth = await requireUser();
  if (!isAuthed(auth)) return auth;
  const { profileId } = await ctx.params;

  let body: {
    content?: string;
    attachedDocumentId?: string | null;
    timeZone?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (!content) {
    return NextResponse.json({ error: "Message is required." }, { status: 400 });
  }
  if (content.length > 12000) {
    return NextResponse.json({ error: "Message is too long." }, { status: 400 });
  }

  const attachedDocumentId =
    typeof body.attachedDocumentId === "string" && body.attachedDocumentId.trim()
      ? body.attachedDocumentId.trim()
      : null;

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
    const conversation = await getOrCreateSpaceConversation(
      auth.supabase,
      profile.id
    );

    if (attachedDocumentId) {
      const { data: doc } = await auth.supabase
        .from("documents")
        .select("id, profile_id")
        .eq("id", attachedDocumentId)
        .maybeSingle();
      if (!doc || String(doc.profile_id) !== profile.id) {
        return NextResponse.json(
          { error: "Attachment must be a document in this Space." },
          { status: 400 }
        );
      }
    }

    const invokesGideon = mentionsGideon(content);
    const userInsert = await auth.supabase
      .from("space_conversation_messages")
      .insert({
        conversation_id: conversation.id,
        profile_id: profile.id,
        sender_user_id: auth.user.id,
        sender_type: "user",
        content,
        attached_document_id: attachedDocumentId,
        metadata: invokesGideon
          ? {
              invokes_gideon: true,
              gideon_question: extractGideonQuestion(content),
            }
          : {},
      })
      .select(SPACE_CONVERSATION_MESSAGE_SELECT)
      .single();

    if (userInsert.error || !userInsert.data) {
      return NextResponse.json(
        { error: userInsert.error?.message ?? "Could not send message." },
        { status: 500 }
      );
    }

    let messages = await listSpaceConversationMessages(
      auth.supabase,
      conversation.id
    );
    const userMessage =
      messages.find((m) => m.id === userInsert.data.id) ??
      messages[messages.length - 1];

    if (!invokesGideon) {
      return NextResponse.json({
        conversation,
        userMessage,
        gideonMessage: null,
        messages,
      });
    }

    const history = messages
      .filter((m) => m.id !== userInsert.data.id)
      .slice(-16)
      .map((m) => ({
        role: (m.sender_type === "gideon" ? "assistant" : "user") as
          | "user"
          | "assistant",
        content: m.content,
      }));

    const gideon = await answerSpaceConversationGideon({
      supabase: auth.supabase,
      user: auth.user,
      profile,
      rawContent: content,
      history,
      timeZone:
        typeof body.timeZone === "string" && body.timeZone.trim()
          ? body.timeZone.trim()
          : undefined,
    });

    const gideonInsert = await auth.supabase
      .from("space_conversation_messages")
      .insert({
        conversation_id: conversation.id,
        profile_id: profile.id,
        sender_user_id: null,
        sender_type: "gideon",
        content: gideon.answer,
        citations: gideon.citations,
        suggested_questions: gideon.suggestedQuestions,
        metadata: { in_reply_to: userInsert.data.id },
      })
      .select(SPACE_CONVERSATION_MESSAGE_SELECT)
      .single();

    if (gideonInsert.error || !gideonInsert.data) {
      return NextResponse.json({
        conversation,
        userMessage,
        gideonMessage: null,
        messages,
        warning: "Message sent, but Gideon could not be saved.",
      });
    }

    messages = await listSpaceConversationMessages(
      auth.supabase,
      conversation.id
    );
    const gideonMessage =
      messages.find((m) => m.id === gideonInsert.data.id) ?? null;

    return NextResponse.json({
      conversation,
      userMessage,
      gideonMessage,
      messages,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to send.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
