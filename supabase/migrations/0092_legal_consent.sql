-- Legal consent + AI acknowledgment tracking for subscription-based Guardian.
-- Non-destructive: existing users are not locked out; re-ack can be prompted later.

alter table public.profiles
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists terms_version text,
  add column if not exists privacy_acknowledged_at timestamptz,
  add column if not exists privacy_version text,
  add column if not exists ai_notice_acknowledged_at timestamptz,
  add column if not exists ai_notice_version text;

comment on column public.profiles.terms_accepted_at is
  'When the user accepted the Terms of Use (signup or later acknowledgment).';

comment on column public.profiles.terms_version is
  'LEGAL_VERSIONS.terms value accepted by the user.';

comment on column public.profiles.privacy_acknowledged_at is
  'When the user acknowledged the Privacy Policy.';

comment on column public.profiles.privacy_version is
  'LEGAL_VERSIONS.privacy value acknowledged by the user.';

comment on column public.profiles.ai_notice_acknowledged_at is
  'When the user acknowledged the first-use Gideon AI notice.';

comment on column public.profiles.ai_notice_version is
  'LEGAL_VERSIONS.aiDisclaimer value acknowledged for the in-product AI notice.';
