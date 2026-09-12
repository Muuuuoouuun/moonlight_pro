-- General notes and explicit excerpt reuse. Apply after 0021, 0025 and 0026.
-- Daily-review fields, constraints, receipts and write function are unchanged.
begin;

alter table public.journal_entries
  add column if not exists note_meta jsonb not null default '{"kind":"note","enhancement":""}'::jsonb,
  add column if not exists note_revision bigint not null default 1 check (note_revision between 1 and 9007199254740991);
create unique index if not exists journal_entries_workspace_id_uidx on public.journal_entries(workspace_id,id);
create index if not exists journal_entries_note_cursor_idx on public.journal_entries(workspace_id,occurred_at desc,id desc) where entry_kind='note';

create table if not exists public.journal_note_revisions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  journal_id uuid not null,
  revision bigint not null check (revision between 1 and 9007199254740991),
  snapshot jsonb not null check (jsonb_typeof(snapshot)='object'),
  created_at timestamptz not null default clock_timestamp(),
  foreign key (workspace_id,journal_id) references public.journal_entries(workspace_id,id) on delete cascade,
  unique(workspace_id,journal_id,revision)
);
create table if not exists public.journal_links (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  journal_id uuid not null,
  link_kind text not null check (link_kind in ('context','use')),
  target_type text not null,
  target_id uuid not null,
  title text not null default '',
  href text,
  excerpt text not null default '',
  source_revision bigint not null check (source_revision between 1 and 9007199254740991),
  source_ref jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp(),
  foreign key (workspace_id,journal_id) references public.journal_entries(workspace_id,id) on delete cascade,
  check ((link_kind='context' and target_type in ('project','lead','account','brand'))
    or (link_kind='use' and target_type in ('task','content')))
);
create unique index if not exists journal_links_context_uidx on public.journal_links(workspace_id,journal_id,target_type,target_id) where link_kind='context';
create index if not exists journal_links_note_idx on public.journal_links(workspace_id,journal_id,created_at,id);
create table if not exists public.journal_workflow_receipts (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  request_id uuid not null,
  journal_id uuid not null,
  request_payload jsonb not null,
  response jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key(workspace_id,request_id),
  foreign key (workspace_id,journal_id) references public.journal_entries(workspace_id,id) on delete cascade
);

alter table public.journal_note_revisions enable row level security;
alter table public.journal_links enable row level security;
alter table public.journal_workflow_receipts enable row level security;
revoke all on public.journal_note_revisions,public.journal_links,public.journal_workflow_receipts from public,anon,authenticated;
grant select,insert,update,delete on public.journal_note_revisions,public.journal_links,public.journal_workflow_receipts to service_role;

create or replace function public.journal_note_text_v1(p_value jsonb,p_limit integer,p_required boolean default false)
returns boolean language sql immutable set search_path=pg_catalog,public as $$
  select coalesce(jsonb_typeof(p_value)='string' and length(p_value #>> '{}') <= p_limit
    and (not p_required or (p_value #>> '{}') !~ '^[[:space:]]*$'),false);
$$;
create or replace function public.journal_note_timestamp_v1(p_value text)
returns boolean language plpgsql stable set search_path=pg_catalog,public as $$
begin
  if p_value is null or p_value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.[0-9]{1,6})?(Z|[+-][0-9]{2}:[0-5][0-9])$'
    or left(p_value,4)='0000' then return false; end if;
  perform p_value::timestamptz;
  return true;
exception when datetime_field_overflow or invalid_datetime_format then return false;
end;
$$;

-- Only the four named same-workspace tables are addressable. SHARE locks keep a
-- context's workspace and deletion stable until the atomic write commits.
create or replace function public.journal_context_v1(p_workspace_id uuid,p_type text,p_id uuid)
returns jsonb language plpgsql set search_path=pg_catalog,public as $$
declare v_table text; v_name text; v_href text; v_count bigint;
begin
  v_table := case p_type when 'project' then 'projects' when 'lead' then 'leads' when 'account' then 'customer_accounts' when 'brand' then 'brands' end;
  if v_table is null then return null; end if;
  execute format('select name from public.%I where workspace_id=$1 and id=$2 for share',v_table) into v_name using p_workspace_id,p_id;
  get diagnostics v_count = row_count;
  if v_count=0 then return null; end if;
  v_href := case p_type when 'project' then '/dashboard/work/projects?project='||p_id::text
    when 'brand' then '/dashboard/brands?b='||p_id::text
    else '/dashboard/revenue/customers?customer='||p_type||'%3A'||p_id::text end;
  return jsonb_build_object('type',p_type,'id',p_id,'label',coalesce(nullif(v_name,''),'이름 없음'),'href',v_href);
end;
$$;

create or replace function public.journal_note_entry_v1(p_workspace_id uuid,p_id uuid)
returns jsonb language plpgsql set search_path=pg_catalog,public as $$
declare v_entry public.journal_entries%rowtype; v_contexts jsonb; v_links jsonb;
begin
  select * into v_entry from public.journal_entries where workspace_id=p_workspace_id and id=p_id and entry_kind='note';
  if not found then return null; end if;
  select coalesce(jsonb_agg(coalesce(public.journal_context_v1(p_workspace_id,l.target_type,l.target_id),
    jsonb_build_object('type',l.target_type,'id',l.target_id,'label','연결 대상 없음','href',null)) order by l.created_at,l.id),'[]'::jsonb)
    into v_contexts from public.journal_links l where l.workspace_id=p_workspace_id and l.journal_id=p_id and l.link_kind='context';
  select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'targetType',l.target_type,'targetId',l.target_id,'title',l.title,
    'href',l.href,'excerpt',l.excerpt,'sourceRevision',l.source_revision,'createdAt',l.created_at) order by l.created_at,l.id),'[]'::jsonb)
    into v_links from public.journal_links l where l.workspace_id=p_workspace_id and l.journal_id=p_id and l.link_kind='use';
  return to_jsonb(v_entry)||jsonb_build_object('contexts',v_contexts,'links',v_links);
end;
$$;

create or replace function public.journal_workflow_v1(p_workspace_id uuid,p_request_id uuid,p_command jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  v_action text := p_command->>'action';
  v_id uuid; v_revision bigint; v_owner uuid;
  v_entry public.journal_entries%rowtype;
  v_receipt public.journal_workflow_receipts%rowtype;
  v_context jsonb; v_contexts jsonb := '[]'::jsonb; v_context_value jsonb;
  v_selection jsonb := p_command->'selection'; v_target_input jsonb := p_command->'target';
  v_target jsonb; v_link jsonb; v_link_id uuid; v_source jsonb; v_response jsonb;
  v_target_id uuid; v_project_id uuid; v_brand_id uuid; v_due_at timestamptz;
  v_channel text; v_variant_type text; v_variant_id uuid; v_content_request uuid;
  v_content jsonb; v_content_command jsonb; v_item public.content_items%rowtype; v_variant public.content_variants%rowtype;
begin
  if p_workspace_id is null or p_request_id is null or jsonb_typeof(p_command) is distinct from 'object'
    or v_action is null or v_action not in ('save','create_task','create_content')
    or coalesce(p_command->>'entryId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or jsonb_typeof(p_command->'expectedRevision') is distinct from 'number'
    or coalesce(p_command->>'expectedRevision','') !~ '^[0-9]+$'
    or octet_length(p_command::text)>131072 then
    return jsonb_build_object('status','invalid-input','error','invalid-command','entry',null);
  end if;
  v_id := (p_command->>'entryId')::uuid;
  v_revision := (p_command->>'expectedRevision')::bigint;
  if v_revision < 0 or v_revision >= 9007199254740991 or (v_action<>'save' and v_revision<1) then
    return jsonb_build_object('status','invalid-input','error','invalid-revision','entry',null);
  end if;
  select owner_id into v_owner from public.workspaces where id=p_workspace_id for share;
  if not found then return jsonb_build_object('status','invalid-input','error','workspace-unavailable','entry',null); end if;

  if v_action='save' then
    if not public.journal_note_text_v1(p_command->'body',20000,true) or not public.journal_note_text_v1(p_command->'title',200)
      or not public.journal_note_timestamp_v1(p_command->>'occurredAt')
      or jsonb_typeof(p_command->'noteMeta') is distinct from 'object'
      or coalesce(p_command->'noteMeta'->>'kind','') not in ('note','conversation','idea','learning','blocked','decision')
      or not public.journal_note_text_v1(p_command->'noteMeta'->'enhancement',4000)
      or jsonb_typeof(p_command->'contexts') is distinct from 'array' then
      return jsonb_build_object('status','invalid-input','error','invalid-note','entry',null);
    end if;
    if jsonb_array_length(p_command->'contexts')>20 then return jsonb_build_object('status','invalid-input','error','too-many-contexts','entry',null); end if;
    for v_context in select value from jsonb_array_elements(p_command->'contexts') loop
      if jsonb_typeof(v_context) is distinct from 'object' or coalesce(v_context->>'type','') not in ('project','lead','account','brand')
        or coalesce(v_context->>'id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        return jsonb_build_object('status','invalid-input','error','invalid-context','entry',null);
      end if;
    end loop;
    if (select count(*) from jsonb_array_elements(p_command->'contexts')) <> (select count(distinct (value->>'type',lower(value->>'id'))) from jsonb_array_elements(p_command->'contexts')) then
      return jsonb_build_object('status','invalid-input','error','duplicate-context','entry',null);
    end if;
  else
    if jsonb_typeof(v_selection) is distinct from 'object' or jsonb_typeof(v_target_input) is distinct from 'object'
      or not public.journal_note_text_v1(v_selection->'prefix',20000) or not public.journal_note_text_v1(v_selection->'text',3500,true)
      or not public.journal_note_text_v1(v_selection->'suffix',20000)
      or length((v_selection->>'prefix')||(v_selection->>'text')||(v_selection->>'suffix'))>20000
      or not public.journal_note_text_v1(v_target_input->'title',200,true) then
      return jsonb_build_object('status','invalid-input','error','invalid-reuse','entry',null);
    end if;
    if v_action='create_task' then
      v_project_id := (v_target_input->>'projectId')::uuid;
      if v_target_input->>'dueAt' is not null and not public.journal_note_timestamp_v1(v_target_input->>'dueAt') then
        return jsonb_build_object('status','invalid-input','error','invalid-due-at','entry',null);
      end if;
      v_due_at := (v_target_input->>'dueAt')::timestamptz;
    else
      v_brand_id := (v_target_input->>'brandId')::uuid;
      v_channel := coalesce(v_target_input->>'channel','threads');
      v_variant_type := case v_channel when 'threads' then 'x_thread' when 'x' then 'x_thread'
        when 'blog' then 'blog_insight' when 'instagram' then 'card_news' when 'reels' then 'reels_script'
        when 'youtube_shorts' then 'reels_script' when 'email' then 'newsletter' end;
      if not public.content_workflow_channel_v1(v_variant_type,v_channel) then
        return jsonb_build_object('status','invalid-input','error','invalid-channel','entry',null);
      end if;
    end if;
  end if;

  -- Always request lock, then note lock. IDs are generated only after both.
  perform pg_advisory_xact_lock(hashtextextended('journal-request:'||p_workspace_id::text||':'||p_request_id::text,0));
  perform pg_advisory_xact_lock(hashtextextended('journal-note:'||p_workspace_id::text||':'||v_id::text,0));
  select * into v_entry from public.journal_entries where workspace_id=p_workspace_id and id=v_id and entry_kind='note' for update;
  select * into v_receipt from public.journal_workflow_receipts where workspace_id=p_workspace_id and request_id=p_request_id;
  if v_receipt.request_id is not null then
    if v_receipt.request_payload is distinct from p_command then
      return jsonb_build_object('status','conflict','error','request-id-reused','entry',public.journal_note_entry_v1(p_workspace_id,v_id));
    end if;
    if v_entry.id is null then return jsonb_build_object('status','conflict','error','note-no-longer-exists','entry',null); end if;
    return v_receipt.response||jsonb_build_object('status','duplicate','entry',public.journal_note_entry_v1(p_workspace_id,v_id));
  end if;
  if v_entry.id is null and exists(select 1 from public.journal_entries where id=v_id) then
    return jsonb_build_object('status','invalid-input','error','entry-unavailable','entry',null);
  end if;
  if (v_entry.id is null and (v_revision<>0 or v_action<>'save')) or (v_entry.id is not null and v_revision<>v_entry.note_revision) then
    return jsonb_build_object('status','conflict','error',case when v_entry.id is null then 'revision-without-note' when v_revision=0 then 'entry-exists' else 'stale-revision' end,
      'entry',public.journal_note_entry_v1(p_workspace_id,v_id));
  end if;

  if v_action='save' then
    for v_context in select value from jsonb_array_elements(p_command->'contexts') order by value->>'type',value->>'id' loop
      v_context_value := public.journal_context_v1(p_workspace_id,v_context->>'type',(v_context->>'id')::uuid);
      if v_context_value is null then return jsonb_build_object('status','invalid-input','error','context-unavailable','entry',null); end if;
      v_contexts := v_contexts||jsonb_build_array(v_context_value);
    end loop;
    if v_entry.id is null then
      insert into public.journal_entries(id,workspace_id,entry_kind,body,title,occurred_at,note_meta,note_revision,content_hash)
        values(v_id,p_workspace_id,'note',p_command->>'body',p_command->>'title',(p_command->>'occurredAt')::timestamptz,p_command->'noteMeta',1,null) returning * into v_entry;
    else
      -- Preserve pre-existing notes created before this migration, too.
      insert into public.journal_note_revisions(workspace_id,journal_id,revision,snapshot)
        values(p_workspace_id,v_id,v_entry.note_revision,public.journal_note_entry_v1(p_workspace_id,v_id)) on conflict(workspace_id,journal_id,revision) do nothing;
      update public.journal_entries set body=p_command->>'body',title=p_command->>'title',occurred_at=(p_command->>'occurredAt')::timestamptz,
        note_meta=p_command->'noteMeta',note_revision=note_revision+1,content_hash=null,updated_at=clock_timestamp()
        where workspace_id=p_workspace_id and id=v_id returning * into v_entry;
    end if;
    delete from public.journal_links where workspace_id=p_workspace_id and journal_id=v_id and link_kind='context';
    for v_context in select value from jsonb_array_elements(v_contexts) loop
      insert into public.journal_links(workspace_id,journal_id,link_kind,target_type,target_id,title,href,source_revision)
        values(p_workspace_id,v_id,'context',v_context->>'type',(v_context->>'id')::uuid,v_context->>'label',v_context->>'href',v_entry.note_revision);
    end loop;
    v_response := jsonb_build_object('status','saved','entry',public.journal_note_entry_v1(p_workspace_id,v_id));
    insert into public.journal_note_revisions(workspace_id,journal_id,revision,snapshot)
      values(p_workspace_id,v_id,v_entry.note_revision,v_response->'entry');
  else
    if (v_selection->>'prefix')||(v_selection->>'text')||(v_selection->>'suffix') is distinct from v_entry.body then
      return jsonb_build_object('status','conflict','error','selection-changed','entry',public.journal_note_entry_v1(p_workspace_id,v_id));
    end if;
    v_source := jsonb_build_object('type','journal','journal_id',v_id,'revision',v_entry.note_revision,'excerpt',v_selection->>'text','href','/dashboard/work/memos?note='||v_id::text);
    if v_action='create_task' then
      if v_project_id is not null and public.journal_context_v1(p_workspace_id,'project',v_project_id) is null then
        return jsonb_build_object('status','invalid-input','error','project-unavailable','entry',null);
      end if;
      v_target_id := gen_random_uuid();
      -- Canonical create_task defaults from engine/lib/pms-command.ts.
      insert into public.tasks(id,workspace_id,owner_id,project_id,title,status,priority,next_action,description,due_at,completed_at,meta)
        values(v_target_id,p_workspace_id,v_owner,v_project_id,v_target_input->>'title','todo','medium',null,
          (v_selection->>'text')||E'\n\n원문: '||(v_source->>'href'),v_due_at,null,
          jsonb_build_object('source','journal','source_refs',jsonb_build_array(v_source)));
      v_target := jsonb_build_object('type','task','id',v_target_id,'title',v_target_input->>'title','href','/dashboard/work/my?task='||v_target_id::text);
    else
      if v_brand_id is not null and public.journal_context_v1(p_workspace_id,'brand',v_brand_id) is null then
        return jsonb_build_object('status','invalid-input','error','brand-unavailable','entry',null);
      end if;
      -- A private nested receipt namespace prevents collisions with Studio IDs.
      v_content_request := gen_random_uuid();
      v_content_command := jsonb_build_object('action','save','contentId',null,'variantId',null,'checkpoint',true,
        'item',jsonb_build_object('title',v_target_input->>'title','sourceIdea',v_selection->>'text','brandId',v_brand_id,'brief',jsonb_build_object('evidence',v_selection->>'text')),
        'variant',jsonb_build_object('title',v_target_input->>'title','body','','variantType',v_variant_type,'channel',v_channel));
      v_content := public.content_workflow_v1(p_workspace_id,v_content_request,md5(v_content_command::text),v_content_command);
      if v_content->>'status' is distinct from 'saved' then
        -- Raising inside the outer exception block rolls back even a nested RPC
        -- that wrote rows before returning an error envelope.
        raise exception using errcode='22023',message='invalid-content-result';
      end if;
      v_target_id := (v_content->>'contentId')::uuid;
      v_variant_id := (v_content->>'variantId')::uuid;
      update public.content_items set meta=meta||jsonb_build_object('source_refs',jsonb_build_array(v_source))
        where workspace_id=p_workspace_id and id=v_target_id returning * into v_item;
      if not found then raise exception 'content-item-unavailable'; end if;
      update public.content_variants set meta=meta||jsonb_build_object('source_refs',jsonb_build_array(v_source))
        where workspace_id=p_workspace_id and content_id=v_target_id and id=v_variant_id returning * into v_variant;
      if not found then raise exception 'content-variant-unavailable'; end if;
      update public.content_revisions set snapshot=to_jsonb(v_variant)
        where workspace_id=p_workspace_id and content_id=v_target_id and variant_id=v_variant_id and id=(v_content->>'revisionId')::uuid;
      if not found then raise exception 'content-revision-unavailable'; end if;
      update public.content_workflow_receipts set response=response||jsonb_build_object('item',to_jsonb(v_item),'variant',to_jsonb(v_variant))
        where workspace_id=p_workspace_id and request_id=v_content_request;
      v_target := jsonb_build_object('type','content','id',v_target_id,'variantId',v_variant_id,'title',v_target_input->>'title',
        'href','/dashboard/content/studio?item='||v_target_id::text||'&variant='||v_variant_id::text);
    end if;
    insert into public.journal_links(workspace_id,journal_id,link_kind,target_type,target_id,title,href,excerpt,source_revision,source_ref)
      values(p_workspace_id,v_id,'use',v_target->>'type',v_target_id,v_target->>'title',v_target->>'href',v_selection->>'text',v_entry.note_revision,v_source) returning id into v_link_id;
    v_response := jsonb_build_object('status','saved','entry',public.journal_note_entry_v1(p_workspace_id,v_id),'target',v_target);
    select value into v_link from jsonb_array_elements(v_response->'entry'->'links') where value->>'id'=v_link_id::text;
    v_response := v_response||jsonb_build_object('link',v_link);
  end if;
  insert into public.journal_workflow_receipts(workspace_id,request_id,journal_id,request_payload,response)
    values(p_workspace_id,p_request_id,v_id,p_command,v_response);
  return v_response;
exception
  when invalid_text_representation or numeric_value_out_of_range or datetime_field_overflow or invalid_datetime_format or invalid_parameter_value
    or check_violation or not_null_violation or foreign_key_violation or unique_violation then
    return jsonb_build_object('status','invalid-input','error','invalid-journal-data','entry',null);
  when others then
    return jsonb_build_object('status','error','error','journal-write-failed','entry',null);
end;
$$;

-- Literal search stays in SQL instead of exposing PostgREST's '*' wildcard
-- alias. Both the table name and result count are fixed server-side.
create or replace function public.journal_context_search_v1(p_workspace_id uuid,p_type text,p_query text default '',p_id uuid default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_table text; v_pattern text; v_rows jsonb; v_contexts jsonb; v_more boolean;
begin
  v_table := case p_type when 'project' then 'projects' when 'lead' then 'leads' when 'account' then 'customer_accounts' when 'brand' then 'brands' end;
  if v_table is null or p_query is null or length(p_query)>200 or p_workspace_id is null
    or not exists(select 1 from public.workspaces where id=p_workspace_id) then
    return jsonb_build_object('status','error','contexts','[]'::jsonb,'hasMore',false);
  end if;
  v_pattern := '%'||replace(replace(replace(p_query,E'\\',E'\\\\'),'%',E'\\%'),'_',E'\\_')||'%';
  execute format($query$
    select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from (
      select id,coalesce(nullif(name,''),'이름 없음') as label from public.%I
      where workspace_id=$1 and ($2::uuid is null or id=$2)
        and ($2::uuid is not null or $3='' or coalesce(name,'') ilike $4 escape E'\\')
      order by name asc nulls last,id asc limit 31
    ) r
  $query$,v_table) into v_rows using p_workspace_id,p_id,p_query,v_pattern;
  v_more := jsonb_array_length(v_rows)>30;
  select coalesce(jsonb_agg(value||jsonb_build_object('type',p_type,'href',case p_type
    when 'project' then '/dashboard/work/projects?project='||(value->>'id')
    when 'brand' then '/dashboard/brands?b='||(value->>'id')
    else '/dashboard/revenue/customers?customer='||p_type||'%3A'||(value->>'id') end) order by ordinal),'[]'::jsonb)
    into v_contexts from jsonb_array_elements(v_rows) with ordinality a(value,ordinal) where ordinal<=30;
  return jsonb_build_object('status','live','workspaceId',p_workspace_id,'contexts',v_contexts,'hasMore',v_more);
exception when others then return jsonb_build_object('status','error','contexts','[]'::jsonb,'hasMore',false);
end;
$$;
revoke all on function public.journal_context_search_v1(uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function public.journal_context_search_v1(uuid,text,text,uuid) to service_role;

revoke all on function public.journal_note_text_v1(jsonb,integer,boolean),public.journal_note_timestamp_v1(text),public.journal_context_v1(uuid,text,uuid),public.journal_note_entry_v1(uuid,uuid),public.journal_workflow_v1(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.journal_workflow_v1(uuid,uuid,jsonb) to service_role;
commit;
