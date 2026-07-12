import "server-only";

import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { extractDocumentText } from "../extract";
import { validateAnalysis } from "../validate";
import type { FilePayload, UserContext } from "../llm";
import {
  analyzeInvoiceClaudePdf,
  createLlmClient,
} from "./claudePdf";
import {
  analyzeInvoiceOpenAiVisual,
  createOpenAiClient,
  OPENAI_VISUAL_MODEL,
} from "./openaiVisual";
import {
  formatAccuracyTable,
  scoreInvoiceAccuracy,
  type AccuracyReport,
  type ExpectedInvoice,
} from "./score";
import { VISUAL_ANALYSIS_MODEL } from "../llm";

export type CompareArmResult = {
  arm: "openai_visual" | "claude_pdf";
  model: string;
  elapsedMs: number;
  report: AccuracyReport;
  error?: string;
};

export type CompareResult = {
  fileName: string;
  arms: CompareArmResult[];
  table: string;
};

function loadPdfPayload(pdfPath: string): {
  base64: string;
  fileName: string;
  bytes: Buffer;
} {
  const bytes = readFileSync(pdfPath);
  return {
    bytes,
    base64: bytes.toString("base64"),
    fileName: basename(pdfPath),
  };
}

/**
 * Document → OpenAI visual + Claude PDF → deterministic validation → accuracy compare.
 * Intended for offline eval scripts (not production UI).
 */
export async function compareInvoiceAnalyzers(args: {
  pdfPath: string;
  expected: ExpectedInvoice;
  user?: UserContext;
  runOpenAi?: boolean;
  runClaude?: boolean;
}): Promise<CompareResult> {
  const runOpenAi = args.runOpenAi !== false;
  const runClaude = args.runClaude !== false;
  const user = args.user ?? {};

  const { base64, fileName } = loadPdfPayload(args.pdfPath);
  const extraction = await extractDocumentText({
    mimeType: "application/pdf",
    base64,
    fileName,
  });

  const baseFile: FilePayload = {
    mimeType: "application/pdf",
    fileName,
    base64,
    extractedText: extraction.text,
    extraction,
    pageImages: extraction.pageImages,
    invoiceAnchors: null,
    inputMode: "visual",
  };

  const arms: CompareArmResult[] = [];

  if (runOpenAi) {
    const arm = "openai_visual" as const;
    const started = Date.now();
    try {
      if (!process.env.OPENAI_API_KEY?.trim()) {
        throw new Error("OPENAI_API_KEY missing — skipping OpenAI visual arm.");
      }
      const client = createOpenAiClient();
      const visualFile: FilePayload = {
        ...baseFile,
        // Fair bake-off: no text anchors for the visual arm either.
        invoiceAnchors: null,
        extractedText: "",
      };
      const raw = await analyzeInvoiceOpenAiVisual(client, visualFile, user);
      const validated = validateAnalysis(raw);
      arms.push({
        arm,
        model: OPENAI_VISUAL_MODEL,
        elapsedMs: Date.now() - started,
        report: scoreInvoiceAccuracy(arm, validated, args.expected),
      });
    } catch (err) {
      arms.push({
        arm,
        model: OPENAI_VISUAL_MODEL,
        elapsedMs: Date.now() - started,
        report: {
          arm,
          checks: [],
          matched: 0,
          total: 0,
          pct: 0,
          validationWarnings: [],
          mathOk: false,
        },
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (runClaude) {
    const arm = "claude_pdf" as const;
    const started = Date.now();
    try {
      if (!process.env.ANTHROPIC_API_KEY?.trim()) {
        throw new Error("ANTHROPIC_API_KEY missing — skipping Claude PDF arm.");
      }
      const client = createLlmClient();
      const raw = await analyzeInvoiceClaudePdf(client, baseFile, user);
      const validated = validateAnalysis(raw);
      arms.push({
        arm,
        model: VISUAL_ANALYSIS_MODEL,
        elapsedMs: Date.now() - started,
        report: scoreInvoiceAccuracy(arm, validated, args.expected),
      });
    } catch (err) {
      arms.push({
        arm,
        model: VISUAL_ANALYSIS_MODEL,
        elapsedMs: Date.now() - started,
        report: {
          arm,
          checks: [],
          matched: 0,
          total: 0,
          pct: 0,
          validationWarnings: [],
          mathOk: false,
        },
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const table = formatAccuracyTable(
    arms.filter((a) => !a.error).map((a) => a.report)
  );

  return { fileName, arms, table };
}
