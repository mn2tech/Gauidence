-- Allow owners to update/move objects in their documents folder.
-- Needed for storage.move(); safe to re-run.
-- Run in the Supabase SQL Editor.

drop policy if exists "Users can update own document files" on storage.objects;

create policy "Users can update own document files"
  on storage.objects for update
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
