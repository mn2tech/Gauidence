import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { extractPersonalKnowledgeFromText } from "@/lib/personal-space/conversationExtract";
import { persistConversationKnowledge } from "@/lib/personal-space/persistConversation";

export const runtime = "nodejs";

/**
 * Extract (and optionally persist) personal knowledge from a conversational utterance.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = (await request.json()) as {
    text?: string;
    profileId?: string;
    persist?: boolean;
  };

  const text = body.text?.trim() ?? "";
  if (!text) {
    return NextResponse.json({ error: "text required." }, { status: 400 });
  }

  const extraction = extractPersonalKnowledgeFromText(text);

  let persisted = { entities: 0, relationships: 0, facts: 0 };
  if (body.persist && body.profileId) {
    const result = await persistConversationKnowledge(supabase, {
      userId: user.id,
      profileId: body.profileId,
      text,
    });
    persisted = {
      entities: result.entities,
      relationships: result.relationships,
      facts: result.facts,
    };
  }

  return NextResponse.json({
    extraction,
    rememberReply: extraction.rememberReply,
    confirmations: extraction.confirmations,
    persisted,
  });
}
