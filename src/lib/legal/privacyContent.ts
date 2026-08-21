import type { LegalSection } from "@/components/legal/LegalDocumentPage";
import { LEGAL_CONTACT } from "@/lib/legal/versions";

/**
 * Privacy Policy body — grounded in Guardian's implemented architecture.
 * Sections marked for counsel review are noted in docs/legal-verification.md.
 */
export const PRIVACY_SECTIONS: LegalSection[] = [
  {
    id: "introduction",
    title: "Introduction",
    paragraphs: [
      "Guardian (“Guardian,” “we,” “us,” or “our”) is an AI-powered knowledge product operated by NM2TECH LLC. Guardian helps you create Spaces, store documents, images, notes, and related information, and use the Gideon assistant to retrieve, summarize, analyze, and reason over information you choose to store.",
      "This Privacy Policy explains what information Guardian may receive, how it may be used, and the choices available to you. Because Guardian may contain personal, business, family, school, financial, contractual, and other user-provided information, we aim to be clear about how that information is handled.",
      "Your information. Your Spaces. Your control — within the limits of providing the service and the protections described here and on our Security Principles page.",
    ],
  },
  {
    id: "information-you-provide",
    title: "Information you provide",
    paragraphs: [
      "Guardian may receive information you voluntarily provide, including:",
    ],
    list: [
      "Account information such as email address and password (passwords are handled by our authentication provider and are not stored by Guardian in plain text)",
      "Name and other profile details you enter",
      "Company or organization name if you add it",
      "Space names, descriptions, and related Space settings",
      "Documents, images, and other files you upload",
      "Notes, Daily Logs, and similar text you enter",
      "Business cards or contact images you choose to scan or upload",
      "Messages and questions you submit to Gideon or other chat features",
      "Information contained inside materials you upload (for example names, dates, amounts, or other content present in a document)",
      "Billing-related contact details when you subscribe through our payment processor",
      "Preferences such as reminder, tip, and notification settings",
    ],
    paragraphsAfter: [
      "The contents of uploaded materials depend entirely on what you choose to store. Guardian does not independently collect the substance of your documents from outside sources unless you connect an optional integration and authorize it.",
    ],
  },
  {
    id: "information-collected-automatically",
    title: "Information collected automatically",
    paragraphs: [
      "When you use Guardian, we may collect certain technical and operational information needed to run and secure the product, including:",
    ],
    list: [
      "Authentication and session information required to keep you signed in",
      "Application usage and feature interactions (for example page views and selected product analytics events when analytics is enabled)",
      "Error, diagnostic, and performance information used to troubleshoot problems (including through our error-monitoring provider when configured)",
      "Security and access logs associated with authenticating and authorizing requests",
      "Basic operational records such as when a document was uploaded or processed",
    ],
    paragraphsAfter: [
      "Depending on your browser, network, and our hosting providers, standard technical information such as IP address and device/browser characteristics may be processed as part of delivering the service. We do not sell your personal information.",
    ],
  },
  {
    id: "how-we-use",
    title: "How we use information",
    paragraphs: [
      "We use information to:",
    ],
    list: [
      "Provide Guardian functionality, including Spaces, storage, search, and retrieval",
      "Process uploaded materials (for example analysis, indexing, and knowledge extraction when you request or enable those features)",
      "Answer Gideon questions and generate summaries or suggested follow-ups",
      "Extract useful structured information (such as dates or facts) from materials you submit for analysis",
      "Maintain security, prevent abuse, and troubleshoot problems",
      "Manage subscriptions and billing when you choose a paid plan",
      "Send service-related communications you enable (for example deadline reminders, optional tips, or push notifications)",
      "Improve product functionality and understand how features are used",
    ],
    paragraphsAfter: [
      "Guardian does not claim that your content is used to train third-party foundation models. Whether a specific AI provider may use API inputs for training depends on that provider’s terms and configuration, which can change. See “Artificial intelligence processing” and our verification notes for what we can and cannot currently assert.",
    ],
  },
  {
    id: "ai-processing",
    title: "Artificial intelligence processing",
    paragraphs: [
      "Guardian uses artificial intelligence to process user-provided information when you use AI-powered features. Depending on the feature, this may include document analysis, information extraction, summarization, search, question answering, suggested follow-ups, classification, and knowledge retrieval.",
      "In the current architecture, AI processing may involve sending relevant content (such as document text, images you submit for analysis, notes, or chat context) to third-party model providers so that Guardian can return results. Providers used by Guardian may include Anthropic (Claude) for analysis and chat, OpenAI for embeddings used in knowledge search, and optionally other configured model endpoints for chat.",
      "We do not claim that your data “never leaves Guardian.” AI features require transmitting relevant content to model providers over encrypted connections in order to generate results.",
      "We also do not make a blanket claim that “your data is never used for AI training” across every provider. You should review the applicable provider terms. Guardian’s product intent is to use AI to serve your account’s requests—not to publish your private Spaces.",
      "AI output can be wrong. Verify important information against your original documents. See our AI Disclaimer for more detail.",
    ],
  },
  {
    id: "processors",
    title: "Service providers and processors",
    paragraphs: [
      "We use service providers that process information as needed to operate Guardian. Based on Guardian’s current implementation, these may include:",
    ],
    list: [
      "Supabase — authentication, database, and file storage",
      "Anthropic — AI model processing for analysis and chat",
      "OpenAI — embeddings used for document search",
      "Stripe — payment processing for paid plans (when billing is configured)",
      "PostHog — product analytics (when an analytics key is configured)",
      "Sentry — error and diagnostic monitoring (when configured)",
      "Resend — transactional and optional product email (when configured)",
      "Hosting and infrastructure providers that deliver the Guardian application",
    ],
    paragraphsAfter: [
      "Optional features may involve additional processors only when you use them (for example SMS via Twilio if enabled, web search tools for research features, or Google services if you connect Google sign-in or Drive). Providers process information under their own terms and solely as needed to provide the relevant functionality.",
    ],
  },
  {
    id: "user-content",
    title: "Your content",
    paragraphs: [
      "You retain ownership of the content you upload to Guardian. NM2TECH LLC does not claim ownership of your documents, notes, or other user content.",
      "By using Guardian, you grant us a limited permission to store, process, analyze, index, retrieve, and display your content solely as needed to provide and improve Guardian functionality for your account (and for collaborators you invite to specific Spaces).",
    ],
  },
  {
    id: "user-responsibility",
    title: "Your responsibilities",
    paragraphs: [
      "You are responsible for ensuring you have the right and authorization to upload information to Guardian. Do not upload information you are prohibited from storing or sharing.",
      "This is especially important when information relates to customers, employees, students, patients, clients, family members, business partners, or other third parties. You must comply with applicable laws and any agreements that govern that information.",
    ],
  },
  {
    id: "sensitive-information",
    title: "Sensitive information",
    paragraphs: [
      "Exercise caution before uploading highly sensitive information. Examples include Social Security numbers, passwords, authentication credentials, banking credentials, payment card information, medical records, government identification, and highly confidential business information.",
      "Guardian is not represented as HIPAA compliant, FERPA compliant, PCI compliant, FedRAMP authorized, or certified under other regulated frameworks unless we have separately established and stated that compliance in writing.",
      "Limited encryption at rest for specific fields may exist in certain optional workflows (for example contractor intake Social Security numbers when that feature is enabled). That does not mean all uploaded content is end-to-end encrypted.",
    ],
  },
  {
    id: "sharing",
    title: "Sharing and collaboration",
    paragraphs: [
      "By default, your Spaces and documents are associated with your account. You may invite collaborators to certain Spaces or create time-limited document share links. Those features grant access only as you configure them.",
      "We may disclose information if required by law, to protect rights and safety, or in connection with a corporate transaction, subject to applicable legal requirements.",
    ],
  },
  {
    id: "security",
    title: "Data security",
    paragraphs: [
      "Guardian uses reasonable technical and organizational safeguards designed to protect information. Based on the current product, these include authenticated access, authorization checks, database Row Level Security (RLS) policies, Space membership controls, and encryption in transit (HTTPS) between your device and our servers.",
      "No electronic system can guarantee absolute security. We do not promise that information will never be accessed, disclosed, altered, or destroyed without authorization. Please also review our Security Principles page for plain-language details and explicit non-claims.",
    ],
  },
  {
    id: "retention",
    title: "Retention and deletion",
    paragraphs: [
      "We retain information for as long as your account remains active and as needed to provide Guardian, comply with legal obligations, resolve disputes, and enforce agreements.",
      "Within the product you can delete individual documents and delete Spaces (with confirmation where required). You can also permanently delete your account from Settings, which removes your authentication user and cascades associated vault data according to our database design, with best-effort cleanup of stored files.",
      "Some residual records (for example backups, logs, or billing records held by processors) may persist for a limited period consistent with normal operations and legal requirements.",
    ],
  },
  {
    id: "children",
    title: "Children’s privacy",
    paragraphs: [
      "Guardian is not directed to children as a primary audience. We do not knowingly collect personal information directly from children under 13 (or under the applicable minimum age in your jurisdiction) for the purpose of creating their own independent accounts without appropriate authorization.",
      "Adults may use Guardian to organize family or school-related information within an adult-controlled account. That is different from a child independently creating and using a Guardian account. If you believe a child has provided personal information to us inappropriately, contact us and we will take reasonable steps to delete it.",
    ],
  },
  {
    id: "rights",
    title: "Privacy rights",
    paragraphs: [
      "Depending on where you live, you may have rights regarding your personal information, such as rights to access, correct, delete, or obtain a copy of certain information, or to object to or restrict certain processing where applicable.",
      "You can exercise many practical controls in-product (account settings, Space and document deletion, account deletion). For privacy requests that you cannot complete in the product, email us at the contact below. We may need to verify your request before acting on it.",
      "We do not sell personal information as that term is commonly understood under U.S. state privacy laws.",
    ],
  },
  {
    id: "international",
    title: "International processing",
    paragraphs: [
      "Guardian and its processors may process information in the United States and other countries where our service providers operate. If you access Guardian from outside those locations, you understand that information may be transferred to and processed in those countries.",
    ],
  },
  {
    id: "changes",
    title: "Changes to this policy",
    paragraphs: [
      "We may update this Privacy Policy from time to time. We will post the updated version with a new effective date and version identifier. If changes are material, we may provide additional notice in the product or by email where appropriate.",
    ],
  },
  {
    id: "contact",
    title: "Contact",
    paragraphs: [
      `For privacy questions or requests, contact ${LEGAL_CONTACT.company} at ${LEGAL_CONTACT.supportEmail}.`,
      "For security vulnerability reports, see our Security Principles page.",
    ],
  },
];
