/**
 * Backfill ontology for every indexed document across all Guardian spaces.
 *
 * Local machines cannot use ANTHROPIC_API_KEY (Vercel sensitive env), so this
 * enqueues extract_ontology jobs and drains them via the production cron worker.
 *
 * Usage:
 *   npx tsx --require ./scripts/stub-server-only.cjs scripts/backfill-ontology-all-spaces.ts
 *   npx tsx --require ./scripts/stub-server-only.cjs scripts/backfill-ontology-all-spaces.ts --enqueue-only
 *   npx tsx --require ./scripts/stub-server-only.cjs scripts/backfill-ontology-all-spaces.ts --drain-only
 *   npx tsx --require ./scripts/stub-server-only.cjs scripts/backfill-ontology-all-spaces.ts --limit=20
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const PIPELINE_VERSION = "v1";
const APP_URL = "https://guardian.nm2tech.com";

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

function parseLimit(): number | null {
  const arg = process.argv.find((a) => a.startsWith("--limit="));
  if (!arg) return null;
  const n = Number.parseInt(arg.slice("--limit=".length), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function countOntologyJobs(
  supabase: SupabaseClient,
  statuses: string[]
): Promise<number> {
  const { count, error } = await supabase
    .from("document_processing_jobs")
    .select("id", { count: "exact", head: true })
    .eq("job_type", "extract_ontology")
    .in("status", statuses);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function countDocsByOntology(
  supabase: SupabaseClient
): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from("documents")
    .select("ontology_status")
    .eq("indexing_status", "completed");
  if (error) throw new Error(error.message);
  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    const status = row.ontology_status || "pending";
    counts[status] = (counts[status] ?? 0) + 1;
  }
  return counts;
}

async function enqueuePending(supabase: SupabaseClient, limit: number | null) {
  const { data: docs, error } = await supabase
    .from("documents")
    .select("id, file_name, user_id, profile_id, ontology_status")
    .eq("indexing_status", "completed")
    .in("ontology_status", ["pending", "failed", "retryable"])
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);

  const selected = limit ? (docs ?? []).slice(0, limit) : (docs ?? []);
  console.log(`Enqueueing ${selected.length} extract_ontology job(s)…`);

  let enqueued = 0;
  let failed = 0;
  for (const doc of selected) {
    const { error: upsertError } = await supabase
      .from("document_processing_jobs")
      .upsert(
        {
          document_id: doc.id,
          profile_id: doc.profile_id,
          user_id: doc.user_id,
          job_type: "extract_ontology",
          pipeline_version: PIPELINE_VERSION,
          status: "pending",
          attempts: 0,
          last_error: null,
          error_category: null,
          next_retry_at: null,
          processing_started_at: null,
          processing_completed_at: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "document_id,job_type,pipeline_version" }
      );
    if (upsertError) {
      failed += 1;
      console.log(
        `  fail ${doc.file_name ?? doc.id.slice(0, 8)}: ${upsertError.message}`
      );
      continue;
    }
    enqueued += 1;
  }
  console.log(`Enqueued ${enqueued}, failed ${failed}`);
  return { enqueued, failed };
}

async function drainViaCron(supabase: SupabaseClient, cronSecret: string) {
  let rounds = 0;
  let idleRounds = 0;
  const started = Date.now();

  while (idleRounds < 3) {
    const pending = await countOntologyJobs(supabase, [
      "pending",
      "retryable",
      "processing",
    ]);
    const docs = await countDocsByOntology(supabase);
    console.log(
      `\nDrain round ${rounds + 1}: ontology jobs still active=${pending}  docs=${JSON.stringify(docs)}`
    );
    if (pending === 0) {
      console.log("No remaining extract_ontology jobs.");
      break;
    }

    const res = await fetch(`${APP_URL}/api/cron/document-processing`, {
      headers: { Authorization: `Bearer ${cronSecret}` },
    });
    const text = await res.text();
    let body: { processed?: number; failed?: number; recovered?: number; error?: string } =
      {};
    try {
      body = JSON.parse(text) as typeof body;
    } catch {
      body = { error: text.slice(0, 200) };
    }

    if (!res.ok) {
      console.log(`  cron HTTP ${res.status}: ${body.error ?? text.slice(0, 200)}`);
      idleRounds += 1;
      await new Promise((r) => setTimeout(r, 5000));
      continue;
    }

    const processed = body.processed ?? 0;
    const failed = body.failed ?? 0;
    console.log(
      `  cron processed=${processed} failed=${failed} recovered=${body.recovered ?? 0}`
    );
    rounds += 1;
    if (processed + failed === 0) idleRounds += 1;
    else idleRounds = 0;
  }

  const elapsedMin = ((Date.now() - started) / 60000).toFixed(1);
  console.log(`\nDrain finished after ${rounds} round(s), ${elapsedMin} min.`);
}

async function main() {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const supabase = createClient(url, key);
  const enqueueOnly = process.argv.includes("--enqueue-only");
  const drainOnly = process.argv.includes("--drain-only");
  const limit = parseLimit();

  console.log("App:", APP_URL);
  console.log("Ontology flag (local):", process.env.GUARDIAN_ONTOLOGY_ENABLED);
  console.log("Before:", await countDocsByOntology(supabase));
  console.log(
    "Existing extract_ontology jobs:",
    "pending/retryable/processing=",
    await countOntologyJobs(supabase, ["pending", "retryable", "processing"]),
    "completed=",
    await countOntologyJobs(supabase, ["completed"])
  );

  if (!drainOnly) {
    await enqueuePending(supabase, limit);
  }

  if (enqueueOnly) {
    console.log("\nEnqueue only. Production cron will drain every 2 minutes.");
    return;
  }

  if (!cronSecret) {
    console.error("Missing CRON_SECRET; cannot drain production worker.");
    process.exit(1);
  }

  await drainViaCron(supabase, cronSecret);

  const { count: entityCount } = await supabase
    .from("ontology_entities")
    .select("id", { count: "exact", head: true });
  const { count: relCount } = await supabase
    .from("ontology_relationships")
    .select("id", { count: "exact", head: true });

  console.log("\n=== After ===");
  console.log("docs:", await countDocsByOntology(supabase));
  console.log(`entities=${entityCount ?? 0} relationships=${relCount ?? 0}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
