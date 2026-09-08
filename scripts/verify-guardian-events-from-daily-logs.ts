/**
 * Verify Phase 2 Daily Log → guardian_events backfill.
 * Usage:
 *   npx tsx --require ./scripts/stub-server-only.cjs scripts/verify-guardian-events-from-daily-logs.ts
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

function loadEnvLocal() {
  const envPath = join(ROOT, ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const sb = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  const { count: logCount, error: logErr } = await sb
    .from("daily_logs")
    .select("id", { count: "exact", head: true });
  if (logErr) throw new Error(logErr.message);

  const { count: eventCount, error: eventErr } = await sb
    .from("guardian_events")
    .select("id", { count: "exact", head: true })
    .eq("source_type", "daily_log");
  if (eventErr) throw new Error(eventErr.message);

  const { data: sample, error: sampleErr } = await sb
    .from("guardian_events")
    .select(
      "id, event_type, title, source_type, source_id, space_id, dedupe_key, metadata, user_id"
    )
    .eq("source_type", "daily_log")
    .order("created_at", { ascending: false })
    .limit(8);
  if (sampleErr) throw new Error(sampleErr.message);

  const sourceIds = [
    ...new Set((sample ?? []).map((e) => e.source_id).filter(Boolean)),
  ] as string[];

  const { data: logs, error: logsErr } = await sb
    .from("daily_logs")
    .select("id, log_date, title, content, profile_id, owner_user_id")
    .in("id", sourceIds.length ? sourceIds : ["00000000-0000-0000-0000-000000000000"]);
  if (logsErr) throw new Error(logsErr.message);

  const logMap = new Map((logs ?? []).map((l) => [l.id, l]));
  const missing = sourceIds.filter((id) => !logMap.has(id));

  // Duplicate check for sample source ids
  const { data: allForSources } = await sb
    .from("guardian_events")
    .select("source_id, dedupe_key")
    .eq("source_type", "daily_log")
    .in("source_id", sourceIds.length ? sourceIds : ["00000000-0000-0000-0000-000000000000"]);

  const keys = (allForSources ?? []).map(
    (r) => `${r.source_id}::${r.dedupe_key}`
  );
  const uniqueKeys = new Set(keys);

  console.log(
    JSON.stringify(
      {
        daily_logs_total: logCount,
        guardian_events_from_daily_log: eventCount,
        sample_provenance_ok: missing.length === 0,
        missing_source_ids: missing,
        sample_dedupe_ok: keys.length === uniqueKeys.size,
        sample: (sample ?? []).map((e) => {
          const log = logMap.get(e.source_id);
          return {
            event_type: e.event_type,
            title: String(e.title ?? "").slice(0, 70),
            source_type: e.source_type,
            source_id: e.source_id,
            log_date: (e.metadata as { log_date?: string } | null)?.log_date,
            log_still_exists: Boolean(log),
            space_matches_log_profile:
              log != null && log.profile_id === e.space_id,
          };
        }),
      },
      null,
      2
    )
  );

  if (missing.length || keys.length !== uniqueKeys.size) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
