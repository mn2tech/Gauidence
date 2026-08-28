/**
 * Quick local check: migration applied + optional seed for Watch UI testing.
 * Usage:
 *   npx tsx scripts/verify-guardian-items.ts
 *   npx tsx scripts/verify-guardian-items.ts --seed
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
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(url, key);
const seed = process.argv.includes("--seed");

async function main() {
  const { error: tableError } = await supabase
    .from("guardian_items")
    .select("id")
    .limit(1);

  if (tableError) {
    console.error("guardian_items table check failed:", tableError.message);
    if (tableError.message.includes("does not exist")) {
      console.error(
        "\nApply migration: supabase/migrations/0103_guardian_items.sql in Supabase SQL Editor."
      );
    }
    process.exit(1);
  }

  console.log("OK: guardian_items table exists.");

  const { count } = await supabase
    .from("guardian_items")
    .select("id", { count: "exact", head: true });

  console.log(`Active items in project: ${count ?? 0}`);

  if (!seed) {
    console.log("\nTo insert a sample Labor Day item for UI testing:");
    console.log("  npx tsx scripts/verify-guardian-items.ts --seed");
    return;
  }

  const { data: member } = await supabase
    .from("guardian_profile_members")
    .select("profile_id, user_id")
    .limit(1)
    .maybeSingle();

  if (!member) {
    console.error("No guardian_profile_members row found — sign in and create a Space first.");
    process.exit(1);
  }

  const dedupeKey = `school_closure|school closed labor day|2026-09-07|nochild|seed-doc`;

  const { data: existing } = await supabase
    .from("guardian_items")
    .select("id, title")
    .eq("space_id", member.profile_id)
    .eq("dedupe_key", dedupeKey)
    .maybeSingle();

  if (existing) {
    console.log("Sample item already exists:", existing);
    console.log("\nOpen http://localhost:3000/home (signed in) to see Coming Up.");
    return;
  }

  const row = {
    user_id: member.user_id,
    space_id: member.profile_id,
    child_id: null,
    school_context_id: null,
    type: "school_closure",
    title: "No school — Labor Day",
    description: "Schools and offices are closed.",
    event_date: "2026-09-07",
    status: "active",
    priority: "normal",
    requires_action: false,
    source_type: "document",
    source_excerpt:
      "September 7 — Labor Day — Schools and offices closed",
    confidence: 0.98,
    needs_review: false,
    extraction_version: "v1",
    dedupe_key: dedupeKey,
  };

  const { data, error } = await supabase
    .from("guardian_items")
    .insert(row)
    .select("id, title, event_date")
    .single();

  if (error) {
    console.error("Seed failed:", error.message);
    process.exit(1);
  }

  console.log("Seeded sample item:", data);
  console.log("\nOpen http://localhost:3000/home (signed in) to see Coming Up.");
}

void main();
