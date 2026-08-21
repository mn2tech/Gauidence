import type { Metadata } from "next";
import LegalDocumentPage from "@/components/legal/LegalDocumentPage";
import { TERMS_SECTIONS } from "@/lib/legal/termsContent";
import {
  LEGAL_EFFECTIVE_DATES,
  LEGAL_VERSIONS,
} from "@/lib/legal/versions";

export const metadata: Metadata = {
  title: "Terms of Use — Guardian",
  description:
    "Terms governing your use of Guardian, including accounts, AI features, subscriptions, and responsibilities.",
};

export default function TermsPage() {
  return (
    <LegalDocumentPage
      title="Terms of Use"
      description="Please read these Terms carefully before using Guardian. They include important information about AI features, subscriptions, and limitations of liability."
      effectiveDate={LEGAL_EFFECTIVE_DATES.terms}
      lastUpdated={LEGAL_EFFECTIVE_DATES.terms}
      version={LEGAL_VERSIONS.terms}
      sections={TERMS_SECTIONS}
    />
  );
}
