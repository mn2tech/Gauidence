/**
 * Pilot Guardian Knowledge Engine Phase 2:
 * - Verify migration tables
 * - Enqueue 1–2 documents with extracted_data
 * - Process jobs (requires ANTHROPIC_API_KEY)
 *
 * Usage:
 *   npx tsx --require ./scripts/stub-server-only.cjs scripts/pilot-knowledge-v2.ts
 *   npx tsx --require ./scripts/stub-server-only.cjs scripts/pilot-knowledge-v2.ts --process
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
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
    if (!(key in process.env)) process.env[key] = val;
  }
}

async function main() {
  loadEnvLocal();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const supabase = createClient(url, key);
  const shouldProcess = process.argv.includes("--process");

  console.log("\n=== Knowledge Engine V2 Pilot ===\n");
  console.log("Flag enabled:", process.env.GUARDIAN_KNOWLEDGE_ENGINE_V2_ENABLED === "true");
  console.log("Anthropic configured:", Boolean(process.env.ANTHROPIC_API_KEY?.trim()));

  const tables = [
    "guardian_knowledge_entities",
    "guardian_knowledge_facts",
    "guardian_knowledge_relationships",
    "guardian_knowledge_extraction_jobs",
    "guardian_knowledge_entity_aliases",
    "guardian_knowledge_entity_merge_suggestions",
  ] as const;

  for (const table of tables) {
    const { count, error } = await supabase
      .from(table)
      .select("id", { count: "exact", head: true });
    if (error) {
      console.error(`  ✗ ${table}: ${error.message}`);
      process.exit(1);
    }
    console.log(`  ✓ ${table}: ${count ?? 0} rows`);
  }

  const { data: jobs } = await supabase
    .from("guardian_knowledge_extraction_jobs")
    .select("status")
    .limit(500);
  const byStatus: Record<string, number> = {};
  for (const j of jobs ?? []) {
    byStatus[j.status] = (byStatus[j.status] ?? 0) + 1;
  }
  console.log("\nJob status:", byStatus);

  const { data: candidates } = await supabase
    .from("extracted_data")
    .select("document_id, title, documents!inner(id, file_name, profile_id, user_id)")
    .not("source_text", "is", null)
    .order("document_id", { ascending: false })
    .limit(5);

  if (!candidates?.length) {
    console.error("\nNo documents with extracted source_text found.");
    process.exit(1);
  }

  console.log("\nPilot candidates (most recent with text):");
  for (const c of candidates) {
    const doc = c.documents as {
      id: string;
      file_name: string;
      profile_id: string;
      user_id: string;
    };
    console.log(`  - ${doc.file_name} (${doc.id.slice(0, 8)}…)`);
  }

  const pilot = candidates.slice(0, 2);
  const { enqueueKnowledgeExtractionJob } = await import(
    "../src/lib/knowledge/v2/jobs.ts"
  );

  console.log("\nEnqueuing 2 pilot jobs…");
  for (const c of pilot) {
    const doc = c.documents as {
      id: string;
      file_name: string;
      profile_id: string;
      user_id: string;
    };
    const result = await enqueueKnowledgeExtractionJob(supabase, {
      documentId: doc.id,
      profileId: doc.profile_id,
      userId: doc.user_id,
      reason: "pilot-script",
    });
    console.log(`  ${doc.file_name}: enqueued=${result.enqueued}`);
  }

  if (!shouldProcess) {
    console.log(
      "\nJobs enqueued. Run with --process to drain (needs ANTHROPIC_API_KEY)."
    );
    return;
  }

  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    console.error(
      "\nCannot process: add ANTHROPIC_API_KEY to .env.local or run on Vercel."
    );
    process.exit(1);
  }

  process.env.GUARDIAN_KNOWLEDGE_ENGINE_V2_ENABLED = "true";

  const userId = (pilot[0].documents as { user_id: string }).user_id;
  const { processPendingKnowledgeJobs } = await import(
    "../src/lib/knowledge/v2/jobs.ts"
  );

  console.log("\nProcessing pending jobs (limit 2)…");
  const { processed, failed } = await processPendingKnowledgeJobs(supabase, userId, {
    limit: 2,
  });
  console.log(`  processed=${processed}, failed=${failed}`);

  const { count: factCount } = await supabase
    .from("guardian_knowledge_facts")
    .select("id", { count: "exact", head: true });
  const { count: entityCount } = await supabase
    .from("guardian_knowledge_entities")
    .select("id", { count: "exact", head: true });

  console.log(`\nAfter pilot: ${entityCount ?? 0} entities, ${factCount ?? 0} facts`);

  const { data: sampleFacts } = await supabase
    .from("guardian_knowledge_facts")
    .select("predicate, object_value, confidence, review_status")
    .order("created_at", { ascending: false })
    .limit(5);

  if (sampleFacts?.length) {
    console.log("\nSample facts:");
    for (const f of sampleFacts) {
      console.log(
        `  ${f.predicate} = ${f.object_value} (conf=${f.confidence}, ${f.review_status})`
      );
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
