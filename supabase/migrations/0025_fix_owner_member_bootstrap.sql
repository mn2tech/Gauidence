-- Fix profile creation after shared-vault migration.
-- The owner-membership trigger must bypass RLS, and owners need a policy
-- that allows inserting their own owner membership row.
-- Safe to re-run.

create or replace function public.guardian_profiles_ensure_owner_member()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  insert into public.guardian_profile_members (profile_id, user_id, role, invited_by)
  values (new.id, new.owner_user_id, 'owner', new.owner_user_id)
  on conflict (profile_id, user_id) do update
    set role = 'owner';
  return new;
end;
$$;

revoke all on function public.guardian_profiles_ensure_owner_member() from public;
grant execute on function public.guardian_profiles_ensure_owner_member() to postgres, service_role;

-- Allow creating the owner membership for a vault you own (bootstrap + repair).
drop policy if exists "Owners can insert own owner membership" on public.guardian_profile_members;
create policy "Owners can insert own owner membership"
  on public.guardian_profile_members for insert
  with check (
    role = 'owner'
    and user_id = auth.uid()
    and exists (
      select 1
      from public.guardian_profiles gp
      where gp.id = profile_id
        and gp.owner_user_id = auth.uid()
    )
  );

-- Parent-same-owner check must see the parent even when SELECT is membership-gated.
create or replace function public.guardian_profiles_parent_same_owner()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
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

-- Repair: ensure every vault has an owner membership row.
insert into public.guardian_profile_members (profile_id, user_id, role, invited_by)
select gp.id, gp.owner_user_id, 'owner', gp.owner_user_id
from public.guardian_profiles gp
on conflict (profile_id, user_id) do nothing;
