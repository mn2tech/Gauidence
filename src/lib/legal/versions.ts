/**
 * Central legal document versions — change here, not in scattered UI copy.
 * Bump a version when that document materially changes; existing users can
 * later be prompted to re-acknowledge without blocking today's sessions.
 */

export const LEGAL_VERSIONS = {
  privacy: "2026-08-20",
  terms: "2026-08-20",
  aiDisclaimer: "2026-08-20",
} as const;

export type LegalDocumentId = keyof typeof LEGAL_VERSIONS;

export const LEGAL_EFFECTIVE_DATES = {
  privacy: "August 20, 2026",
  terms: "August 20, 2026",
  aiDisclaimer: "August 20, 2026",
} as const;

export const LEGAL_CONTACT = {
  company: "NM2TECH LLC",
  product: "Guardian",
  supportEmail: "support@nm2tech.com",
  securityEmail: "security@guardian.app",
  website: "https://nm2tech.com",
  productUrl: "https://guardian.nm2tech.com",
} as const;

export const LEGAL_PATHS = {
  privacy: "/privacy",
  terms: "/terms",
  aiDisclaimer: "/ai-disclaimer",
  security: "/security",
} as const;

/** Subscription billing notes pending final business/legal confirmation. */
export const SUBSCRIPTION_POLICY_NOTES = {
  /** Placeholder — confirm before production marketing. */
  cancelAnytime: true,
  /** Refunds not defined in product code; do not promise specific refund windows. */
  refundPolicyDefined: false,
  billingManagedVia: "Stripe Customer Portal (when configured)",
} as const;
