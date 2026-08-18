import type { VisionCompatibleMime, VisionInput, VisionProvider } from "./types";
import { VISION_RESULT_JSON_SCHEMA, parseVisionResult } from "./schema";
import { isUsefulVisionResult } from "./mapAnalysis";
import {
  ANALYSIS_MODEL,
  VISUAL_ANALYSIS_MODEL,
  createLlmClient,
  runStructuredJson,
  type ContentPart,
} from "@/lib/analysis/llm";
import { AnalysisLlmError } from "@/lib/analysis/llmErrors";

function visionSystemPrompt(spaceName?: string | null): string {
  const spaceLine = spaceName?.trim()
    ? `This image belongs to the Guardian space "${spaceName.trim()}". Keep extracted knowledge associated with that space. Do not move it to another space based on classification.`
    : "Preserve the current Guardian space. Do not reassign the image to a different space.";

  return `You are Guardian Vision, a multimodal image-understanding engine.

Inspect the attached image directly. Do not rely on a prior OCR pass.
${spaceLine}

Extract only what is actually visible:
- Describe the scene even when there is no readable text.
- Transcribe printed text, screenshots, receipts, invoices, handwritten notes, vehicle documents, and school notices when readable.
- Extract dates, names, amounts, events, and useful entities.
- Leave fields empty rather than guessing.
- If handwriting or a number is unclear, lower confidence. Never invent unreadable text.
- Zero visible text does not mean the image is empty — still describe what you see.

Return JSON matching the schema. Unknown fields must be empty arrays or empty strings.`;
}

function imagePart(mimeType: VisionCompatibleMime, base64: string): ContentPart {
  return {
    type: "image",
    source: {
      type: "base64",
      media_type: mimeType,
      data: base64,
    },
  };
}

export function createAnthropicVisionProvider(): VisionProvider {
  return {
    async analyzeImage(input: VisionInput) {
      const mime = input.mimeType.toLowerCase();
      if (
        mime !== "image/jpeg" &&
        mime !== "image/png" &&
        mime !== "image/gif" &&
        mime !== "image/webp"
      ) {
        throw new AnalysisLlmError(
          "This image format can't be analyzed yet. Guardian will keep the original file.",
          422,
          "unsupported_vision_mime"
        );
      }

      const client = createLlmClient();
      const userContent: ContentPart[] = [
        {
          type: "text",
          text: `Analyze this image (${input.fileName}). Describe what is visible, transcribe readable text, and extract structured facts. Do not invent text that is not visible.`,
        },
        imagePart(mime, input.base64),
      ];

      const raw = await runStructuredJson<unknown>(client, {
        system: visionSystemPrompt(input.spaceName),
        userContent,
        schemaName: "guardian_vision",
        schema: VISION_RESULT_JSON_SCHEMA as unknown as Record<string, unknown>,
        model: process.env.CLAUDE_VISUAL_MODEL ?? VISUAL_ANALYSIS_MODEL ?? ANALYSIS_MODEL,
      });

      const result = parseVisionResult(raw);
      if (!isUsefulVisionResult(result)) {
        throw new AnalysisLlmError(
          "Guardian could not understand this image. The original file is still saved — try analyzing it again.",
          502,
          "empty_vision"
        );
      }

      return {
        result,
        model:
          process.env.CLAUDE_VISUAL_MODEL ??
          VISUAL_ANALYSIS_MODEL ??
          ANALYSIS_MODEL,
      };
    },
  };
}
