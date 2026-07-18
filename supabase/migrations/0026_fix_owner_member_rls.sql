-- Correct owner-membership bootstrap (0025 used SET row_security = off,
-- which does NOT bypass RLS and can make profile creation fail harder).
-- Safe to re-run.

-- Helper: check vault ownership without being blocked by membership SELECT RLS.
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

-- Recreate trigger function WITHOUT row_security = off.
-- Superuser/owner SECURITY DEFINER already bypasses RLS on inserts.
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

create or replace function public.guardian_profiles_parent_same_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.parent_profile_id is null then
    return new;
  end if;
  if new.parent_profile_id = new.id then
    raise exception 'Profile cannot be its own parent';
  end if;
  if not exists (
    select 1
    from public.guardian_profiles p
    where p.id = new.parent_profile_id
      and p.owner_user_id = new.owner_user_id
  ) then
    raise exception 'Parent profile must belong to the same account';
  end if;
  return new;
end;
$$;

-- Replace circular owner-membership insert policy.
drop policy if exists "Owners can insert own owner membership" on public.guardian_profile_members;
create policy "Owners can insert own owner membership"
  on public.guardian_profile_members for insert
  with check (
    role = 'owner'
    and user_id = auth.uid()
    and public.is_guardian_profile_owner(profile_id)
  );

-- Repair missing owner memberships.
insert into public.guardian_profile_members (profile_id, user_id, role, invited_by)
select gp.id, gp.owner_user_id, 'owner', gp.owner_user_id
from public.guardian_profiles gp
on conflict (profile_id, user_id) do nothing;
