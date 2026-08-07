-- Allow business editors (not only owners) to delete proposals they manage.

drop policy if exists "Business owners can delete proposals" on public.proposals;

drop policy if exists "Business editors can delete proposals" on public.proposals;
create policy "Business editors can delete proposals"
  on public.proposals for delete
  using (public.can_edit_guardian_profile(business_profile_id));
