-- Personal Space display name for brand-new accounts.
-- Existing personal Spaces keep their display_name; ensureDefault still
-- prevents duplicates.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_gp_id uuid;
begin
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
  where owner_user_id = new.id
    and profile_type = 'personal'
  order by created_at asc
  limit 1;

  if new_gp_id is null then
    select id into new_gp_id
    from public.guardian_profiles
    where owner_user_id = new.id and is_default = true
    limit 1;
  end if;

  if new_gp_id is null then
    insert into public.guardian_profiles (
      owner_user_id,
      profile_type,
      display_name,
      relationship,
      is_default
    )
    values (new.id, 'personal', 'My Personal Space', 'Myself', true)
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
