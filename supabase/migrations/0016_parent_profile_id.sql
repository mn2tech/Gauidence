-- Link employee (and similar) profiles to a parent org profile.
-- Safe to re-run.

alter table public.guardian_profiles
  add column if not exists parent_profile_id uuid
    references public.guardian_profiles (id) on delete set null;

create index if not exists guardian_profiles_parent_idx
  on public.guardian_profiles (parent_profile_id)
  where parent_profile_id is not null;

-- Parent must belong to the same account (enforced in app; soft guard here).
create or replace function public.guardian_profiles_parent_same_owner()
returns trigger
language plpgsql
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

drop trigger if exists guardian_profiles_parent_same_owner_trg
  on public.guardian_profiles;

create trigger guardian_profiles_parent_same_owner_trg
  before insert or update of parent_profile_id, owner_user_id
  on public.guardian_profiles
  for each row
  execute function public.guardian_profiles_parent_same_owner();
