import type { ActionDefinition } from "../types";

const UPLOAD_INTENT =
  /\b(upload|attach|add\s+(?:this\s+)?(?:file|document|photo|receipt|invoice))\b/i;

export const uploadDocumentAction: ActionDefinition = {
  id: "upload_document",
  label: "Upload Document",
  description: "Upload and analyze a document with smart workspace suggestions.",
  matches: (question) => UPLOAD_INTENT.test(question.trim()),
  thinkingSteps: [
    "Uploading file",
    "Reading document (OCR)",
    "Extracting entities",
    "Classifying document",
    "Suggesting workspace",
  ],
};

export const saveDocumentAction: ActionDefinition = {
  id: "save_document",
  label: "Save Document",
  description: "File a document to the suggested workspace with one click.",
  matches: () => false,
  requiresConfirmation: true,
  thinkingSteps: ["Preparing save", "Moving to workspace", "Indexing document"],
};
