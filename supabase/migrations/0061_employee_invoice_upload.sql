-- Allow employees with invoice_upload entitlement to add documents without full editor access.

create or replace function public.can_employee_upload_invoice(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.employee_hub_entitlements e
    join public.guardian_profiles gp on gp.id = e.employee_profile_id
    where e.employee_profile_id = p_profile_id
      and e.invoice_upload = true
      and gp.profile_type = 'employee'
      and public.can_access_guardian_profile(p_profile_id)
  );
$$;

revoke all on function public.can_employee_upload_invoice(uuid) from public;
grant execute on function public.can_employee_upload_invoice(uuid) to authenticated;

drop policy if exists "Editors can insert vault documents" on public.documents;
create policy "Editors can insert vault documents"
  on public.documents for insert
  with check (
    auth.uid() = user_id
    and (
      public.can_edit_guardian_profile(profile_id)
      or public.can_employee_upload_invoice(profile_id)
    )
  );

drop policy if exists "Editors can insert vault extracted data" on public.extracted_data;
create policy "Editors can insert vault extracted data"
  on public.extracted_data for insert
  with check (
    auth.uid() = user_id
    and (
      public.can_edit_guardian_profile(profile_id)
      or public.can_employee_upload_invoice(profile_id)
    )
  );

drop policy if exists "Editors can update vault extracted data" on public.extracted_data;
create policy "Editors can update vault extracted data"
  on public.extracted_data for update
  using (
    public.can_edit_guardian_profile(profile_id)
    or public.can_employee_upload_invoice(profile_id)
  )
  with check (
    public.can_edit_guardian_profile(profile_id)
    or public.can_employee_upload_invoice(profile_id)
  );

drop policy if exists "Members can upload vault documents" on storage.objects;
create policy "Members can upload vault documents"
  on storage.objects for insert
  with check (
    bucket_id = 'documents'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or (
        (storage.foldername(name))[2] is not null
        and (
          public.can_edit_guardian_profile(((storage.foldername(name))[2])::uuid)
          or public.can_employee_upload_invoice(((storage.foldername(name))[2])::uuid)
        )
      )
    )
  );

drop policy if exists "Editors can insert vault alerts" on public.alerts;
create policy "Editors can insert vault alerts"
  on public.alerts for insert
  with check (
    auth.uid() = user_id
    and (
      public.can_edit_guardian_profile(profile_id)
      or public.can_employee_upload_invoice(profile_id)
    )
  );

drop policy if exists "Editors can insert vault document chunks" on public.document_chunks;
create policy "Editors can insert vault document chunks"
  on public.document_chunks for insert
  with check (
    auth.uid() = user_id
    and (
      public.can_edit_guardian_profile(profile_id)
      or public.can_employee_upload_invoice(profile_id)
    )
  );

drop policy if exists "Editors can update vault document chunks" on public.document_chunks;
create policy "Editors can update vault document chunks"
  on public.document_chunks for update
  using (
    public.can_edit_guardian_profile(profile_id)
    or public.can_employee_upload_invoice(profile_id)
  )
  with check (
    public.can_edit_guardian_profile(profile_id)
    or public.can_employee_upload_invoice(profile_id)
  );
