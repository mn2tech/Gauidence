#!/usr/bin/env tsx
/**
 * Send the Ask Gideon attachments product-update email to all opted-in users.
 *
 * Usage:
 *   npm run announce:gideon-attachments -- --dry-run
 *   npm run announce:gideon-attachments -- --limit=5
 *   npm run announce:gideon-attachments
 *
 * Requires: RESEND_API_KEY, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL
 */
import { runProductEmailCampaign } from "../src/lib/retention/run";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run") || process.env.DRY_RUN === "1";
const limitArg = args.find((a) => a.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.split("=")[1]) : undefined;

if (limitArg && (!Number.isFinite(limit) || (limit ?? 0) <= 0)) {
  console.error("Invalid --limit value");
  process.exit(1);
}

async function main() {
  const result = await runProductEmailCampaign("product_gideon_attachments", {
    dryRun,
    limit,
  });

  console.log(JSON.stringify(result, null, 2));

  if (!dryRun && result.failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
