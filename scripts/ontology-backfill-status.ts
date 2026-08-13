/**
 * Report ontology coverage across all Guardian spaces.
 *
 *   npx tsx --require ./scripts/stub-server-only.cjs scripts/ontology-backfill-status.ts
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
    console.error("Missing Supabase URL or service role key");
    process.exit(1);
  }

  const supabase = createClient(url, key);

  console.log("Flag GUARDIAN_ONTOLOGY_ENABLED:", process.env.GUARDIAN_ONTOLOGY_ENABLED);
  console.log("Anthropic configured:", Boolean(process.env.ANTHROPIC_API_KEY?.trim()));

  const { error: tableError } = await supabase
    .from("ontology_entities")
    .select("id", { count: "exact", head: true });
  if (tableError) {
    console.error("ontology_entities not available:", tableError.message);
    process.exit(1);
  }

  const { data: spaces, error: spaceError } = await supabase
    .from("guardian_profiles")
    .select("id, display_name, profile_type, created_at")
    .order("created_at", { ascending: true });
  if (spaceError) {
    console.error("Failed to list spaces:", spaceError.message);
    process.exit(1);
  }

  console.log(`\nSpaces: ${spaces?.length ?? 0}\n`);

  let totalDocs = 0;
  let totalIndexed = 0;
  let totalPending = 0;
  let totalCompleted = 0;
  let totalFailed = 0;
  let totalSkipped = 0;

  for (const space of spaces ?? []) {
    const { data: docs, error } = await supabase
      .from("documents")
      .select("id, indexing_status, ontology_status")
      .eq("profile_id", space.id);
    if (error) {
      console.error(`  ${space.display_name}: ${error.message}`);
      continue;
    }

    const rows = docs ?? [];
    const indexed = rows.filter((d) => d.indexing_status === "completed");
    const byOnt: Record<string, number> = {};
    for (const d of indexed) {
      const status = d.ontology_status || "pending";
      byOnt[status] = (byOnt[status] ?? 0) + 1;
    }

    totalDocs += rows.length;
    totalIndexed += indexed.length;
    totalPending += byOnt.pending ?? 0;
    totalCompleted += byOnt.completed ?? 0;
    totalFailed += (byOnt.failed ?? 0) + (byOnt.retryable ?? 0);
    totalSkipped += byOnt.skipped ?? 0;

    if (rows.length === 0) continue;

    console.log(
      `${space.display_name} [${space.profile_type}] ${space.id.slice(0, 8)}…  docs=${rows.length} indexed=${indexed.length}  ontology=${JSON.stringify(byOnt)}`
    );
  }

  const { count: entityCount } = await supabase
    .from("ontology_entities")
    .select("id", { count: "exact", head: true });
  const { count: relCount } = await supabase
    .from("ontology_relationships")
    .select("id", { count: "exact", head: true });

  console.log("\n=== Totals ===");
  console.log(`documents: ${totalDocs}`);
  console.log(`indexed: ${totalIndexed}`);
  console.log(`ontology pending: ${totalPending}`);
  console.log(`ontology completed: ${totalCompleted}`);
  console.log(`ontology failed/retryable: ${totalFailed}`);
  console.log(`ontology skipped: ${totalSkipped}`);
  console.log(`entities: ${entityCount ?? 0}`);
  console.log(`relationships: ${relCount ?? 0}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
