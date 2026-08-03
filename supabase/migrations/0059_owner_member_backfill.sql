-- Backfill owner rows in guardian_profile_members (fixes vault activity emails when only collaborators were members).

insert into public.guardian_profile_members (profile_id, user_id, role, invited_by)
select gp.id, gp.owner_user_id, 'owner', gp.owner_user_id
from public.guardian_profiles gp
where gp.owner_user_id is not null
  and not exists (
    select 1
    from public.guardian_profile_members m
    where m.profile_id = gp.id
      and m.user_id = gp.owner_user_id
  )
on conflict (profile_id, user_id) do nothing;
