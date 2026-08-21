import type { LegalSection } from "@/components/legal/LegalDocumentPage";
import { LEGAL_CONTACT, SUBSCRIPTION_POLICY_NOTES } from "@/lib/legal/versions";

export const TERMS_SECTIONS: LegalSection[] = [
  {
    id: "acceptance",
    title: "Acceptance of terms",
    paragraphs: [
      "These Terms of Use (“Terms”) govern your access to and use of Guardian, operated by NM2TECH LLC (“NM2TECH,” “we,” “us,” or “our”). By creating an account or using Guardian, you agree to these Terms and acknowledge our Privacy Policy.",
      "If you do not agree, do not use Guardian.",
    ],
  },
  {
    id: "eligibility",
    title: "Eligibility",
    paragraphs: [
      "You must be legally able to enter into these Terms. If you use Guardian on behalf of an organization, you represent that you have authority to bind that organization.",
      "Guardian is not intended as a child-directed service. Parents or guardians who store family or school information do so under their own adult-controlled accounts and remain responsible for that use.",
    ],
  },
  {
    id: "accounts",
    title: "Guardian accounts",
    paragraphs: [
      "You are responsible for your account credentials and for activity under your account. Keep your password confidential and notify us promptly if you suspect unauthorized access.",
      "You agree to provide accurate account information and to keep it reasonably up to date.",
    ],
  },
  {
    id: "service",
    title: "The Guardian service",
    paragraphs: [
      "Guardian allows you to create Spaces, upload and store documents and images, keep notes and related information, and use Gideon and other AI-assisted features to retrieve, summarize, analyze, and reason over information associated with your account.",
      "We may modify, suspend, or discontinue features as the product evolves. We will try to avoid unnecessary disruption, but we do not guarantee that any particular feature will remain available indefinitely.",
    ],
  },
  {
    id: "responsibilities",
    title: "User responsibilities",
    paragraphs: [
      "You are responsible for the content you upload and for ensuring you have the rights and authorizations needed to store and process that content in Guardian.",
      "You are responsible for verifying important AI-generated information against original source documents before relying on it.",
    ],
  },
  {
    id: "acceptable-use",
    title: "Acceptable use",
    paragraphs: [
      "You agree not to:",
    ],
    list: [
      "Use Guardian in violation of law or the rights of others",
      "Upload malware or attempt to disrupt or probe the service without authorization",
      "Attempt to access other users’ accounts or Spaces without permission",
      "Abuse AI features, quotas, or APIs in a way that harms the service or other users",
      "Use Guardian to develop competing models by systematically extracting outputs in violation of these Terms or applicable law",
      "Misrepresent AI-generated content as professional advice or as an unaltered extract from a source document",
    ],
  },
  {
    id: "user-content",
    title: "User content",
    paragraphs: [
      "You retain ownership of content you upload. You grant NM2TECH a limited license to host, store, process, analyze, index, retrieve, and display that content solely to operate Guardian for you and for collaborators you authorize.",
      "You represent that your content and your use of Guardian do not infringe others’ rights or violate confidentiality obligations.",
    ],
  },
  {
    id: "ip",
    title: "Intellectual property",
    paragraphs: [
      "Guardian, including its software, branding, and documentation (excluding your user content), is owned by NM2TECH or its licensors. These Terms do not transfer ownership of Guardian to you.",
      "Feedback you provide may be used to improve the product without obligation to you.",
    ],
  },
  {
    id: "ai",
    title: "AI functionality",
    paragraphs: [
      "Gideon and other AI features may generate summaries, extractions facts, suggestions, and answers that can be incomplete or incorrect. AI output is not a substitute for reading your source documents or obtaining professional advice.",
      "When AI-generated information conflicts with an original document or authoritative source, you should rely on and verify against the original source.",
      "Additional details are in the Guardian AI Disclaimer.",
    ],
  },
  {
    id: "subscriptions",
    title: "Subscription plans and billing",
    paragraphs: [
      "Guardian may offer free and paid plans with different limits and features. Plan details and prices are described in the product and may change.",
      "Paid subscriptions are processed by Stripe when billing is configured. By purchasing, you also agree to applicable payment-processor terms.",
      SUBSCRIPTION_POLICY_NOTES.cancelAnytime
        ? "You may cancel a paid subscription through the billing portal or Settings when available. Cancellation typically stops future renewals; access continues through the end of the current paid period unless otherwise stated at checkout."
        : "Cancellation mechanics are described at checkout and in Settings.",
      "Specific refund rules are not defined as a fixed product promise in the application today. If a refund policy is offered, it will be stated at checkout or in a written policy update. Until then, billing disputes should be directed to support.",
    ],
  },
  {
    id: "changes-service",
    title: "Changes to the service",
    paragraphs: [
      "We may update Guardian to improve performance, security, or functionality. Material changes to these Terms will be reflected by an updated version date. Continued use after the effective date of updated Terms constitutes acceptance, except where applicable law requires otherwise.",
    ],
  },
  {
    id: "termination",
    title: "Account termination",
    paragraphs: [
      "You may delete your account from Settings. We may suspend or terminate accounts that violate these Terms, create risk, or remain inactive where permitted by law.",
      "Upon deletion or termination, your right to access Guardian ends. We may retain limited information as required for legal, security, or billing purposes.",
    ],
  },
  {
    id: "third-parties",
    title: "Third-party services",
    paragraphs: [
      "Guardian relies on third-party services (for example authentication, storage, AI providers, analytics, email, and payments). Your use of those services may be subject to their terms. We are not responsible for third-party services we do not control.",
    ],
  },
  {
    id: "disclaimers",
    title: "Disclaimers",
    paragraphs: [
      "GUARDIAN IS PROVIDED “AS IS” AND “AS AVAILABLE” TO THE MAXIMUM EXTENT PERMITTED BY LAW. WE DISCLAIM WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.",
      "We do not warrant that Guardian will be uninterrupted, error-free, or that AI outputs will be accurate or complete.",
    ],
  },
  {
    id: "liability",
    title: "Limitation of liability",
    paragraphs: [
      "TO THE MAXIMUM EXTENT PERMITTED BY LAW, NM2TECH AND ITS AFFILIATES WILL NOT BE LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR FOR LOST PROFITS, DATA, OR GOODWILL, ARISING FROM YOUR USE OF GUARDIAN.",
      "TO THE MAXIMUM EXTENT PERMITTED BY LAW, OUR TOTAL LIABILITY FOR CLAIMS ARISING OUT OF THESE TERMS OR GUARDIAN IS LIMITED TO THE GREATER OF (A) THE AMOUNTS YOU PAID TO US FOR GUARDIAN IN THE TWELVE MONTHS BEFORE THE CLAIM OR (B) ONE HUNDRED U.S. DOLLARS (US $100).",
      "Some jurisdictions do not allow certain limitations; in those cases, our liability is limited to the fullest extent permitted.",
    ],
  },
  {
    id: "indemnification",
    title: "Indemnification",
    paragraphs: [
      "You agree to indemnify and hold harmless NM2TECH and its officers, directors, and agents from claims arising out of your content, your use of Guardian, or your violation of these Terms or applicable law, except to the extent caused by our willful misconduct.",
    ],
  },
  {
    id: "governing-law",
    title: "Governing law",
    paragraphs: [
      "These Terms are governed by the laws of the State of Maryland, USA, without regard to conflict-of-law rules, unless mandatory local law requires otherwise. Courts located in Maryland will have exclusive jurisdiction, except where prohibited.",
      "This governing-law choice should be confirmed by counsel for your final production Terms.",
    ],
  },
  {
    id: "contact",
    title: "Contact",
    paragraphs: [
      `Questions about these Terms: ${LEGAL_CONTACT.supportEmail} (${LEGAL_CONTACT.company}).`,
    ],
  },
];
