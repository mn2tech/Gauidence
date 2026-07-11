-- Vault organization: user-assignable document categories and renaming.
-- Adds the category column and the previously missing UPDATE policy so
-- owners can rename documents and set categories.
-- Run in the Supabase SQL Editor.

alter table public.documents
  add column if not exists category text;

create policy "Users can update own documents"
  on public.documents for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
