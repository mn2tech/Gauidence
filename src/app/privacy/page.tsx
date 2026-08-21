import type { Metadata } from "next";
import LegalDocumentPage from "@/components/legal/LegalDocumentPage";
import { PRIVACY_SECTIONS } from "@/lib/legal/privacyContent";
import {
  LEGAL_EFFECTIVE_DATES,
  LEGAL_VERSIONS,
} from "@/lib/legal/versions";

export const metadata: Metadata = {
  title: "Privacy Policy — Guardian",
  description:
    "How Guardian collects, uses, and protects information in your Spaces — including AI processing, processors, and your controls.",
};

export default function PrivacyPage() {
  return (
    <LegalDocumentPage
      title="Privacy Policy"
      description="This policy describes how NM2TECH LLC handles information when you use Guardian — Your Life. Your Knowledge. Your Guardian."
      effectiveDate={LEGAL_EFFECTIVE_DATES.privacy}
      lastUpdated={LEGAL_EFFECTIVE_DATES.privacy}
      version={LEGAL_VERSIONS.privacy}
      callout="Your information. Your Spaces. Your control — with clear limits on what we can promise."
      sections={PRIVACY_SECTIONS}
    />
  );
}
