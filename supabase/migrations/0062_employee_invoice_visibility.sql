-- Employees with invoice_upload can read documents in their employee vault.
-- Without this, viewer-role employees could insert invoices but not see them
-- because client_visible defaults to false (migration 0054).

create or replace function public.can_view_vault_document_row(
  p_profile_id uuid,
  p_client_visible boolean
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_edit_guardian_profile(p_profile_id)
    or (
      public.can_access_guardian_profile(p_profile_id)
      and coalesce(p_client_visible, false)
    )
    or public.can_employee_upload_invoice(p_profile_id);
$$;
