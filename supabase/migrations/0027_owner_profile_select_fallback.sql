-- Allow owners to always see/manage their own vaults even without a membership
-- row, while shared editors still use membership. Safe to re-run.

drop policy if exists "Members can view accessible guardian profiles" on public.guardian_profiles;
create policy "Members can view accessible guardian profiles"
  on public.guardian_profiles for select
  using (
    owner_user_id = auth.uid()
    or public.can_access_guardian_profile(id)
  );

drop policy if exists "Owners can update own guardian profiles" on public.guardian_profiles;
create policy "Owners can update own guardian profiles"
  on public.guardian_profiles for update
  using (
    owner_user_id = auth.uid()
    or public.can_manage_guardian_profile(id)
  )
  with check (owner_user_id = auth.uid());

drop policy if exists "Owners can delete own guardian profiles" on public.guardian_profiles;
create policy "Owners can delete own guardian profiles"
  on public.guardian_profiles for delete
  using (
    owner_user_id = auth.uid()
    or public.can_manage_guardian_profile(id)
  );

-- Ensure owner-membership trigger is healthy (no row_security = off).
create or replace function public.guardian_profiles_ensure_owner_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.guardian_profile_members (profile_id, user_id, role, invited_by)
  values (new.id, new.owner_user_id, 'owner', new.owner_user_id)
  on conflict (profile_id, user_id) do update
    set role = 'owner';
  return new;
end;
$$;

drop trigger if exists guardian_profiles_ensure_owner_member on public.guardian_profiles;
create trigger guardian_profiles_ensure_owner_member
  after insert on public.guardian_profiles
  for each row
  execute function public.guardian_profiles_ensure_owner_member();

create or replace function public.is_guardian_profile_owner(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.guardian_profiles gp
    where gp.id = p_profile_id
      and gp.owner_user_id = auth.uid()
  );
$$;

revoke all on function public.is_guardian_profile_owner(uuid) from public;
grant execute on function public.is_guardian_profile_owner(uuid) to authenticated;

drop policy if exists "Owners can insert own owner membership" on public.guardian_profile_members;
create policy "Owners can insert own owner membership"
  on public.guardian_profile_members for insert
  with check (
    role = 'owner'
    and user_id = auth.uid()
    and public.is_guardian_profile_owner(profile_id)
  );

insert into public.guardian_profile_members (profile_id, user_id, role, invited_by)
select gp.id, gp.owner_user_id, 'owner', gp.owner_user_id
from public.guardian_profiles gp
on conflict (profile_id, user_id) do nothing;
