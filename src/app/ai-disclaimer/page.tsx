import type { Metadata } from "next";
import LegalDocumentPage from "@/components/legal/LegalDocumentPage";
import { AI_DISCLAIMER_SECTIONS } from "@/lib/legal/aiDisclaimerContent";
import {
  LEGAL_EFFECTIVE_DATES,
  LEGAL_VERSIONS,
} from "@/lib/legal/versions";

export const metadata: Metadata = {
  title: "AI Disclaimer — Guardian",
  description:
    "Guardian and Gideon use AI. Outputs can be wrong — verify important information against your original documents.",
};

export default function AiDisclaimerPage() {
  return (
    <LegalDocumentPage
      title="Guardian AI Disclaimer"
      description="Guardian and Gideon use artificial intelligence. AI-generated information may contain mistakes. Verify important details against original sources."
      effectiveDate={LEGAL_EFFECTIVE_DATES.aiDisclaimer}
      lastUpdated={LEGAL_EFFECTIVE_DATES.aiDisclaimer}
      version={LEGAL_VERSIONS.aiDisclaimer}
      callout="When AI conflicts with an original document, trust and verify the original source."
      sections={AI_DISCLAIMER_SECTIONS}
    />
  );
}
