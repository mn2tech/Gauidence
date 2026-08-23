-- Share Trello / Google Drive connections with space members.
-- Device storage stays owner-only (auth.uid() = user_id).
-- Rollback: drop the policies added below.

drop policy if exists "Profile members can view shared space connectors"
  on public.connected_sources;
create policy "Profile members can view shared space connectors"
  on public.connected_sources for select
  using (
    profile_id is not null
    and source_type in ('trello', 'google_drive')
    and public.can_access_guardian_profile(profile_id)
  );

drop policy if exists "Editors can update shared space connectors"
  on public.connected_sources;
create policy "Editors can update shared space connectors"
  on public.connected_sources for update
  using (
    profile_id is not null
    and source_type in ('trello', 'google_drive')
    and public.can_edit_guardian_profile(profile_id)
  )
  with check (
    profile_id is not null
    and source_type in ('trello', 'google_drive')
    and public.can_edit_guardian_profile(profile_id)
  );

drop policy if exists "Profile members can view shared connector items"
  on public.source_items;
create policy "Profile members can view shared connector items"
  on public.source_items for select
  using (
    exists (
      select 1
      from public.connected_sources cs
      where cs.id = source_items.source_id
        and cs.profile_id is not null
        and cs.source_type in ('trello', 'google_drive')
        and public.can_access_guardian_profile(cs.profile_id)
    )
  );

drop policy if exists "Editors can insert shared connector items"
  on public.source_items;
create policy "Editors can insert shared connector items"
  on public.source_items for insert
  with check (
    exists (
      select 1
      from public.connected_sources cs
      where cs.id = source_items.source_id
        and cs.profile_id is not null
        and cs.source_type in ('trello', 'google_drive')
        and public.can_edit_guardian_profile(cs.profile_id)
    )
  );

drop policy if exists "Editors can update shared connector items"
  on public.source_items;
create policy "Editors can update shared connector items"
  on public.source_items for update
  using (
    exists (
      select 1
      from public.connected_sources cs
      where cs.id = source_items.source_id
        and cs.profile_id is not null
        and cs.source_type in ('trello', 'google_drive')
        and public.can_edit_guardian_profile(cs.profile_id)
    )
  )
  with check (
    exists (
      select 1
      from public.connected_sources cs
      where cs.id = source_items.source_id
        and cs.profile_id is not null
        and cs.source_type in ('trello', 'google_drive')
        and public.can_edit_guardian_profile(cs.profile_id)
    )
  );

drop policy if exists "Editors can delete shared connector items"
  on public.source_items;
create policy "Editors can delete shared connector items"
  on public.source_items for delete
  using (
    exists (
      select 1
      from public.connected_sources cs
      where cs.id = source_items.source_id
        and cs.profile_id is not null
        and cs.source_type in ('trello', 'google_drive')
        and public.can_edit_guardian_profile(cs.profile_id)
    )
  );

comment on table public.connected_sources is
  'External data connectors. Trello/Google Drive bound to a space are visible to space members; device storage is owner-only.';
