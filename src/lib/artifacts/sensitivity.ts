import type { ArtifactSensitivity, ArtifactSourceType } from "./types";

const HIGH_SENSITIVITY_DOC_TYPES = new Set([
  "passport",
  "drivers_license",
  "driver_license",
  "driverslicense",
  "ssn",
  "tax_document",
  "w2",
  "w9",
  "medical",
  "hipaa",
]);

const HIGH_SENSITIVITY_NAME =
  /\b(passport|driver'?s?\s*licen[cs]e|state\s*id|social\s*security|ssn|w-?2|w-?9|1099|bank\s*statement|routing\s*number|medical\s*record|hipaa|password|credentials|secret\s*key|api\s*key)\b/i;

const HIGH_SENSITIVITY_CONTENT =
  /\b(driver'?s?\s*licen[cs]e|DLN|passport\s*no|social\s*security|SSN\s*[#: ]?\d|date of birth|DOB\s*:|account\s*number|routing\s*number|CVV|password\s*[:=]|medical\s*record)\b/i;

const MEDIUM_SENSITIVITY =
  /\b(invoice|tax|insurance\s*card|credit\s*card|payroll|salary|compensation)\b/i;

/**
 * Classify sensitivity for isolation rules.
 * High-sensitivity historical artifacts must not appear from vector similarity alone.
 */
export function classifyArtifactSensitivity(args: {
  sourceType?: ArtifactSourceType | null;
  content?: string | null;
  fileName?: string | null;
  documentType?: string | null;
}): ArtifactSensitivity {
  const docType = (args.documentType ?? "").toLowerCase().replace(/\s+/g, "_");
  const fileName = args.fileName ?? "";
  const content = args.content ?? "";
  const sample = `${fileName}\n${content.slice(0, 2500)}`;

  if (
    HIGH_SENSITIVITY_DOC_TYPES.has(docType) ||
    HIGH_SENSITIVITY_NAME.test(fileName) ||
    HIGH_SENSITIVITY_CONTENT.test(sample)
  ) {
    return "high";
  }

  if (
    args.sourceType === "image" &&
    /\b(licen[cs]e|passport|id\s*card|badge)\b/i.test(sample)
  ) {
    return "high";
  }

  if (MEDIUM_SENSITIVITY.test(sample) || docType === "insurance") {
    return "medium";
  }

  return "none";
}

export function isSensitiveArtifact(
  sensitivity: ArtifactSensitivity
): boolean {
  return sensitivity === "high" || sensitivity === "medium";
}
