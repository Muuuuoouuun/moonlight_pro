-- Transactional Studio saves, revision history, and saved AI candidates.
-- Apply after the Content OS schema and existing channel migration.
create extension if not exists pgcrypto;

create table if not exists public.content_revisions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  content_id uuid not null references public.content_items(id) on delete cascade,
  variant_id uuid not null references public.content_variants(id) on delete cascade,
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  reason text not null,
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists content_revisions_item_history_idx
  on public.content_revisions(workspace_id, content_id, created_at desc, id desc);
create index if not exists content_revisions_variant_idx
  on public.content_revisions(workspace_id, variant_id, created_at desc);

create table if not exists public.content_workflow_receipts (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  request_id uuid not null,
  request_hash text not null,
  response jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key (workspace_id, request_id)
);

create table if not exists public.content_transform_runs (
  id uuid primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  content_id uuid not null references public.content_items(id) on delete cascade,
  variant_id uuid not null references public.content_variants(id) on delete cascade,
  request_hash text not null,
  operation text not null,
  source_snapshot jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  status text not null check (status in ('running', 'succeeded', 'failed', 'unknown')),
  usage jsonb not null default '{}'::jsonb,
  model text,
  error text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);
create index if not exists content_transform_runs_variant_idx
  on public.content_transform_runs(workspace_id, variant_id, created_at desc);

alter table public.content_revisions enable row level security;
alter table public.content_workflow_receipts enable row level security;
alter table public.content_transform_runs enable row level security;
revoke all on public.content_revisions, public.content_workflow_receipts, public.content_transform_runs from public, anon, authenticated;
grant select, insert, update, delete on public.content_revisions, public.content_workflow_receipts, public.content_transform_runs to service_role;

-- The usual now() trigger reuses one timestamp for an entire transaction.
-- Exact version tokens must advance even for two edits in the same transaction.
create or replace function public.content_workflow_touch_v1()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  new.updated_at := greatest(clock_timestamp(), old.updated_at + interval '1 microsecond');
  return new;
end;
$$;
drop trigger if exists zz_content_workflow_updated_at on public.content_items;
create trigger zz_content_workflow_updated_at before update on public.content_items
  for each row execute function public.content_workflow_touch_v1();
drop trigger if exists zz_content_workflow_updated_at on public.content_variants;
create trigger zz_content_workflow_updated_at before update on public.content_variants
  for each row execute function public.content_workflow_touch_v1();
drop trigger if exists content_transform_runs_updated_at on public.content_transform_runs;
create trigger content_transform_runs_updated_at before update on public.content_transform_runs
  for each row execute function public.content_workflow_touch_v1();
revoke all on function public.content_workflow_touch_v1() from public, anon, authenticated;

create or replace function public.content_workflow_channel_v1(p_type text, p_channel text)
returns boolean language sql immutable set search_path = public, pg_temp as $$
  select coalesce(case
    when p_type in ('x_thread', 'social_post') then p_channel in ('threads', 'x')
    when p_type in ('blog_insight', 'blog', 'landing_copy') then p_channel = 'blog'
    when p_type = 'card_news' then p_channel = 'instagram'
    when p_type = 'reels_script' then p_channel in ('reels', 'instagram', 'youtube_shorts')
    when p_type = 'newsletter' then p_channel = 'email'
    else false end, false);
$$;
revoke all on function public.content_workflow_channel_v1(text, text) from public, anon, authenticated;

create or replace function public.content_workflow_v1(
  p_workspace_id uuid, p_request_id uuid, p_request_hash text, p_command jsonb
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_action text := p_command->>'action';
  v_content_id uuid;
  v_variant_id uuid;
  v_new_id uuid;
  v_revision_id uuid;
  v_parent_revision_id uuid;
  v_item public.content_items%rowtype;
  v_variant public.content_variants%rowtype;
  v_next_variant public.content_variants%rowtype;
  v_run public.content_transform_runs%rowtype;
  v_receipt public.content_workflow_receipts%rowtype;
  v_revision public.content_revisions%rowtype;
  v_item_input jsonb := coalesce(p_command->'item', '{}'::jsonb);
  v_variant_input jsonb := coalesce(p_command->'variant', '{}'::jsonb);
  v_item_patch jsonb := '{}'::jsonb;
  v_variant_patch jsonb := '{}'::jsonb;
  v_meta jsonb;
  v_source jsonb;
  v_candidate jsonb;
  v_application jsonb;
  v_result jsonb;
  v_key text;
  v_type text;
  v_channel text;
  v_branch boolean := false;
  v_new boolean;
  v_first_variant boolean;
begin
  if p_workspace_id is null or p_request_id is null or coalesce(p_request_hash, '') = ''
    or jsonb_typeof(p_command) is distinct from 'object'
    or v_action is null or v_action not in ('save', 'create_variant', 'apply_candidate', 'restore_revision') then
    return jsonb_build_object('status', 'invalid-input', 'error', 'invalid-command');
  end if;
  if octet_length(p_command::text) > 262144 then
    return jsonb_build_object('status', 'invalid-input', 'error', 'payload-too-large');
  end if;
  -- Same request IDs serialize before creating IDs or touching rows.
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text || ':' || p_request_id::text, 0));
  select * into v_receipt from public.content_workflow_receipts where workspace_id=p_workspace_id and request_id=p_request_id;
  if found then
    if v_receipt.request_hash <> p_request_hash then
      return jsonb_build_object('status', 'conflict', 'error', 'request-id-reused');
    end if;
    return v_receipt.response || jsonb_build_object('status', 'duplicate');
  end if;
  v_content_id := (p_command->>'contentId')::uuid;
  v_variant_id := (p_command->>'variantId')::uuid;
  v_new := v_content_id is null;
  v_first_variant := v_content_id is not null and v_variant_id is null;
  if (v_content_id is null and v_variant_id is not null) or (v_action <> 'save' and (v_new or v_first_variant)) then
    return jsonb_build_object('status', 'invalid-input', 'error', 'missing-parent');
  end if;

  if not v_new then
    select * into v_item from public.content_items where id=v_content_id and workspace_id=p_workspace_id for update;
    if not found then return jsonb_build_object('status','invalid-input','error','content-not-found'); end if;
    if v_item.brand_id is not null and not exists (
      select 1 from public.brands where id=v_item.brand_id and workspace_id=p_workspace_id
    ) then return jsonb_build_object('status','invalid-input','error','parent-brand-mismatch'); end if;
    if v_first_variant then
      perform 1 from public.content_variants where content_id=v_content_id and workspace_id=p_workspace_id;
      if found then return jsonb_build_object('status','invalid-input','error','variant-id-required'); end if;
    else
      select * into v_variant from public.content_variants where id=v_variant_id and content_id=v_content_id and workspace_id=p_workspace_id for update;
      if not found then return jsonb_build_object('status','invalid-input','error','variant-not-found'); end if;
    end if;
  end if;

  if v_action = 'apply_candidate' then
    if coalesce(p_command->>'mode', '') not in ('replace','new_variant') then
      return jsonb_build_object('status','invalid-input','error','invalid-apply-mode');
    end if;
    select * into v_run from public.content_transform_runs
      where id=(p_command->>'runId')::uuid and workspace_id=p_workspace_id and content_id=v_content_id and variant_id=v_variant_id for update;
    if not found then return jsonb_build_object('status','invalid-input','error','transform-run-not-found'); end if;
    if v_run.status <> 'succeeded' then return jsonb_build_object('status','conflict','error','transform-not-ready'); end if;
    if jsonb_typeof(v_run.result->'candidates') is distinct from 'array' then
      return jsonb_build_object('status','invalid-input','error','invalid-transform-result');
    end if;
    select candidate into v_candidate from jsonb_array_elements(v_run.result->'candidates') candidate
      where candidate->>'id'=p_command->>'candidateId' limit 1;
    if v_candidate is null then return jsonb_build_object('status','invalid-input','error','candidate-not-found'); end if;
    -- A second click with a fresh request ID replays the saved application,
    -- even though the first apply deliberately changed its source version.
    v_application := v_run.result->'applications'->(p_command->>'candidateId');
    if v_application is not null then
      select * into v_next_variant from public.content_variants
        where id=(v_application->>'variantId')::uuid and workspace_id=p_workspace_id and content_id=v_content_id;
      if not found then return jsonb_build_object('status','conflict','error','applied-variant-not-found'); end if;
      v_result := jsonb_build_object('status','duplicate','contentId',v_content_id,'variantId',v_next_variant.id,
        'item',to_jsonb(v_item),'variant',to_jsonb(v_next_variant),'revisionId',v_application->'revisionId');
      insert into public.content_workflow_receipts(workspace_id,request_id,request_hash,response)
        values(p_workspace_id,p_request_id,p_request_hash,v_result);
      return v_result;
    end if;
  end if;

  if not v_new then
    if (p_command->>'expectedItemUpdatedAt')::timestamptz is distinct from v_item.updated_at then
      return jsonb_build_object('status','conflict','error','stale-item','contentId',v_content_id,'variantId',v_variant_id,'item',to_jsonb(v_item),'variant',to_jsonb(v_variant));
    end if;
    if not v_first_variant and (p_command->>'expectedVariantUpdatedAt')::timestamptz is distinct from v_variant.updated_at then
      return jsonb_build_object('status','conflict','error','stale-variant','contentId',v_content_id,'variantId',v_variant_id,'item',to_jsonb(v_item),'variant',to_jsonb(v_variant));
    end if;
  end if;

  if v_action = 'save' then
    if jsonb_typeof(v_item_input) is distinct from 'object' then
      return jsonb_build_object('status','invalid-input','error','invalid-item');
    end if;
    foreach v_key in array array['title','sourceIdea','nextAction','blocker'] loop
      if v_item_input ? v_key and jsonb_typeof(v_item_input->v_key) is distinct from 'string' then
        return jsonb_build_object('status','invalid-input','error','invalid-item-text');
      end if;
    end loop;
    v_meta := case when v_new then '{}'::jsonb else coalesce(v_item.meta,'{}'::jsonb) end;
    if v_item_input ? 'brief' then
      if jsonb_typeof(v_item_input->'brief') is distinct from 'object' then
        return jsonb_build_object('status','invalid-input','error','invalid-brief');
      end if;
      for v_key in select jsonb_object_keys(v_item_input->'brief') loop
        if v_key not in ('audience','purpose','message','angle','evidence','ending') or jsonb_typeof(v_item_input->'brief'->v_key) is distinct from 'string' then
          return jsonb_build_object('status','invalid-input','error','invalid-brief-field');
        end if;
      end loop;
      v_meta := v_meta || jsonb_build_object('brief',
        (case when jsonb_typeof(v_meta->'brief')='object' then v_meta->'brief' else '{}'::jsonb end) || (v_item_input->'brief'));
    end if;
    if v_item_input ? 'blocker' then v_meta := v_meta || jsonb_build_object('blocker',v_item_input->'blocker'); end if;
    if v_item_input ? 'brandId' and v_item_input->>'brandId' is not null then
      perform 1 from public.brands where id=(v_item_input->>'brandId')::uuid and workspace_id=p_workspace_id;
      if not found then return jsonb_build_object('status','invalid-input','error','brand-not-found'); end if;
    end if;
    if v_item_input ? 'title' then v_item_patch := v_item_patch || jsonb_build_object('title',v_item_input->'title'); end if;
    if v_item_input ? 'sourceIdea' then v_item_patch := v_item_patch || jsonb_build_object('source_idea',v_item_input->'sourceIdea'); end if;
    if v_item_input ? 'nextAction' then v_item_patch := v_item_patch || jsonb_build_object('next_action',v_item_input->'nextAction'); end if;
    if v_item_input ? 'brandId' then v_item_patch := v_item_patch || jsonb_build_object('brand_id',v_item_input->'brandId'); end if;
    v_item_patch := v_item_patch || jsonb_build_object('meta',v_meta);
  end if;

  if v_action in ('save','create_variant') then
    if jsonb_typeof(v_variant_input) is distinct from 'object' then
      return jsonb_build_object('status','invalid-input','error','invalid-variant');
    end if;
    foreach v_key in array array['title','body','variantType','channel'] loop
      if v_variant_input ? v_key and jsonb_typeof(v_variant_input->v_key) is distinct from 'string' then
        return jsonb_build_object('status','invalid-input','error','invalid-variant-text');
      end if;
    end loop;
    if v_variant_input ? 'title' then v_variant_patch := v_variant_patch || jsonb_build_object('title',v_variant_input->'title'); end if;
    if v_variant_input ? 'body' then v_variant_patch := v_variant_patch || jsonb_build_object('body',v_variant_input->'body'); end if;
    if v_variant_input ? 'variantType' then v_variant_patch := v_variant_patch || jsonb_build_object('variant_type',v_variant_input->'variantType'); end if;
    if v_variant_input ? 'channel' then v_variant_patch := v_variant_patch || jsonb_build_object('channel',v_variant_input->'channel'); end if;
    v_type := coalesce(v_variant_patch->>'variant_type',v_variant.variant_type,'blog_insight');
    v_channel := coalesce(v_variant_patch->>'channel',v_variant.channel,
      case when v_type in ('x_thread','social_post') then 'x' when v_type='card_news' then 'instagram'
        when v_type='reels_script' then 'reels' when v_type='newsletter' then 'email' else 'blog' end);
    if not public.content_workflow_channel_v1(v_type,v_channel) then
      return jsonb_build_object('status','invalid-input','error','invalid-channel-format');
    end if;
    if v_new or v_first_variant or v_action='create_variant' then
      v_variant_patch := v_variant_patch || jsonb_build_object('variant_type',v_type,'channel',v_channel);
    end if;
    v_branch := v_action='create_variant';
  end if;

  if v_action = 'apply_candidate' then
    v_source := v_run.source_snapshot;
    if v_source->>'contentId' is distinct from v_content_id::text or v_source->>'variantId' is distinct from v_variant_id::text
      or (v_source->>'variantUpdatedAt')::timestamptz is distinct from v_variant.updated_at
      or (v_source->>'itemUpdatedAt')::timestamptz is distinct from v_item.updated_at
      or v_source->>'body' is distinct from v_variant.body then
      return jsonb_build_object('status','conflict','error','stale-transform-source','item',to_jsonb(v_item),'variant',to_jsonb(v_variant));
    end if;
    foreach v_key in array array['body','prefix','selectionText','suffix'] loop
      if jsonb_typeof(v_source->v_key) is distinct from 'string' then
        return jsonb_build_object('status','invalid-input','error','invalid-transform-selection');
      end if;
    end loop;
    if (v_source->>'prefix') || (v_source->>'selectionText') || (v_source->>'suffix') <> v_variant.body then
      return jsonb_build_object('status','conflict','error','transform-selection-mismatch');
    end if;
    if jsonb_typeof(v_candidate->'body') is distinct from 'string'
      or not public.content_workflow_channel_v1(v_candidate->>'variantType',v_candidate->>'channel') then
      return jsonb_build_object('status','invalid-input','error','invalid-candidate');
    end if;
    v_branch := p_command->>'mode'='new_variant';
    if v_run.operation='repurpose' and not v_branch then
      return jsonb_build_object('status','invalid-input','error','repurpose-requires-new-variant');
    end if;
    if not v_branch and (v_candidate->>'variantType' is distinct from v_variant.variant_type
      or v_candidate->>'channel' is distinct from coalesce(v_variant.channel,
        case when v_variant.variant_type in ('x_thread','social_post') then 'x'
          when v_variant.variant_type='card_news' then 'instagram'
          when v_variant.variant_type='reels_script' then 'reels'
          when v_variant.variant_type='newsletter' then 'email' else 'blog' end)) then
      return jsonb_build_object('status','invalid-input','error','candidate-format-mismatch');
    end if;
    if v_branch then
      v_variant_patch := jsonb_build_object('title',v_candidate->>'title','body',v_candidate->>'body',
        'variant_type',v_candidate->>'variantType','channel',v_candidate->>'channel');
    else
      -- Prefix/suffix strings avoid the JavaScript UTF-16 vs PostgreSQL Unicode
      -- offset mismatch. A partial edit preserves the source format and title.
      v_variant_patch := jsonb_build_object('body',(v_source->>'prefix') || (v_candidate->>'body') || (v_source->>'suffix'));
      if v_run.operation='draft' and v_source->>'prefix'='' and v_source->>'suffix'='' then
        v_variant_patch := v_variant_patch || jsonb_build_object('title',v_candidate->>'title');
      end if;
    end if;
    v_variant_patch := v_variant_patch || jsonb_build_object('status','draft');
    insert into public.content_revisions(workspace_id,content_id,variant_id,snapshot,reason)
      values(p_workspace_id,v_content_id,v_variant_id,to_jsonb(v_variant),'before_apply') returning id into v_parent_revision_id;
  end if;

  if v_action = 'restore_revision' then
    select * into v_revision from public.content_revisions where id=(p_command->>'revisionId')::uuid
      and workspace_id=p_workspace_id and content_id=v_content_id and variant_id=v_variant_id;
    if not found then return jsonb_build_object('status','invalid-input','error','revision-not-found'); end if;
    if v_revision.snapshot->>'id' is distinct from v_variant_id::text
      or v_revision.snapshot->>'content_id' is distinct from v_content_id::text
      or v_revision.snapshot->>'workspace_id' is distinct from p_workspace_id::text then
      return jsonb_build_object('status','invalid-input','error','revision-parent-mismatch');
    end if;
    -- Restore every content field, never the row identity/version or shared item.
    v_variant_patch := v_revision.snapshot - array['id','workspace_id','content_id','created_at','updated_at'];
    insert into public.content_revisions(workspace_id,content_id,variant_id,snapshot,reason)
      values(p_workspace_id,v_content_id,v_variant_id,to_jsonb(v_variant),'before_restore');
  end if;

  if v_new or v_first_variant then
    v_variant_id := gen_random_uuid();
    v_meta := v_meta || jsonb_build_object('primary_variant_id',v_variant_id,'origin','hub-studio');
    if v_new then
      v_content_id := gen_random_uuid();
      insert into public.content_items(id,workspace_id,brand_id,title,source_idea,next_action,status,meta)
        values(v_content_id,p_workspace_id,(v_item_patch->>'brand_id')::uuid,coalesce(v_item_patch->>'title','제목 없음'),
          v_item_patch->>'source_idea',v_item_patch->>'next_action',
          case when coalesce(v_variant_patch->>'body','')='' then 'idea' else 'draft' end,v_meta) returning * into v_item;
    else
      update public.content_items set title=coalesce(v_item_patch->>'title',title),
        source_idea=case when v_item_patch ? 'source_idea' then v_item_patch->>'source_idea' else source_idea end,
        next_action=case when v_item_patch ? 'next_action' then v_item_patch->>'next_action' else next_action end,
        brand_id=case when v_item_patch ? 'brand_id' then (v_item_patch->>'brand_id')::uuid else brand_id end,
        meta=v_meta where id=v_content_id and workspace_id=p_workspace_id returning * into v_item;
    end if;
    insert into public.content_variants(id,workspace_id,content_id,title,body,variant_type,channel,status,meta)
      values(v_variant_id,p_workspace_id,v_content_id,v_variant_patch->>'title',coalesce(v_variant_patch->>'body',''),
        v_type,v_channel,'draft','{"origin":"hub-studio"}'::jsonb) returning * into v_variant;
  elsif v_branch then
    if v_parent_revision_id is null then
      insert into public.content_revisions(workspace_id,content_id,variant_id,snapshot,reason)
        values(p_workspace_id,v_content_id,v_variant_id,to_jsonb(v_variant),'branch_source') returning id into v_parent_revision_id;
    end if;
    v_meta := jsonb_build_object('origin','hub-studio','parent_variant_id',v_variant_id,'parent_revision_id',v_parent_revision_id,
      'source_refs',jsonb_build_array(jsonb_build_object('content_id',v_content_id,'variant_id',v_variant_id,
        'revision_id',v_parent_revision_id,'variant_updated_at',v_variant.updated_at)));
    v_new_id := gen_random_uuid();
    insert into public.content_variants(id,workspace_id,content_id,title,body,variant_type,channel,status,visibility,meta)
      values(v_new_id,p_workspace_id,v_content_id,coalesce(v_variant_patch->>'title',v_variant.title),
        coalesce(v_variant_patch->>'body',v_variant.body),coalesce(v_variant_patch->>'variant_type',v_variant.variant_type),
        coalesce(v_variant_patch->>'channel',v_variant.channel),'draft','private',v_meta) returning * into v_variant;
    v_variant_id := v_new_id;
  else
    if v_action='save' and (to_jsonb(v_item) || v_item_patch) is distinct from to_jsonb(v_item) then
      update public.content_items set title=coalesce(v_item_patch->>'title',title),
        source_idea=case when v_item_patch ? 'source_idea' then v_item_patch->>'source_idea' else source_idea end,
        next_action=case when v_item_patch ? 'next_action' then v_item_patch->>'next_action' else next_action end,
        brand_id=case when v_item_patch ? 'brand_id' then (v_item_patch->>'brand_id')::uuid else brand_id end,
        meta=v_item_patch->'meta'
        where id=v_content_id and workspace_id=p_workspace_id returning * into v_item;
    end if;
    if v_action='save' and v_variant_patch ? 'body' and v_variant_patch->>'body' is distinct from v_variant.body then
      v_variant_patch := v_variant_patch || jsonb_build_object('status','draft');
    end if;
    v_next_variant := jsonb_populate_record(v_variant,v_variant_patch);
    if v_next_variant is distinct from v_variant then
      update public.content_variants set title=v_next_variant.title,body=v_next_variant.body,
        variant_type=v_next_variant.variant_type,channel=v_next_variant.channel,status=v_next_variant.status,
        summary=v_next_variant.summary,excerpt=v_next_variant.excerpt,slug=v_next_variant.slug,
        seo_title=v_next_variant.seo_title,seo_description=v_next_variant.seo_description,
        scheduled_at=v_next_variant.scheduled_at,published_at=v_next_variant.published_at,
        visibility=v_next_variant.visibility,meta=v_next_variant.meta
        where id=v_variant_id and workspace_id=p_workspace_id and content_id=v_content_id returning * into v_variant;
    end if;
  end if;

  -- Once an idea has a written result it belongs in Drafting. Existing review,
  -- scheduled, or published parents retain their explicit lifecycle state.
  if v_action <> 'restore_revision' and v_item.status='idea' and length(btrim(coalesce(v_variant.body,''))) > 0 then
    update public.content_items set status='draft' where id=v_content_id and workspace_id=p_workspace_id returning * into v_item;
  end if;
  if (v_action='save' and coalesce((p_command->>'checkpoint')::boolean,false)) or v_action in ('create_variant','apply_candidate','restore_revision') then
    insert into public.content_revisions(workspace_id,content_id,variant_id,snapshot,reason)
      values(p_workspace_id,v_content_id,v_variant_id,to_jsonb(v_variant),
        case v_action when 'apply_candidate' then 'after_apply' when 'restore_revision' then 'restored:' || v_revision.id::text
          when 'create_variant' then 'branch' else 'checkpoint' end) returning id into v_revision_id;
  end if;
  if v_action='apply_candidate' then
    v_application := jsonb_build_object('variantId',v_variant_id,'revisionId',v_revision_id,'appliedAt',clock_timestamp(),'mode',p_command->>'mode');
    update public.content_transform_runs set result = result || jsonb_build_object('applications',
      coalesce(result->'applications','{}'::jsonb) || jsonb_build_object(p_command->>'candidateId',v_application))
      where id=v_run.id and workspace_id=p_workspace_id;
  end if;
  v_result := jsonb_build_object('status','saved','contentId',v_content_id,'variantId',v_variant_id,'item',to_jsonb(v_item),'variant',to_jsonb(v_variant));
  if v_revision_id is not null then v_result := v_result || jsonb_build_object('revisionId',v_revision_id); end if;
  insert into public.content_workflow_receipts(workspace_id,request_id,request_hash,response)
    values(p_workspace_id,p_request_id,p_request_hash,v_result);
  return v_result;
exception
  -- This exception block rolls back both rows, snapshots, and receipts together.
  when invalid_text_representation or datetime_field_overflow or invalid_datetime_format or check_violation or not_null_violation or foreign_key_violation then
    return jsonb_build_object('status','invalid-input','error','invalid-workflow-data');
end;
$$;
revoke all on function public.content_workflow_v1(uuid,uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.content_workflow_v1(uuid,uuid,text,jsonb) to service_role;
