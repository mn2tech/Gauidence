import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  listGuardianProfiles,
  requireAccessibleGuardianProfile,
} from "@/lib/profiles/server";
import { mapInboxRowToMessage, type InboxMessageRow } from "@/lib/inbox/mapDb";
import { topLevelProfiles } from "@/lib/profiles/types";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** File an inbox message into a Guardian Space. */
export async function PATCH(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase is not configured." },
      { status: 503 }
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    spaceId?: string;
  };
  const spaceId = String(body.spaceId ?? "").trim();
  if (!spaceId) {
    return NextResponse.json(
      { error: "Choose a Space to file into." },
      { status: 400 }
    );
  }

  const profile = await requireAccessibleGuardianProfile(
    supabase,
    user.id,
    spaceId
  );
  if (!profile) {
    return NextResponse.json(
      { error: "That Space isn't available." },
      { status: 403 }
    );
  }

  const { data: existing, error: loadError } = await supabase
    .from("inbox_messages")
    .select(
      "id, from_name, from_email, subject, preview, received_at, needs_attention, bucket, assigned_space_id, suggested_space_id, label_ids"
    )
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (loadError) {
    console.error("inbox file load failed:", loadError.message);
    return NextResponse.json(
      { error: "Couldn't load that message." },
      { status: 500 }
    );
  }
  if (!existing) {
    return NextResponse.json({ error: "Message not found." }, { status: 404 });
  }

  const { data: updated, error: updateError } = await supabase
    .from("inbox_messages")
    .update({
      assigned_space_id: spaceId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", user.id)
    .select(
      "id, from_name, from_email, subject, preview, received_at, needs_attention, bucket, assigned_space_id, suggested_space_id, label_ids"
    )
    .single();

  if (updateError || !updated) {
    console.error("inbox file update failed:", updateError?.message);
    return NextResponse.json(
      { error: "Couldn't file that message." },
      { status: 500 }
    );
  }

  const profiles = await listGuardianProfiles(supabase, user.id);
  const spaces = topLevelProfiles(profiles);
  const spaceNames = new Map(spaces.map((s) => [s.id, s.display_name]));
  const message = mapInboxRowToMessage(updated as InboxMessageRow, spaceNames);

  return NextResponse.json({
    ok: true,
    message,
    spaceName: profile.display_name,
  });
}
