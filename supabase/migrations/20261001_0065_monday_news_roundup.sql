-- A frozen Monday digest reuses source-backed research; no provider calls.
alter table public.report_documents drop constraint if exists report_documents_kind_check;
alter table public.report_documents add constraint report_documents_kind_check check(kind in ('weekly','research','evaluation','qa'));

create or replace function public.report_news_roundup_receipt_v1(p_workspace_id uuid,p_period_start date)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_row public.report_documents%rowtype;
begin
  if p_workspace_id is null or p_period_start is null or extract(isodow from p_period_start)<>1
    or p_period_start+6>=(now() at time zone 'Asia/Seoul')::date then return jsonb_build_object('status','invalid-input');end if;
  select * into v_row from public.report_documents where workspace_id=p_workspace_id and source_key='news-weekly:'||p_period_start::text;
  if not found then return jsonb_build_object('status','not-found');end if;
  return jsonb_build_object('status','duplicate','reportId',v_row.id,'revision',v_row.revision);
end;$$;

create or replace function public.report_news_roundup_sources_v1(p_workspace_id uuid,p_period_start date)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_rows jsonb;
begin
  if p_workspace_id is null or p_period_start is null or extract(isodow from p_period_start)<>1
    or p_period_start+6>=(now() at time zone 'Asia/Seoul')::date then return jsonb_build_object('status','invalid-input');end if;
  select coalesce(jsonb_agg(item order by created_at desc,id desc),'[]'::jsonb) into v_rows from (
    select b.id,b.created_at,jsonb_build_object('id',b.id,'createdAt',b.created_at,'state',b.state,'brandSlug',brand.slug,'payload',r.payload) item
    from public.research_briefs b join public.brands brand on brand.id=b.brand_id and brand.workspace_id=b.workspace_id
    join public.research_brief_revisions r on r.brief_id=b.id and r.workspace_id=b.workspace_id and r.revision=b.latest_revision
    where b.workspace_id=p_workspace_id and b.state<>'discarded' and brand.status='active' and brand.slug in ('politicofficer','classmoon','22nomad')
      and b.created_at>=p_period_start::timestamp at time zone 'Asia/Seoul'
      and b.created_at<(p_period_start+7)::timestamp at time zone 'Asia/Seoul'
    order by b.created_at desc,b.id desc limit 101
  ) rows;
  return jsonb_build_object('status','live','entries',v_rows);
end;$$;

create or replace function public.report_news_roundup_save_v1(p_workspace_id uuid,p_period_start date,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_row public.report_documents%rowtype;v_key text;v_ids uuid[];v_count integer;
begin
  if p_workspace_id is null or p_period_start is null or extract(isodow from p_period_start)<>1
    or p_period_start+6>=(now() at time zone 'Asia/Seoul')::date
    or jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>160000
    or p_payload->>'origin' is distinct from 'monday-news-roundup'
    or p_payload->>'periodStart' is distinct from p_period_start::text or p_payload->>'periodEnd' is distinct from (p_period_start+6)::text
    or p_payload->>'artifactKind' is distinct from 'markdown' or coalesce(p_payload->>'status','') not in ('live','partial')
    or jsonb_typeof(p_payload->'facts') is distinct from 'object' or p_payload->'facts'->>'verificationLevel' is distinct from 'unreviewed'
    or jsonb_typeof(p_payload->'facts'->'facts') is distinct from 'array'
    or jsonb_typeof(p_payload->'interpretation') is distinct from 'string' or length(p_payload->>'interpretation') not between 1 and 40000
    or jsonb_typeof(p_payload->'briefIds') is distinct from 'array' or jsonb_typeof(p_payload->'sourceRefs') is distinct from 'array' then
    return jsonb_build_object('status','invalid-input');end if;
  if jsonb_array_length(p_payload->'briefIds') not between 1 and 15 or jsonb_array_length(p_payload->'sourceRefs') not between 1 and 16
    or jsonb_array_length(p_payload->'facts'->'facts') not between 1 and 15 then
    return jsonb_build_object('status','invalid-input');end if;
  v_key:='news-weekly:'||p_period_start::text;
  perform pg_advisory_xact_lock(hashtextextended('report-source:'||p_workspace_id::text||':'||v_key,0));
  select * into v_row from public.report_documents where workspace_id=p_workspace_id and source_key=v_key;
  if found then return jsonb_build_object('status','duplicate','reportId',v_row.id,'revision',v_row.revision);end if;
  select array_agg(value::uuid) into v_ids from jsonb_array_elements_text(p_payload->'briefIds');
  select count(distinct b.id) into v_count from public.research_briefs b join public.brands brand on brand.id=b.brand_id and brand.workspace_id=b.workspace_id
    where b.workspace_id=p_workspace_id and b.id=any(v_ids) and b.state<>'discarded' and brand.status='active' and brand.slug in ('politicofficer','classmoon','22nomad')
      and b.created_at>=p_period_start::timestamp at time zone 'Asia/Seoul'
      and b.created_at<(p_period_start+7)::timestamp at time zone 'Asia/Seoul';
  if v_count is distinct from cardinality(v_ids) then return jsonb_build_object('status','invalid-input');end if;
  insert into public.report_documents(workspace_id,source_key,kind,scope,title,payload)
    values(p_workspace_id,v_key,'research','content','월요일 주요 소식 · '||p_period_start::text||' — '||(p_period_start+6)::text,p_payload) returning * into v_row;
  return jsonb_build_object('status','saved','reportId',v_row.id,'revision',v_row.revision);
exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then return jsonb_build_object('status','invalid-input');
end;$$;
revoke all on function public.report_news_roundup_receipt_v1(uuid,date),public.report_news_roundup_sources_v1(uuid,date),public.report_news_roundup_save_v1(uuid,date,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.report_news_roundup_receipt_v1(uuid,date),public.report_news_roundup_sources_v1(uuid,date),public.report_news_roundup_save_v1(uuid,date,jsonb) to service_role;
