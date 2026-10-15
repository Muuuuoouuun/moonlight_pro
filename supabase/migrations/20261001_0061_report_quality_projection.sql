-- Keep report reading faithful to the saved Office content and its limits.
-- Successful unexpired actor/workspace scoping and private input exclusions remain.

create or replace function public.report_office_weeklies_v1(p_workspace_id uuid,p_actor_id text,p_limit integer default 51)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_rows jsonb;
begin
  if p_workspace_id is null or coalesce(p_actor_id,'') !~ '^[a-zA-Z0-9._:@/-]{1,128}$' then return jsonb_build_object('status','error','reports','[]'::jsonb);end if;
  select coalesce(jsonb_agg(item order by created_at desc,id desc),'[]'::jsonb) into v_rows from (
    select id,created_at,jsonb_build_object('id',id,'scope',scope,'origin_ref',origin_ref,'created_at',created_at,
      'result',jsonb_build_object('summary',result->>'summary','artifact',result->'artifact','evidence',result->'evidence','nextStep',result->'nextStep','uncertainties',result->'uncertainties','dissent',result->'dissent','sourceCheck',result->'sourceCheck','context',jsonb_build_object('missing',result->'context'->'missing'))) as item
    from public.office_requests where workspace_id=p_workspace_id and actor_id=p_actor_id and intent='weekly_report' and state='generated' and expires_at>now()
    order by created_at desc,id desc limit greatest(1,least(coalesce(p_limit,51),101))
  ) rows;
  return jsonb_build_object('status','live','reports',v_rows);
end;$$;


create or replace function public.report_archive_v1(p_workspace_id uuid,p_actor_id text,p_limit integer default 100,p_before jsonb default null,p_ref text default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_rows jsonb;v_items jsonb;v_cursor jsonb;v_time timestamptz;v_ref text;
begin
  if p_workspace_id is null or coalesce(p_actor_id,'') !~ '^[a-zA-Z0-9._:@/-]{1,128}$' or p_limit is null or p_limit not between 1 and 100
    or (p_ref is not null and p_ref !~ '^(stored|research|office):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then
    return jsonb_build_object('status','invalid-input','items','[]'::jsonb);end if;
  if p_before is not null then
    if jsonb_typeof(p_before) is distinct from 'object' then return jsonb_build_object('status','invalid-input','items','[]'::jsonb);end if;
    v_time:=(p_before->>'createdAt')::timestamptz;v_ref:=p_before->>'id';
    if v_time is null or coalesce(v_ref,'') !~ '^(stored|research|office):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      return jsonb_build_object('status','invalid-input','items','[]'::jsonb);end if;
  end if;
  with reports as (
    select d.created_at,'stored:'||d.id::text as ref,'snapshot'::text as source,
      to_jsonb(d)-array['workspace_id','source_key','updated_at'] as row
      from public.report_documents d where d.workspace_id=p_workspace_id
    union all
    select r.created_at,'research:'||r.id::text,'research',b.payload||jsonb_build_object('id',r.id,'brandId',r.brand_id,'createdAt',r.created_at,'state',r.state,
      'promotion',(select jsonb_build_object('content_id',p.content_id,'variant_id',p.variant_id,'destination',p.destination) from public.research_promotions p where p.workspace_id=p_workspace_id and p.brief_id=r.id limit 1))
      from public.research_briefs r join public.research_brief_revisions b on b.brief_id=r.id and b.workspace_id=r.workspace_id and b.revision=r.latest_revision
      where r.workspace_id=p_workspace_id
    union all
    select o.created_at,'office:'||o.id::text,'office',jsonb_build_object('id',o.id,'scope',o.scope,'origin_ref',o.origin_ref,'created_at',o.created_at,
      'result',jsonb_build_object('summary',o.result->>'summary','artifact',o.result->'artifact','evidence',o.result->'evidence','nextStep',o.result->'nextStep','uncertainties',o.result->'uncertainties','dissent',o.result->'dissent','sourceCheck',o.result->'sourceCheck','context',jsonb_build_object('missing',o.result->'context'->'missing')))
      from public.office_requests o where o.workspace_id=p_workspace_id and o.actor_id=p_actor_id and o.intent='weekly_report' and o.state='generated' and o.expires_at>now()
  ), page as (
    select * from reports where (p_ref is null or ref=p_ref) and (p_ref is not null or p_before is null or (created_at,ref)<(v_time,v_ref))
      order by created_at desc,ref desc limit p_limit+1
  ) select coalesce(jsonb_agg(jsonb_build_object('source',source,'ref',ref,'createdAt',created_at,'row',row) order by created_at desc,ref desc),'[]'::jsonb) into v_rows from page;
  select coalesce(jsonb_agg(value order by ordinality),'[]'::jsonb) into v_items from jsonb_array_elements(v_rows) with ordinality where ordinality<=p_limit;
  if p_ref is null and jsonb_array_length(v_rows)>p_limit then v_cursor:=jsonb_build_object('createdAt',v_items->(p_limit-1)->>'createdAt','id',v_items->(p_limit-1)->>'ref');end if;
  return jsonb_build_object('status','live','items',v_items,'nextCursor',v_cursor);
exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
  return jsonb_build_object('status','invalid-input','items','[]'::jsonb);
end;$$;


revoke all on function public.report_office_weeklies_v1(uuid,text,integer),public.report_archive_v1(uuid,text,integer,jsonb,text) from public,anon,authenticated,service_role;
grant execute on function public.report_office_weeklies_v1(uuid,text,integer),public.report_archive_v1(uuid,text,integer,jsonb,text) to service_role;
