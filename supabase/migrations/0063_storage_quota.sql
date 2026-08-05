-- Enforce per-account vault storage limits on document insert.
-- Limits mirror src/lib/billing/plans.ts storageBytes.

create or replace function public.storage_limit_bytes_for_plan(plan text)
returns bigint
language sql
immutable
as $$
  select case coalesce(plan, 'free')
    when 'personal' then 10737418240::bigint   -- 10 GB
    when 'family' then 26843545600::bigint     -- 25 GB
    when 'business' then 53687091200::bigint   -- 50 GB
    else 1073741824::bigint                  -- 1 GB free
  end;
$$;

create or replace function public.enforce_document_storage_quota()
returns trigger
language plpgsql
as $$
declare
  account_id uuid;
  used_bytes bigint;
  plan_limit bigint;
  user_plan text;
begin
  begin
    account_id := split_part(new.file_path, '/', 1)::uuid;
  exception
    when others then
      return new;
  end;

  select coalesce(sum(size_bytes), 0)
    into used_bytes
  from public.documents
  where file_path like account_id::text || '/%';

  select plan into user_plan
  from public.profiles
  where id = account_id;

  plan_limit := public.storage_limit_bytes_for_plan(user_plan);

  if used_bytes + new.size_bytes > plan_limit then
    raise exception 'storage_limit_exceeded'
      using
        errcode = 'P0001',
        message = 'Vault storage limit reached for this account.';
  end if;

  return new;
end;
$$;

drop trigger if exists documents_storage_quota on public.documents;
create trigger documents_storage_quota
  before insert on public.documents
  for each row
  execute function public.enforce_document_storage_quota();

comment on function public.storage_limit_bytes_for_plan(text) is
  'Returns vault storage cap in bytes for a billing plan id.';
