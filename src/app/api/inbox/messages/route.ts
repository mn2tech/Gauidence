import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listConnectedSources } from "@/lib/connectors/services/connectedSources";
import { listGuardianProfiles } from "@/lib/profiles/server";
import { topLevelProfiles } from "@/lib/profiles/types";
import {
  mapInboxRowToMessage,
  type InboxMessageRow,
} from "@/lib/inbox/mapDb";
import type { InboxFilterId } from "@/lib/inbox/mockMail";
import { filterMappedInbox } from "@/lib/inbox/mapDb";

export const runtime = "nodejs";

export async function GET(request: Request) {
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

  const filter = (new URL(request.url).searchParams.get("filter") ||
    "all") as InboxFilterId;

  const sources = await listConnectedSources(supabase, user.id);
  const gmail = sources.find(
    (s) => s.sourceType === "gmail" && s.status === "connected"
  );

  const profiles = await listGuardianProfiles(supabase, user.id);
  const spaces = topLevelProfiles(profiles);
  const spaceNames = new Map(spaces.map((s) => [s.id, s.display_name]));

  if (!gmail) {
    return NextResponse.json({
      connected: false,
      email: null as string | null,
      lastSyncAt: null as string | null,
      messages: [],
      sourceId: null as string | null,
    });
  }

  const { data, error } = await supabase
    .from("inbox_messages")
    .select(
      "id, from_name, from_email, subject, preview, received_at, needs_attention, bucket, assigned_space_id, suggested_space_id, label_ids"
    )
    .eq("user_id", user.id)
    .eq("source_id", gmail.id)
    .order("received_at", { ascending: false, nullsFirst: false })
    .limit(100);

  if (error) {
    console.error("inbox messages list failed:", error.message);
    return NextResponse.json(
      { error: "Couldn't load inbox messages." },
      { status: 500 }
    );
  }

  const mapped = ((data ?? []) as InboxMessageRow[]).map((row) =>
    mapInboxRowToMessage(row, spaceNames)
  );
  const messages = filterMappedInbox(mapped, filter);

  return NextResponse.json({
    connected: true,
    email: String(gmail.settings.email ?? "") || gmail.displayName,
    lastSyncAt: gmail.lastScanAt,
    sourceId: gmail.id,
    messages,
  });
}
