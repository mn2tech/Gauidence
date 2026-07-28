-- Viewer collaborators: read-only vault access (documents, Gideon search).
-- Editors keep add/edit/delete; viewers use can_access without can_edit.

alter table public.guardian_profile_members
  drop constraint if exists guardian_profile_members_role_check;

alter table public.guardian_profile_members
  add constraint guardian_profile_members_role_check
  check (role in ('owner', 'editor', 'viewer'));

alter table public.guardian_profile_invitations
  drop constraint if exists guardian_profile_invitations_role_check;

alter table public.guardian_profile_invitations
  add constraint guardian_profile_invitations_role_check
  check (role in ('editor', 'viewer'));

-- Membership management: owners may invite/update editors or viewers.
drop policy if exists "Owners can insert memberships" on public.guardian_profile_members;
create policy "Owners can insert memberships"
  on public.guardian_profile_members for insert
  with check (
    public.can_manage_guardian_profile(profile_id)
    and role in ('editor', 'viewer')
  );

drop policy if exists "Owners can update memberships" on public.guardian_profile_members;
create policy "Owners can update memberships"
  on public.guardian_profile_members for update
  using (
    public.can_manage_guardian_profile(profile_id)
    and role in ('editor', 'viewer')
  )
  with check (
    public.can_manage_guardian_profile(profile_id)
    and role in ('editor', 'viewer')
  );

drop policy if exists "Owners can delete editor memberships" on public.guardian_profile_members;
create policy "Owners can delete collaborator memberships"
  on public.guardian_profile_members for delete
  using (
    role in ('editor', 'viewer')
    and (
      public.can_manage_guardian_profile(profile_id)
      or user_id = auth.uid()
    )
  );
