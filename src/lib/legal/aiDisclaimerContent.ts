import type { LegalSection } from "@/components/legal/LegalDocumentPage";
import { LEGAL_CONTACT } from "@/lib/legal/versions";

export const AI_DISCLAIMER_SECTIONS: LegalSection[] = [
  {
    id: "overview",
    title: "Guardian uses artificial intelligence",
    paragraphs: [
      "Guardian and Gideon use artificial intelligence (AI) to help you store, find, summarize, analyze, and reason over information in your Spaces.",
      "AI can be helpful. It can also be wrong. This page explains what that means for your use of Guardian.",
    ],
  },
  {
    id: "mistakes",
    title: "AI-generated information may be wrong",
    paragraphs: [
      "AI-generated information may:",
    ],
    list: [
      "Contain mistakes",
      "Omit important information",
      "Misunderstand documents",
      "Misidentify dates, people, organizations, amounts, or commitments",
      "Generate inaccurate summaries",
      "Produce incomplete answers",
      "Make incorrect inferences",
    ],
    paragraphsAfter: [
      "Always verify important information against your original documents and other authoritative sources before acting.",
    ],
  },
  {
    id: "source-priority",
    title: "Source document priority",
    paragraphs: [
      "When Guardian’s AI-generated response conflicts with an original document or authoritative source, you should rely on and verify against the original source.",
      "Guardian analyzes stored knowledge to assist you. It does not replace the source of truth in your files, contracts, records, or official notices.",
    ],
  },
  {
    id: "interpretation-vs-original",
    title: "Original content vs AI interpretation",
    paragraphs: [
      "Guardian may show both original materials you uploaded and AI-generated interpretations such as summaries, extracted facts, suggested follow-ups, and chat answers.",
      "AI-generated interpretation should not be treated as a verbatim quotation from your source document unless it is clearly presented as text taken from that document. Where the product labels fact sources (for example “From your document,” “Calculated,” or “AI suggestion”), use those labels to understand the difference.",
    ],
  },
  {
    id: "professional-advice",
    title: "Not professional advice",
    paragraphs: [
      "Guardian and Gideon are not a substitute for qualified professional advice. Do not treat Guardian-generated information as professional:",
    ],
    list: [
      "Legal advice",
      "Medical advice",
      "Financial advice",
      "Tax advice",
      "Accounting advice",
      "Investment advice",
    ],
    paragraphsAfter: [
      "Consult an appropriately qualified professional when a decision requires professional judgment.",
    ],
  },
  {
    id: "high-stakes",
    title: "High-stakes decisions",
    paragraphs: [
      "Do not rely solely on Guardian AI outputs when making decisions involving health, safety, legal rights, employment, credit, insurance, financial matters, education, government benefits, or other consequential outcomes.",
      "Guardian should assist human decision-making. It should not replace appropriate human review.",
    ],
  },
  {
    id: "providers",
    title: "How AI processing works (summary)",
    paragraphs: [
      "To generate analysis and answers, Guardian may send relevant content from your account to third-party AI providers over encrypted connections. Those providers process the content to return results. Details about collection and processors appear in the Privacy Policy.",
    ],
  },
  {
    id: "contact",
    title: "Contact",
    paragraphs: [
      `Questions: ${LEGAL_CONTACT.supportEmail}.`,
    ],
  },
];
