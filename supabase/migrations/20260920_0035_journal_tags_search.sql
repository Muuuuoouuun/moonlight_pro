-- Add free-tag matches to general-note discovery. Existing note_meta JSON, writes,
-- revision snapshots and receipts already preserve tags; no table rewrite needed.
-- Apply after 0030. Keep the signature, cursor ordering and service-only rights.
begin;

create or replace function public.journal_search_v1(
  p_workspace_id uuid,
  p_query text default '',
  p_date_from timestamptz default null,
  p_date_to timestamptz default null,
  p_kind text default '',
  p_context_type text default '',
  p_context_id uuid default null,
  p_used text default 'all',
  p_before timestamptz default null,
  p_before_id uuid default null,
  p_limit integer default 40
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_context jsonb := null; v_entries jsonb; v_query text := lower(p_query);
begin
  if p_workspace_id is null or not exists(select 1 from public.workspaces where id=p_workspace_id)
    or p_query is null or length(p_query)>200 or p_kind is null or p_kind not in ('','note','conversation','idea','learning','blocked','decision')
    or p_context_type is null or p_context_type not in ('','project','lead','account','brand')
    or (p_context_type='') is distinct from (p_context_id is null)
    or p_used is null or p_used not in ('all','used','unused') or p_limit is null or p_limit not in (3,40)
    or (p_before is null) is distinct from (p_before_id is null)
    or (p_date_from is not null and p_date_to is not null and p_date_from>=p_date_to)
    or (p_date_from is not null and not isfinite(p_date_from)) or (p_date_to is not null and not isfinite(p_date_to))
    or (p_before is not null and not isfinite(p_before)) then
    return jsonb_build_object('status','error','error','invalid-input','context',null,'entries','[]'::jsonb);
  end if;
  if p_context_id is not null then
    v_context := public.journal_context_v1(p_workspace_id,p_context_type,p_context_id);
    if v_context is null then return jsonb_build_object('status','error','error','context-unavailable','context',null,'entries','[]'::jsonb); end if;
  end if;

  with candidates as (
    select e.*, exists(select 1 from public.journal_links u where u.workspace_id=p_workspace_id and u.journal_id=e.id and u.link_kind='use') as used,
      strpos(lower(coalesce(e.title,'')),v_query) as title_pos,
      strpos(lower(e.body),v_query) as body_pos,
      strpos(lower(coalesce(e.note_meta->>'enhancement','')),v_query) as enhancement_pos,
      (select tag.value #>> '{}' from jsonb_array_elements(
        case when jsonb_typeof(e.note_meta->'tags')='array' then e.note_meta->'tags' else '[]'::jsonb end
      ) with ordinality as tag(value,position)
        where jsonb_typeof(tag.value)='string' and strpos(lower(tag.value #>> '{}'),v_query)>0
        order by tag.position limit 1) as matched_tag
    from public.journal_entries e
    where e.workspace_id=p_workspace_id and e.entry_kind='note'
      and (p_date_from is null or e.occurred_at>=p_date_from)
      and (p_date_to is null or e.occurred_at<p_date_to)
      and (p_kind='' or e.note_meta->>'kind'=p_kind)
      and (p_before is null or (e.occurred_at,e.id)<(p_before,p_before_id))
      and (p_context_id is null or exists(select 1 from public.journal_links c where c.workspace_id=p_workspace_id
        and c.journal_id=e.id and c.link_kind='context' and c.target_type=p_context_type and c.target_id=p_context_id))
  ), page as (
    select * from candidates where (p_query='' or title_pos>0 or body_pos>0 or enhancement_pos>0 or matched_tag is not null)
      and (p_used='all' or (p_used='used' and used) or (p_used='unused' and not used))
    order by occurred_at desc,id desc limit p_limit+1
  ), summaries as (
    select id,occurred_at,jsonb_build_object(
      'workspace_id',workspace_id,'entry_kind',entry_kind,'id',id,'title',coalesce(title,''),'excerpt',left(body,180),
      'occurredAt',occurred_at,'updatedAt',updated_at,'noteMeta',jsonb_build_object('kind',note_meta->>'kind'),
      'revision',note_revision,'used',used,'match',case when p_query='' then null else jsonb_build_object(
        'field',case when title_pos>0 then 'title' when body_pos>0 then 'body' when enhancement_pos>0 then 'enhancement' else 'tags' end,
        'text',substring(case when title_pos>0 then title when body_pos>0 then body when enhancement_pos>0 then note_meta->>'enhancement' else matched_tag end
          from greatest(1,(case when title_pos>0 then title_pos when body_pos>0 then body_pos when enhancement_pos>0 then enhancement_pos else strpos(lower(matched_tag),v_query) end)
            -least(40,greatest(0,180-length(p_query)))) for 180)
      ) end
    ) as value from page
  )
  select coalesce(jsonb_agg(value order by occurred_at desc,id desc),'[]'::jsonb) into v_entries from summaries;
  return jsonb_build_object('status','live','workspaceId',p_workspace_id,'context',v_context,'entries',v_entries);
exception when others then
  return jsonb_build_object('status','error','error','read-failed','context',null,'entries','[]'::jsonb);
end;
$$;

revoke all on function public.journal_search_v1(uuid,text,timestamptz,timestamptz,text,text,uuid,text,timestamptz,uuid,integer) from public,anon,authenticated;
grant execute on function public.journal_search_v1(uuid,text,timestamptz,timestamptz,text,text,uuid,text,timestamptz,uuid,integer) to service_role;
commit;
