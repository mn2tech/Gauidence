# Guardian legal / privacy verification report

Generated for the Privacy Policy, Terms of Use, and AI Disclaimer implementation.
Date: 2026-08-20.

## Verified (supported by current implementation)

- Public routes `/privacy`, `/terms`, `/ai-disclaimer`, and existing `/security`
- Supabase Auth (email/password + Google OAuth)
- Row Level Security on core tables; Space membership / collaborator model
- Document upload to Supabase Storage; HTTPS/TLS in transit
- Document analysis via Anthropic Claude; embeddings via OpenAI; chat may use Claude and/or DeepSeek-compatible endpoints
- Fact source labels: “From your document” / “Calculated” / “AI suggestion”
- Document deletion and Space deletion in-product
- Account deletion via Settings / `POST /api/account/delete` (requires service role)
- Stripe checkout + Customer Portal when billing env is configured
- PostHog analytics when `NEXT_PUBLIC_POSTHOG_KEY` is set
- Sentry when configured; Resend for email when configured
- Signup consent checkbox (not pre-checked) + profile fields for terms/privacy/AI notice versions
- Soft first-use AI notice on Ask Gideon / Home; Gideon composer footer link to AI Disclaimer
- Existing users are not locked out if legal columns are missing (APIs degrade gracefully)

## Needs verification (NM2TECH / ops confirmation)

- Whether Anthropic, OpenAI, and DeepSeek (if used in production) are on zero-retention / no-training API terms for Guardian traffic
- Exact production data residency and backup retention periods for Supabase projects
- Whether PostHog is enabled in production and whether a cookie/consent banner is required for target markets
- Alignment of `security@guardian.app` vs `support@nm2tech.com` as public contacts
- Cascade completeness of account deletion against newer tables (space conversations, ontology, product_events, etc.)
- Whether optional processors (Tavily, Twilio, Google Drive) are enabled in production and must be listed as always-on
- Encryption-at-rest details provided by Supabase/hosting (app only claims TLS + limited field encryption for intake SSN)

## Legal review required (attorney)

- Full Privacy Policy and Terms of Use wording before public marketing as binding legal documents
- Governing law / venue (currently drafted as Maryland — confirm)
- Limitation of liability and indemnification clauses
- Subscription cancellation and refund policy (product code does not define a fixed refund window)
- Children’s privacy age thresholds by jurisdiction
- CCPA/GDPR/UK GDPR disclosures and automated rights-request processes
- Whether material updates to Terms should force re-acceptance for existing users (versioning is ready; enforcement policy is not)
- Professional-advice and high-stakes disclaimers sufficiency for regulated-use edge cases
- Subprocessor list accuracy and DPA needs with Stripe, Supabase, Anthropic, OpenAI, etc.

## Explicit non-claims (do not market these)

- End-to-end / zero-knowledge encryption for all vault content
- HIPAA / FERPA / PCI / FedRAMP / SOC 2 unless separately established
- “Data never leaves Guardian”
- Absolute breach immunity
- Guaranteed AI accuracy
