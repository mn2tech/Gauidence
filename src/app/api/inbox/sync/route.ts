import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getConnectedSourceWithSecrets,
  listConnectedSources,
} from "@/lib/connectors/services/connectedSources";
import { syncGmailInbox } from "@/lib/connectors/gmail/sync";
import { GmailApiError } from "@/lib/connectors/gmail/client";
import { listGuardianProfiles } from "@/lib/profiles/server";
import { topLevelProfiles } from "@/lib/profiles/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST() {
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

  try {
    const sources = await listConnectedSources(supabase, user.id);
    const gmail = sources.find(
      (s) => s.sourceType === "gmail" && s.status === "connected"
    );
    if (!gmail) {
      return NextResponse.json(
        { error: "Connect Gmail first.", code: "not_connected" },
        { status: 400 }
      );
    }

    const withSecrets = await getConnectedSourceWithSecrets(
      supabase,
      user.id,
      gmail.id
    );
    if (!withSecrets) {
      return NextResponse.json(
        { error: "Couldn't load Gmail credentials." },
        { status: 403 }
      );
    }

    const profiles = await listGuardianProfiles(supabase, user.id);
    const spaces = topLevelProfiles(profiles).map((p) => ({
      id: p.id,
      display_name: p.display_name,
      profile_type: p.profile_type,
    }));

    const result = await syncGmailInbox({
      supabase,
      userId: user.id,
      source: withSecrets,
      spaces,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error(
      "Gmail sync failed:",
      err instanceof Error ? err.message.slice(0, 300) : err
    );
    const status =
      err instanceof GmailApiError && (err.status === 401 || err.status === 403)
        ? 401
        : 500;
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message.slice(0, 200)
            : "Gmail sync failed.",
        code: status === 401 ? "revoked" : "sync_failed",
      },
      { status }
    );
  }
}
