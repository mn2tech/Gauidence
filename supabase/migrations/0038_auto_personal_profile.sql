-- Give every new account a default personal "Myself" vault on signup,
-- so users land in the app ready to use Gideon without a setup step.
-- Reverses 0020_no_auto_myself_profile.sql. Safe to re-run.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_gp_id uuid;
  display text;
begin
  display := coalesce(
    nullif(trim(coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name'
    )), ''),
    split_part(coalesce(new.email, 'Me'), '@', 1),
    'Me'
  );

  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name'
    ),
    coalesce(
      new.raw_user_meta_data ->> 'avatar_url',
      new.raw_user_meta_data ->> 'picture'
    )
  )
  on conflict (id) do nothing;

  select id into new_gp_id
  from public.guardian_profiles
  where owner_user_id = new.id and is_default = true
  limit 1;

  if new_gp_id is null then
    insert into public.guardian_profiles (
      owner_user_id,
      profile_type,
      display_name,
      relationship,
      is_default
    )
    values (new.id, 'personal', display, 'Myself', true)
    returning id into new_gp_id;
  end if;

  if new_gp_id is not null then
    insert into public.guardian_profile_members (profile_id, user_id, role, invited_by)
    values (new_gp_id, new.id, 'owner', new.id)
    on conflict (profile_id, user_id) do nothing;

    update public.profiles
    set active_guardian_profile_id = coalesce(active_guardian_profile_id, new_gp_id)
    where id = new.id;
  end if;

  return new;
end;
$$;
