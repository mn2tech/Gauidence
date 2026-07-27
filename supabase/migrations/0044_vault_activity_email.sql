-- Email preference for shared-vault activity (document / Daily Log added by a collaborator).

alter table public.profiles
  add column if not exists email_vault_activity_enabled boolean not null default true;

comment on column public.profiles.email_vault_activity_enabled is
  'When true, email the user when another member adds a document or Daily Log to a shared vault they belong to.';
