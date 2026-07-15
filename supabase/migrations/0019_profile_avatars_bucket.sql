-- Public bucket for guardian profile photos / logos.
-- Safe to re-run.

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

drop policy if exists "Avatar owners can read own folder" on storage.objects;
drop policy if exists "Avatar owners can upload own folder" on storage.objects;
drop policy if exists "Avatar owners can update own folder" on storage.objects;
drop policy if exists "Avatar owners can delete own folder" on storage.objects;
drop policy if exists "Public can read avatars" on storage.objects;

-- Public read (URLs stored on guardian_profiles.avatar_url)
create policy "Public can read avatars"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "Avatar owners can upload own folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Avatar owners can update own folder"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Avatar owners can delete own folder"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
