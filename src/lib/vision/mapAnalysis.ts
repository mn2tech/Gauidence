import type { DocumentType, GuardianAnalysis } from "@/lib/analysis/types";
import { emptyAnalysis, normalizeFact } from "@/lib/analysis/normalize";
import type { ExtractedFact } from "@/lib/analysis/types";
import type { VisionFact, VisionResult } from "./types";

const IMAGE_TRANSCRIPTION_INDEX_MAX = 4_000;

export function factFingerprint(fact: Pick<VisionFact, "predicate" | "subject" | "object">): string {
  return `${fact.predicate}|${fact.subject}|${fact.object}`
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Empty OCR/transcription is not success. A visual description is. */
export function isUsefulVisionResult(result: VisionResult): boolean {
  if (result.description.trim().length >= 12) return true;
  if (result.summary.trim().length >= 12) return true;
  if (result.transcription.trim().length >= 8) return true;
  if (result.entities.length > 0) return true;
  if (result.facts.length > 0) return true;
  if (result.dates.length > 0) return true;
  if (result.amounts.some((a) => a.value != null)) return true;
  return false;
}

/** Zero OCR characters must never be treated as successful image analysis by itself. */
export function emptyOcrIsSuccessfulAnalysis(ocrText: string | null | undefined): boolean {
  return Boolean((ocrText ?? "").trim());
}

export function mapVisionDocumentType(raw: string): DocumentType {
  const t = raw.trim().toLowerCase();
  if (t.includes("invoice")) return "invoice";
  if (t.includes("receipt")) return "receipt";
  if (t.includes("insurance") || t.includes("policy")) return "insurance";
  if (t.includes("contract") || t.includes("agreement")) return "contract";
  if (t.includes("passport")) return "passport";
  if (t.includes("license") || t.includes("licence")) return "drivers_license";
  if (t.includes("warranty")) return "warranty";
  if (t.includes("tax") || t.includes("w-2") || t.includes("1099")) return "tax_document";
  return "general";
}

function asFact(args: {
  label: string;
  value: string;
  confidence: number;
  excerpt?: string;
  date?: string | null;
  isPast?: boolean;
}): ExtractedFact | null {
  return normalizeFact({
    label: args.label,
    value: args.value,
    source_type: "document",
    confidence: args.confidence,
    source_excerpt: args.excerpt ?? args.value,
    needs_verification: args.confidence < 0.75,
    date: args.date ?? null,
    is_past_event: args.isPast,
  });
}

export function mapVisionResultToAnalysis(
  result: VisionResult,
  fileName: string
): GuardianAnalysis {
  const documentType = mapVisionDocumentType(result.document_type);
  const title =
    result.document_type && result.document_type !== "unknown"
      ? result.document_type.replace(/_/g, " ")
      : fileName.replace(/\.[^.]+$/, "") || "Image";

  const facts: ExtractedFact[] = [];
  const seen = new Set<string>();

  const push = (fact: ExtractedFact | null) => {
    if (!fact) return;
    const key = `${fact.label}|${fact.value}`.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    facts.push(fact);
  };

  for (const entity of result.entities) {
    if ((entity.confidence ?? 1) < 0.55) continue;
    push(
      asFact({
        label: entity.type || "Entity",
        value: entity.name,
        confidence: entity.confidence ?? 0.7,
      })
    );
  }

  const dateFacts: ExtractedFact[] = [];
  for (const date of result.dates) {
    if ((date.confidence ?? 1) < 0.5) continue;
    const fact = asFact({
      label: date.context || "Date",
      value: date.value,
      confidence: date.confidence ?? 0.7,
      date: /^\d{4}-\d{2}-\d{2}$/.test(date.value) ? date.value : null,
      isPast: true,
    });
    if (fact) dateFacts.push(fact);
    push(fact);
  }

  const amountFacts: ExtractedFact[] = [];
  for (const amount of result.amounts) {
    if (amount.value == null || (amount.confidence ?? 1) < 0.5) continue;
    const currency = amount.currency?.trim() || "";
    const value = currency
      ? `${amount.value} ${currency}`
      : String(amount.value);
    const fact = asFact({
      label: amount.context || "Amount",
      value,
      confidence: amount.confidence ?? 0.7,
    });
    if (fact) amountFacts.push(fact);
    push(fact);
  }

  for (const fact of result.facts) {
    if ((fact.confidence ?? 1) < 0.55) continue;
    const fp = factFingerprint(fact);
    if (seen.has(fp)) continue;
    seen.add(fp);
    push(
      asFact({
        label: fact.predicate.replace(/_/g, " "),
        value: `${fact.subject} → ${fact.object}`,
        confidence: fact.confidence ?? 0.7,
        excerpt: `${fact.subject} ${fact.predicate.replace(/_/g, " ")} ${fact.object}`,
      })
    );
  }

  const people = result.entities
    .filter((e) => /person|people|name/i.test(e.type) && (e.confidence ?? 1) >= 0.55)
    .map((e) => e.name);
  const organizations = result.entities
    .filter(
      (e) =>
        /organization|vendor|school|provider|company|shop/i.test(e.type) &&
        (e.confidence ?? 1) >= 0.55
    )
    .map((e) => e.name);

  const tasks = result.tasks
    .filter((t) => (t.confidence ?? 1) >= 0.55)
    .map((t) => t.text);

  const lowConfidence = result.confidence < 0.75;
  const warnings: string[] = [];
  if (lowConfidence) {
    warnings.push(
      "Some details in this image were difficult to read — verify them against the original photo."
    );
  }

  const analysis = emptyAnalysis(documentType, {
    title: title.slice(0, 120),
    summary:
      result.summary.trim() ||
      result.description.trim() ||
      "Image understood by Guardian Vision.",
    facts,
    important_dates: dateFacts,
    people,
    organizations,
    amounts: amountFacts,
    warnings,
    suggested_actions: tasks,
    overall_confidence: result.confidence,
    guardian_status: lowConfidence ? "needs_verification" : "protected",
    specialist: {
      analysis_type: "vision",
      vision_document_type: result.document_type,
      vision_description: result.description,
      vision_confidence: result.confidence,
      source_type: "image",
    },
  });

  return analysis;
}

/** Searchable text from vision output — structured first, transcription capped. */
export function buildVisionSourceText(result: VisionResult, fileName: string): string {
  const lines: string[] = [
    `Image: ${fileName}`,
    `Content type: image`,
  ];
  if (result.document_type && result.document_type !== "unknown") {
    lines.push(`Document type: ${result.document_type.replace(/_/g, " ")}`);
  }
  if (result.description.trim()) {
    lines.push("", "Description:", result.description.trim());
  }
  if (result.summary.trim() && result.summary.trim() !== result.description.trim()) {
    lines.push("", "Summary:", result.summary.trim());
  }
  if (result.entities.length) {
    lines.push("", "Entities:");
    for (const entity of result.entities) {
      lines.push(`- ${entity.type}: ${entity.name}`);
    }
  }
  if (result.dates.length) {
    lines.push("", "Dates:");
    for (const date of result.dates) {
      lines.push(`- ${date.context || "Date"}: ${date.value}`);
    }
  }
  if (result.amounts.length) {
    lines.push("", "Amounts:");
    for (const amount of result.amounts) {
      const value =
        amount.value == null
          ? amount.context || "amount"
          : `${amount.value}${amount.currency ? ` ${amount.currency}` : ""}`;
      lines.push(`- ${amount.context || "Amount"}: ${value}`);
    }
  }
  if (result.facts.length) {
    lines.push("", "Facts:");
    const seen = new Set<string>();
    for (const fact of result.facts) {
      const fp = factFingerprint(fact);
      if (seen.has(fp)) continue;
      seen.add(fp);
      lines.push(
        `- ${fact.subject} ${fact.predicate.replace(/_/g, " ")} ${fact.object}`
      );
    }
  }
  if (result.tasks.length) {
    lines.push("", "Tasks:");
    for (const task of result.tasks) {
      lines.push(`- ${task.text}`);
    }
  }
  const transcription = result.transcription.trim();
  if (transcription) {
    lines.push(
      "",
      "Transcription:",
      transcription.slice(0, IMAGE_TRANSCRIPTION_INDEX_MAX)
    );
  }
  return lines.join("\n").trim();
}

export function visionProvenance(args: {
  documentId: string;
  fact: string;
  confidence: number;
}): Record<string, unknown> {
  return {
    fact: args.fact,
    source_item_id: args.documentId,
    asset_id: args.documentId,
    source_type: "image",
    confidence: args.confidence,
  };
}
