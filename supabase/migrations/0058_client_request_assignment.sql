-- Client request assignment + viewer create + assignee access for employees.

alter table public.client_requests
  add column if not exists assigned_to_user_id uuid references auth.users (id) on delete set null;

create index if not exists client_requests_assigned_idx
  on public.client_requests (assigned_to_user_id, status, updated_at desc);

-- Viewers (invited clients) can open requests; editors/owners still manage status.
drop policy if exists "Editors can create client requests" on public.client_requests;
create policy "Members can create client requests"
  on public.client_requests for insert
  with check (
    auth.uid() = created_by
    and public.can_access_guardian_profile(profile_id)
  );

drop policy if exists "Members can view client requests" on public.client_requests;
create policy "Members can view client requests"
  on public.client_requests for select
  using (
    public.can_access_guardian_profile(profile_id)
    or assigned_to_user_id = auth.uid()
  );

drop policy if exists "Members can update client requests" on public.client_requests;
create policy "Editors can update client requests"
  on public.client_requests for update
  using (public.can_edit_guardian_profile(profile_id))
  with check (public.can_edit_guardian_profile(profile_id));

drop policy if exists "Members can view request comments" on public.client_request_comments;
create policy "Members can view request comments"
  on public.client_request_comments for select
  using (
    exists (
      select 1
      from public.client_requests r
      where r.id = request_id
        and (
          public.can_access_guardian_profile(r.profile_id)
          or r.assigned_to_user_id = auth.uid()
        )
    )
  );

drop policy if exists "Members can add request comments" on public.client_request_comments;
create policy "Members can add request comments"
  on public.client_request_comments for insert
  with check (
    auth.uid() = author_user_id
    and exists (
      select 1
      from public.client_requests r
      where r.id = request_id
        and (
          public.can_access_guardian_profile(r.profile_id)
          or r.assigned_to_user_id = auth.uid()
        )
    )
  );
