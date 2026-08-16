import "server-only";

import { jsonSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/json-schema";
import {
  createLlmClient,
  CHAT_MODEL,
  VISUAL_ANALYSIS_MODEL,
  type ContentPart,
} from "@/lib/analysis/llm";
import { extractDocumentText } from "@/lib/analysis/extract";
import { transcribeDocument } from "@/lib/analysis/ocr";
import { isJsonMimeOrName, normalizeJsonText } from "@/lib/analysis/jsonText";
import {
  ONTOLOGY_EXTRACTION_JSON_SCHEMA,
  parseOntologyExtraction,
} from "../schema";
import type { OntologyExtractionResult } from "../types";
import type { SourceContent } from "@/lib/connectors/content/types";
import {
  extractExcelText,
  isExcelMimeOrName,
} from "@/lib/connectors/content/extractExcel";
import { sanitizeConnectorOntologyExtraction } from "./sanitizeConnectorExtraction";
import {
  fallbackOntologyFromFileName,
  looksLikeChartOrSheetFile,
} from "./filenameFallback";
import { enrichOntologyWithTranscript, longestExtractionTranscript } from "./enrichWithTranscript";
import {
  extractTrelloCardIndex,
  mergeCardIndexEntities,
  mergeTrelloSongEntities,
  parseTrelloBoardSongs,
} from "./trelloCardIndex";
import { connectorAnalysisVersion } from "./analysisVersion";

export { connectorAnalysisVersion };

function buildConnectorSystemPrompt(): string {
  return `You are Guardian's Ontology Extraction engine for connected device files.
Extract useful personal and business knowledge as entities and relationships.

Rules:
- Prefer Event-centered modeling for personal receipts, tickets, and activity photos.
  Example: Event "Dinner" — OCCURRED_AT → Restaurant "Chipotle"; Event "Movie Night" — WATCHED → Movie.
- For business invoices: do NOT create Event entities. Create one entity_type "invoice"
  (name like "Invoice 00000001") plus organization entities for issuer and recipient.
- Invoice relationship directions (strict):
    Invoice —[ISSUED_BY]→ issuer organization
    Invoice —[ISSUED_TO]→ recipient organization
  Never reverse those directions. Do not use RELATED_TO for invoice parties.
- Do NOT invent people attending an event unless the source clearly names them.
- Entity types allowed: person, organization, place, event, document, purchase, restaurant, movie, product, date, project, asset, contract, invoice.
- Never type an invoice title/number as organization, event, or document.
- Never create organizations from folder/sheet/infrastructure labels
  (e.g. "Supporting Databases", "Downloads", sheet names, file paths).
- For invoices and purchases, ALWAYS capture structured attributes when present:
  attributes.amount (number), attributes.currency (e.g. USD), attributes.invoice_number,
  attributes.issuer, attributes.recipient, attributes.invoice_date.
  Also put a one-line money summary in description, e.g. "Invoice 00000001 for $1,250.00 USD".
- Charts, worksheets, music sheets, chord charts, tablature, study guides, and other
  reference pages ARE valid knowledge sources even with little prose.
  Always create a document entity from the visible title or file name.
  Put a detailed content summary in that document's description (chords, keys, sections,
  fingerings, notes — as much as the source shows).
  Also extract the subject (instrument, topic, song, skill) as asset or product when labeled.
  Create product entities for distinct chord names, keys, or labeled sections when clearly shown.
  Prefer asset/product/document — never invent people or orgs.
- For Trello music boards / setlists: create one document (or product) entity for EVERY
  song/card name in CARD INDEX. Do not stop after a few songs. Include key/chart details
  from Card details when present. Also create one document entity for the board itself.
- Every relationship MUST include an evidence quote (verbatim or short paraphrase from the source, max 300 chars).
- Include confidence 0.0-1.0 for each entity and relationship.
- Prefer specific names. Avoid generic labels like "Receipt" or bare "Invoice" as an organization.
- Use relationship types when they fit: OCCURRED_AT, PURCHASED_FROM, VISITED, WATCHED, ATTENDED, PART_OF, OWNED_BY, CREATED_BY, EVIDENCED_BY, MENTIONED_IN, ISSUED_BY, ISSUED_TO, RELATED_TO (last resort).
- Do not use PURCHASED_FROM for invoice issuer/recipient (use ISSUED_BY / ISSUED_TO).
- Also allowed when clear: WORKS_FOR, CLIENT_OF, VENDOR_OF.
- Only return empty arrays when the file is blank, corrupt, or has no identifiable title/subject.
- Avoid guessing. When uncertain, omit rather than hallucinate.`;
}

/**
 * Extract ontology from temporary source content.
 * Does not upload or store the raw file.
 */
export async function extractOntologyFromSourceContent(args: {
  content: SourceContent;
  spaceName?: string | null;
}): Promise<{
  extraction: OntologyExtractionResult | null;
  contentTextPreview: string;
  extractionMethod: string;
}> {
  const bytes = args.content.bytes;
  const base64 = bytes ? Buffer.from(bytes).toString("base64") : "";
  const mimeType = args.content.mimeType || "application/octet-stream";
  const fileName = args.content.filename;

  let extractedText = (args.content.text ?? "").trim();
  let extractionMethod = extractedText ? "provided_text" : "none";
  if (extractedText && isJsonMimeOrName(mimeType, fileName)) {
    extractedText = normalizeJsonText(extractedText);
  }

  if (!extractedText && bytes && isExcelMimeOrName(mimeType, fileName)) {
    const excel = extractExcelText({ bytes, fileName });
    extractedText = excel.text.trim();
    extractionMethod = "excel_sheet_text";
  }

  const isVisualDoc =
    mimeType.startsWith("image/") ||
    mimeType === "application/pdf" ||
    /\.(pdf|png|jpe?g|webp|gif)$/i.test(fileName);
  const trelloChart =
    args.content.metadata?.provider === "trello" &&
    args.content.metadata?.kind === "attachment";
  const forceChartVision =
    (looksLikeChartOrSheetFile(fileName) || Boolean(trelloChart)) &&
    isVisualDoc;

  if (base64 && isVisualDoc && (!extractedText || forceChartVision)) {
    const extraction = await extractDocumentText({
      mimeType,
      base64,
      fileName,
    });
    if (!extractedText) {
      extractedText = extraction.text.trim();
      extractionMethod = extraction.method;
    }

    // Images / scanned / chart PDFs: vision transcript → ontology.
    if (
      forceChartVision ||
      !extractedText ||
      extraction.quality < 0.45
    ) {
      let multimodal: OntologyExtractionResult | null = null;
      let method = extractionMethod;
      try {
        const result = await extractOntologyMultimodal({
          mimeType,
          base64,
          fileName,
          extractedText,
          pageImages: extraction.pageImages,
          spaceName: args.spaceName,
          treatAsChart: forceChartVision,
        });
        multimodal = result.extraction;
        method = result.method;
      } catch (err) {
        console.error("Connector multimodal ontology extraction failed:", err);
      }

      const resolved =
        multimodal ?? fallbackOntologyFromFileName(fileName);
      const existingTranscript = resolved
        ? longestExtractionTranscript(resolved)
        : null;
      const layer = extractedText.trim();
      const withText =
        resolved &&
        layer.length >= 12 &&
        layer.length > (existingTranscript?.length ?? 0)
          ? enrichOntologyWithTranscript(resolved, layer, fileName)
          : resolved;
      return {
        extraction: withText,
        contentTextPreview: extractedText.slice(0, 200),
        extractionMethod: multimodal
          ? method
          : withText
            ? extractedText.trim().length >= 12
              ? "text_layer_transcript"
              : "filename_fallback"
            : extractionMethod,
      };
    }
  }

  if (!extractedText) {
    return {
      extraction: fallbackOntologyFromFileName(fileName),
      contentTextPreview: "",
      extractionMethod: "filename_fallback",
    };
  }

  const cardIndex = extractTrelloCardIndex(extractedText);
  if (cardIndex) {
    // Fast path for Trello boards: every card name → entity (no multi-pass timeout).
    const boardName =
      extractedText.match(/^Trello board:\s*(.+)$/m)?.[1]?.trim() ||
      fileName.replace(/\.(json|txt)$/i, "") ||
      fileName;
    let extraction: OntologyExtractionResult = {
      entities: [
        {
          type: "document",
          name: boardName,
          confidence: 0.9,
          description: `Trello board with ${cardIndex.split("\n").filter((l) => l.startsWith("*")).length} open cards.`,
        },
      ],
      relationships: [],
      events: [],
    };
    extraction = mergeTrelloSongEntities(
      extraction,
      parseTrelloBoardSongs(extractedText)
    );
    extraction = mergeCardIndexEntities(extraction, cardIndex);

    return {
      extraction,
      contentTextPreview: extractedText.slice(0, 200),
      extractionMethod: "trello_card_index",
    };
  }

  let extraction: OntologyExtractionResult | null = null;
  try {
    extraction = await extractOntologyConnectorText({
      sourceText: extractedText,
      fileName,
      spaceName: args.spaceName,
    });
  } catch (err) {
    console.error("Connector text ontology extraction failed:", err);
  }

  const resolved = extraction ?? fallbackOntologyFromFileName(fileName);
  return {
    extraction: resolved,
    contentTextPreview: extractedText.slice(0, 200),
    extractionMethod: extraction
      ? extractionMethod
      : resolved
        ? "filename_fallback"
        : extractionMethod,
  };
}

async function extractOntologyConnectorText(input: {
  sourceText: string;
  fileName: string;
  spaceName?: string | null;
}): Promise<OntologyExtractionResult | null> {
  const full = input.sourceText.trim();
  if (!full) return null;

  const CHUNK = 10_000;
  const OVERLAP = 400;
  const chunks: string[] = [];
  if (full.length <= CHUNK) {
    chunks.push(full);
  } else {
    for (let i = 0; i < full.length && chunks.length < 3; i += CHUNK - OVERLAP) {
      chunks.push(full.slice(i, i + CHUNK));
    }
  }

  const merged: OntologyExtractionResult = {
    entities: [],
    relationships: [],
    events: [],
  };
  const seenEntities = new Set<string>();
  const seenRels = new Set<string>();

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]!;
    const part = await extractOntologyConnectorTextChunk({
      sourceText: chunk,
      fileName: input.fileName,
      spaceName: input.spaceName,
      chunkIndex: chunks.length > 1 ? i + 1 : null,
      chunkCount: chunks.length > 1 ? chunks.length : null,
    });
    if (!part) continue;
    for (const e of part.entities) {
      const key = `${e.type}:${e.name.trim().toLowerCase()}`;
      if (seenEntities.has(key)) continue;
      seenEntities.add(key);
      merged.entities.push(e);
    }
    for (const r of part.relationships) {
      const key = `${r.source}|${r.type}|${r.target}`.toLowerCase();
      if (seenRels.has(key)) continue;
      seenRels.add(key);
      merged.relationships.push(r);
    }
    merged.events.push(...part.events);
  }

  if (!merged.entities.length && !merged.relationships.length) return null;
  return sanitizeConnectorOntologyExtraction(merged);
}

async function extractOntologyConnectorTextChunk(input: {
  sourceText: string;
  fileName: string;
  spaceName?: string | null;
  chunkIndex?: number | null;
  chunkCount?: number | null;
}): Promise<OntologyExtractionResult | null> {
  const text = input.sourceText.trim();
  if (!text) return null;

  const chunkNote =
    input.chunkIndex && input.chunkCount
      ? `\n(Part ${input.chunkIndex} of ${input.chunkCount} — extract every song/card in this part; do not skip names.)`
      : "";

  const client = createLlmClient();
  const response = await client.messages.create({
    model: CHAT_MODEL,
    max_tokens: 8192,
    system: buildConnectorSystemPrompt(),
    messages: [
      {
        role: "user",
        content: `Extract ontology from this connected file (${input.fileName})${
          input.spaceName ? ` for space "${input.spaceName}"` : ""
        }${chunkNote}:\n\n${text}`,
      },
    ],
    output_config: {
      format: jsonSchemaOutputFormat(ONTOLOGY_EXTRACTION_JSON_SCHEMA),
    },
  });

  const block = response.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(block.text);
  } catch {
    return null;
  }
  return parseOntologyExtraction(parsed);
}

async function extractOntologyMultimodal(args: {
  mimeType: string;
  base64: string;
  fileName: string;
  extractedText: string;
  pageImages: Array<{ page: number; dataUrl: string }>;
  spaceName?: string | null;
  treatAsChart?: boolean;
}): Promise<{
  extraction: OntologyExtractionResult | null;
  method: string;
}> {
  const client = createLlmClient();

  // 1) Vision OCR / transcript — critical for chord charts and image PDFs.
  let transcript = "";
  try {
    const looksLikeChart =
      args.treatAsChart === true || looksLikeChartOrSheetFile(args.fileName);
    const ocr = await transcribeDocument({
      client,
      fileName: args.fileName,
      mimeType: args.mimeType,
      base64: args.base64,
      pageImages: args.pageImages,
      ...(looksLikeChart
        ? {
            system: `You transcribe music charts, chord sheets, tablature, and practice worksheets for Guardian.
Copy every readable chord name, lyric line, key signature, section label (Verse/Chorus/Bridge/Tag/Intro/Outro), fret/string marking, and performance note exactly.
Preserve reading order and line breaks. Prefer a chord-over-lyrics layout when both appear on the page (chords on the line above the words they cover).
Do not invent chords or lyrics that are not visible.
Output plain text only.`,
            userHint: `Transcribe this music/reference chart (${args.fileName}) completely. Include all chord names, lyrics, section labels, keys, and notes in reading order.`,
          }
        : {}),
    });
    transcript = ocr.text.trim();
  } catch (err) {
    console.error("Connector vision transcription failed:", err);
  }

  if (transcript.length >= 20) {
    let fromText: OntologyExtractionResult | null = null;
    try {
      fromText = await extractOntologyConnectorText({
        sourceText: transcript,
        fileName: args.fileName,
        spaceName: args.spaceName,
      });
    } catch (err) {
      console.error(
        "Connector ontology from vision transcript failed:",
        err
      );
    }

    const base =
      fromText ??
      fallbackOntologyFromFileName(args.fileName) ??
      ({
        entities: [],
        relationships: [],
        events: [],
      } satisfies OntologyExtractionResult);

    return {
      extraction: enrichOntologyWithTranscript(
        base,
        transcript,
        args.fileName
      ),
      method: "vision_transcript_ontology",
    };
  }

  // 2) Direct visual JSON extraction (no invoice boilerplate from buildFileContent).
  const parts: ContentPart[] = [
    {
      type: "text",
      text: `${buildConnectorSystemPrompt()}

Return ONLY JSON matching the ontology extraction schema (entities, relationships, events).
This may be a chart, worksheet, music sheet, chord chart, or scanned page.
Read every visible label, chord name, key, section header, and instruction.
File: ${args.fileName}${args.spaceName ? `\nSpace: ${args.spaceName}` : ""}`,
    },
  ];

  if (args.pageImages.length > 0) {
    for (const img of args.pageImages.slice(0, 4)) {
      parts.push({ type: "text", text: `--- Page ${img.page} ---` });
      const match = img.dataUrl.match(
        /^data:(image\/(?:jpeg|png|gif|webp));base64,(.+)$/i
      );
      if (!match) continue;
      parts.push({
        type: "image",
        source: {
          type: "base64",
          media_type: match[1]!.toLowerCase() as
            | "image/jpeg"
            | "image/png"
            | "image/gif"
            | "image/webp",
          data: match[2]!,
        },
      });
    }
  } else if (args.mimeType === "application/pdf") {
    parts.push({
      type: "document",
      source: {
        type: "base64",
        media_type: "application/pdf",
        data: args.base64,
      },
    });
  } else if (args.mimeType.startsWith("image/")) {
    const media =
      args.mimeType === "image/jpg" ? "image/jpeg" : args.mimeType;
    if (
      media === "image/jpeg" ||
      media === "image/png" ||
      media === "image/gif" ||
      media === "image/webp"
    ) {
      parts.push({
        type: "image",
        source: {
          type: "base64",
          media_type: media,
          data: args.base64,
        },
      });
    }
  }

  const response = await client.messages.create({
    model: VISUAL_ANALYSIS_MODEL,
    max_tokens: 4096,
    messages: [{ role: "user", content: parts }],
    output_config: {
      format: jsonSchemaOutputFormat(ONTOLOGY_EXTRACTION_JSON_SCHEMA),
    },
  });

  const block = response.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") {
    return { extraction: null, method: "multimodal_ontology" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(block.text);
  } catch {
    return { extraction: null, method: "multimodal_ontology" };
  }
  const extraction = parseOntologyExtraction(parsed);
  return {
    extraction: extraction
      ? sanitizeConnectorOntologyExtraction(extraction)
      : null,
    method: "multimodal_ontology",
  };
}
