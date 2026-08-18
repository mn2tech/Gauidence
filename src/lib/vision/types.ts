/** Guardian Vision — structured image understanding (pure types). */

export const VISION_COMPATIBLE_MIMES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
] as const;

export type VisionCompatibleMime = (typeof VISION_COMPATIBLE_MIMES)[number];

export type VisionAssetKind = "image" | "pdf" | "document" | "generic";

export type VisionStatus =
  | "uploaded"
  | "queued"
  | "analyzing"
  | "analyzed"
  | "indexed"
  | "failed";

export type VisionEntity = {
  type: string;
  name: string;
  confidence?: number;
};

export type VisionDate = {
  value: string;
  context?: string;
  confidence?: number;
};

export type VisionAmount = {
  value: number | null;
  currency?: string | null;
  context?: string;
  confidence?: number;
};

export type VisionFact = {
  predicate: string;
  subject: string;
  object: string;
  confidence?: number;
};

export type VisionTask = {
  text: string;
  confidence?: number;
};

export type VisionResult = {
  document_type: string;
  description: string;
  transcription: string;
  summary: string;
  entities: VisionEntity[];
  dates: VisionDate[];
  amounts: VisionAmount[];
  facts: VisionFact[];
  tasks: VisionTask[];
  confidence: number;
};

export type VisionInput = {
  fileName: string;
  mimeType: string;
  base64: string;
  spaceName?: string | null;
};

export type VisionUsage = {
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  durationMs: number;
};

export type VisionProviderResult = {
  result: VisionResult;
  model: string;
  usage?: VisionUsage;
};

export interface VisionProvider {
  analyzeImage(input: VisionInput): Promise<VisionProviderResult>;
}

export type PreparedVisionImage = {
  mimeType: VisionCompatibleMime;
  base64: string;
  fileName: string;
  convertedFrom?: string;
};

export type GideonVisionImage = {
  documentId: string;
  fileName: string;
  mimeType: string;
  base64: string;
  profileName?: string;
  sourceText?: string | null;
  visionSummary?: string | null;
  visionTranscription?: string | null;
};
