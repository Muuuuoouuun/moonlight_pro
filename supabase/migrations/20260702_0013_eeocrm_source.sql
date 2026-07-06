-- Allow eeoCRM (Xiaoshouyi personal MCP) intake as a lead_intake_raw source (Sales OS).
-- Additive: widens the source check constraint. Safe after 0009/0010, which already
-- widened this same constraint for 'business_card' and 'inbox'.
do $$
declare c text;
begin
  select conname into c from pg_constraint
   where conrelid = 'public.lead_intake_raw'::regclass
     and pg_get_constraintdef(oid) like '%source%';
  if c is not null then
    execute format('alter table public.lead_intake_raw drop constraint %I', c);
  end if;
end $$;

alter table public.lead_intake_raw
  add constraint lead_intake_raw_source_check
  check (source in ('google_sheets', 'csv', 'manual', 'naver', 'business_card', 'inbox', 'eeocrm'));
