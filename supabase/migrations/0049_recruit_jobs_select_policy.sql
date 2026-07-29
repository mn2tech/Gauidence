-- Fix recruitment_jobs SELECT policy so creators can read rows immediately after insert.
-- The prior policy relied on can_access_recruitment_job(), which could block
-- .insert().select() even when the insert itself succeeded.

drop policy if exists "Users can view accessible recruitment jobs" on public.recruitment_jobs;
create policy "Users can view accessible recruitment jobs"
  on public.recruitment_jobs for select
  using (
    auth.uid() = owner_user_id
    or public.can_access_guardian_profile(profile_id)
    or exists (
      select 1
      from public.recruitment_job_shares s
      where s.job_id = id
        and s.user_id = auth.uid()
    )
  );
