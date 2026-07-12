/**
 * Dual-analyzer accuracy bake-off:
 *
 *   Document
 *      ├─ OpenAI visual analyzer  (page images)
 *      └─ Claude PDF analyzer     (native PDF document block)
 *                ↓
 *         Deterministic validation
 *                ↓
 *          Compare accuracy
 *
 * Usage:
 *   npm run compare:analyzers
 *   npm run compare:analyzers -- path/to/invoice.pdf
 *
 * Requires ANTHROPIC_API_KEY and/or OPENAI_API_KEY in the environment (.env.local).
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { compareInvoiceAnalyzers } from "../src/lib/analysis/compare/runCompare.ts";
import { NM2TECH_INVOICE_EXPECTED } from "../src/lib/analysis/__tests__/fixtures/nm2tech-invoice.ts";

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

  const defaultPdf = join(
    ROOT,
    "src/lib/analysis/__tests__/fixtures/onyx-invoice16.pdf"
  );
  const pdfPath = resolve(process.argv[2] ?? defaultPdf);

  if (!existsSync(pdfPath)) {
    console.error(`PDF not found: ${pdfPath}`);
    process.exit(1);
  }

  const hasOpenAi = Boolean(process.env.OPENAI_API_KEY?.trim());
  const hasClaude = Boolean(process.env.ANTHROPIC_API_KEY?.trim());

  if (!hasOpenAi && !hasClaude) {
    console.error(
      "Set OPENAI_API_KEY and/or ANTHROPIC_API_KEY (e.g. in .env.local) to run the compare."
    );
    process.exit(1);
  }

  console.log(`Comparing analyzers on: ${pdfPath}`);
  console.log(
    `Arms: ${[
      hasOpenAi ? "OpenAI visual" : null,
      hasClaude ? "Claude PDF" : null,
    ]
      .filter(Boolean)
      .join(" + ")}`
  );
  console.log("");

  const result = await compareInvoiceAnalyzers({
    pdfPath,
    expected: NM2TECH_INVOICE_EXPECTED,
    runOpenAi: hasOpenAi,
    runClaude: hasClaude,
  });

  for (const arm of result.arms) {
    if (arm.error) {
      console.log(`[${arm.arm}] ERROR (${arm.elapsedMs}ms): ${arm.error}`);
    } else {
      console.log(
        `[${arm.arm}] model=${arm.model} ${arm.elapsedMs}ms → ${arm.report.matched}/${arm.report.total} (${arm.report.pct}%) math=${arm.report.mathOk ? "ok" : "FAIL"}`
      );
    }
  }

  console.log("");
  console.log(result.table);

  const failed = result.arms.filter((a) => a.error || a.report.pct < 100);
  process.exit(failed.length > 0 ? 2 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
