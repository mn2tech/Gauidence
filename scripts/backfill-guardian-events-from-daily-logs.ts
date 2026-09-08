/**
 * Backfill guardian_events from existing daily_logs (non-destructive, idempotent).
 *
 * Does NOT modify or delete daily_logs.
 * Safe to re-run — duplicate (user_id, source_type, source_id, dedupe_key) is skipped.
 *
 * Usage:
 *   npx tsx --require ./scripts/stub-server-only.cjs scripts/backfill-guardian-events-from-daily-logs.ts
 *   npx tsx --require ./scripts/stub-server-only.cjs scripts/backfill-guardian-events-from-daily-logs.ts --limit=50
 *   npx tsx --require ./scripts/stub-server-only.cjs scripts/backfill-guardian-events-from-daily-logs.ts --user=<uuid>
 *   npx tsx --require ./scripts/stub-server-only.cjs scripts/backfill-guardian-events-from-daily-logs.ts --space=<uuid>
 *   npx tsx --require ./scripts/stub-server-only.cjs scripts/backfill-guardian-events-from-daily-logs.ts --dry-run
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { backfillGuardianEventsFromDailyLogs } from "../src/lib/guardian-events/syncFromDailyLog.ts";
import { deriveGuardianEventsFromDailyLog } from "../src/lib/guardian-events/fromDailyLog.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const PAGE_SIZE = 100;

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
    if (!(key in process.env) || !process.env[key]) process.env[key] = val;
  }
}

function argValue(prefix: string): string | null {
  const arg = process.argv.find((a) => a.startsWith(prefix));
  if (!arg) return null;
  return arg.slice(prefix.length) || null;
}

function parseLimit(): number | null {
  const raw = argValue("--limit=");
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function main() {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local"
    );
    process.exit(1);
  }

  const userId = argValue("--user=");
  const spaceId = argValue("--space=");
  const maxRows = parseLimit();
  const dryRun = process.argv.includes("--dry-run");

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(
    JSON.stringify({
      event: "guardian_events_daily_log_backfill_start",
      userId: userId ?? null,
      spaceId: spaceId ?? null,
      maxRows,
      dryRun,
    })
  );

  if (dryRun) {
    let offset = 0;
    let scanned = 0;
    let wouldCreate = 0;
    while (true) {
      if (maxRows != null && scanned >= maxRows) break;
      const pageLimit =
        maxRows == null
          ? PAGE_SIZE
          : Math.min(PAGE_SIZE, maxRows - scanned);
      let query = supabase
        .from("daily_logs")
        .select("id, owner_user_id, profile_id, log_date, title, content")
        .order("created_at", { ascending: true })
        .range(offset, offset + pageLimit - 1);
      if (userId) query = query.eq("owner_user_id", userId);
      if (spaceId) query = query.eq("profile_id", spaceId);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      const rows = data ?? [];
      if (!rows.length) break;
      for (const log of rows) {
        const derived = deriveGuardianEventsFromDailyLog({
          userId: String(log.owner_user_id),
          log: {
            id: String(log.id),
            profile_id: String(log.profile_id),
            title: log.title,
            content: String(log.content ?? ""),
            log_date: String(log.log_date),
          },
          createdBy: "backfill",
        });
        wouldCreate += derived.length;
      }
      scanned += rows.length;
      offset += rows.length;
      if (rows.length < pageLimit) break;
    }
    console.log(
      JSON.stringify({
        event: "guardian_events_daily_log_backfill_dry_run",
        scanned,
        derivedEventInputs: wouldCreate,
        dailyLogsUnchanged: true,
      })
    );
    return;
  }

  let offset = 0;
  let totalScanned = 0;
  let totalCreated = 0;
  let totalSkipped = 0;
  let totalUpdated = 0;
  let totalErrors = 0;

  while (true) {
    if (maxRows != null && totalScanned >= maxRows) break;
    const pageLimit =
      maxRows == null ? PAGE_SIZE : Math.min(PAGE_SIZE, maxRows - totalScanned);

    const page = await backfillGuardianEventsFromDailyLogs(supabase, {
      userId: userId ?? undefined,
      spaceId: spaceId ?? undefined,
      limit: pageLimit,
      offset,
      createdBy: "backfill",
    });

    totalScanned += page.scanned;
    totalCreated += page.created;
    totalSkipped += page.skipped;
    totalUpdated += page.updated;
    totalErrors += page.errors;

    console.log(
      JSON.stringify({
        event: "guardian_events_daily_log_backfill_page",
        offset,
        ...page,
      })
    );

    if (page.scanned < pageLimit) break;
    offset += page.scanned;
  }

  console.log(
    JSON.stringify({
      event: "guardian_events_daily_log_backfill_done",
      scanned: totalScanned,
      created: totalCreated,
      skipped: totalSkipped,
      updated: totalUpdated,
      errors: totalErrors,
      dailyLogsUnchanged: true,
    })
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
