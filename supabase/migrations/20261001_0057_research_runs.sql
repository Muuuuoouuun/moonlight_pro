-- Durable public-source preparation. Each model claim is single-use, including
-- unknown outcomes. Changed documents create new pending briefs, never revisions
-- of an already reviewed/promoted brief. Raw extracted evidence expires in 30 days.
create table public.research_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  request_id uuid not null, request_hash text not null check(request_hash ~ '^[a-f0-9]{64}$'),
  brand_id uuid not null references public.brands(id), brand_slug text not null,
  topic text not null, requested_limit integer not null check(requested_limit between 1 and 3),
  status text not null default 'running' check(status in ('running','success','partial','failed','unknown')),
  counts jsonb not null default '{}', model text, usage jsonb, estimated_cost_usd numeric,
  reason text, failures jsonb not null default '[]', brief_ids jsonb not null default '[]',
  started_at timestamptz not null default clock_timestamp(), finished_at timestamptz,
  unique(workspace_id,request_id)
);
create index research_runs_workspace_idx on public.research_runs(workspace_id,started_at desc,id desc);
create table public.research_source_documents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  url text not null check(length(url)<=2000), entry_url text not null check(length(entry_url)<=2000), title text not null check(length(title)<=240),
  document_hash text not null check(document_hash ~ '^[a-f0-9]{64}$'),
  evidence_text text check(length(evidence_text)<=18000),
  official boolean not null default false, truncated boolean not null default false,
  fetched_at timestamptz not null default clock_timestamp(),
  evidence_expires_at timestamptz not null default clock_timestamp()+interval '30 days',
  unique(workspace_id,document_hash)
);
create index research_source_documents_url_idx on public.research_source_documents(workspace_id,url,fetched_at desc);
create table public.research_source_preparations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  run_id uuid not null references public.research_runs(id), brand_id uuid not null references public.brands(id),
  document_id uuid not null references public.research_source_documents(id),
  status text not null default 'pending' check(status in ('pending','generating','saved','failed','unknown')),
  brief_id uuid references public.research_briefs(id), model text, usage jsonb, reason text,
  result jsonb, model_started_at timestamptz, finished_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  unique(workspace_id,brand_id,document_id)
);
create index research_source_preparations_run_idx on public.research_source_preparations(workspace_id,run_id);
create table public.research_source_cursors (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  brand_id uuid not null references public.brands(id), adapter_url text not null,
  last_url text not null, document_hash text not null, last_seen_at timestamptz not null default clock_timestamp(),
  primary key(workspace_id,brand_id,adapter_url)
);
alter table public.research_runs enable row level security;
alter table public.research_source_documents enable row level security;
alter table public.research_source_preparations enable row level security;
alter table public.research_source_cursors enable row level security;
revoke all on public.research_runs,public.research_source_documents,public.research_source_preparations,public.research_source_cursors from public,anon,authenticated,service_role;
grant select on public.research_runs,public.research_source_documents,public.research_source_preparations,public.research_source_cursors to service_role;

create or replace function public.research_run_claim_v1(p_workspace_id uuid,p_request_id uuid,p_request_hash text,p_command jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_run public.research_runs%rowtype; v_brand public.brands%rowtype; v_expected_slug text; v_limit integer;
begin
  if p_workspace_id is null or p_request_id is null or coalesce(p_request_hash,'') !~ '^[a-f0-9]{64}$' or jsonb_typeof(p_command) is distinct from 'object' or octet_length(p_command::text)>4096 then return jsonb_build_object('status','invalid-input','reason','invalid-run'); end if;
  v_expected_slug:=case p_command->>'brand' when 'politic_officer' then 'politicofficer' when 'class.moon' then 'classmoon' when '22nomad' then '22nomad' end;
  v_limit:=(p_command->>'limit')::integer;
  if v_expected_slug is null or p_command->>'dbSlug' is distinct from v_expected_slug or v_limit is null or v_limit<1 or v_limit>(case when v_expected_slug='classmoon' then 3 else 1 end) or coalesce(p_command->>'topic','')='' then return jsonb_build_object('status','invalid-input','reason','invalid-run'); end if;
  select * into v_brand from public.brands where id=(p_command->>'brandId')::uuid and workspace_id=p_workspace_id and slug=v_expected_slug and status='active';
  if not found then return jsonb_build_object('status','invalid-input','reason','brand-identity-unconfirmed'); end if;
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||':research-run:'||p_request_id::text,0));
  select * into v_run from public.research_runs where workspace_id=p_workspace_id and request_id=p_request_id for update;
  if found then
    if v_run.request_hash<>p_request_hash then return jsonb_build_object('status','conflict','reason','request-id-reused'); end if;
    -- A crashed Hub can safely resume collection under the same durable run.
    -- Source/model claims below prevent repeated generation. Fresh active runs
    -- are read-only replays so concurrent clients do not duplicate discovery.
    if v_run.status='running' and v_run.started_at<clock_timestamp()-interval '6 minutes' then
      update public.research_runs set started_at=clock_timestamp() where id=v_run.id returning * into v_run;
      return jsonb_build_object('status','claimed','resumed',true,'run',to_jsonb(v_run));
    end if;
    return jsonb_build_object('status',case when v_run.status='running' then 'running' else 'duplicate' end,'run',to_jsonb(v_run));
  end if;
  insert into public.research_runs(workspace_id,request_id,request_hash,brand_id,brand_slug,topic,requested_limit)
    values(p_workspace_id,p_request_id,p_request_hash,v_brand.id,p_command->>'brand',p_command->>'topic',v_limit) returning * into v_run;
  return jsonb_build_object('status','claimed','run',to_jsonb(v_run));
exception when invalid_text_representation or numeric_value_out_of_range then return jsonb_build_object('status','invalid-input','reason','invalid-reference');
end; $$;
revoke all on function public.research_run_claim_v1(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.research_run_claim_v1(uuid,uuid,text,jsonb) to service_role;

create or replace function public.research_source_claim_v1(p_workspace_id uuid,p_run_id uuid,p_source jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_run public.research_runs%rowtype;v_document public.research_source_documents%rowtype;v_prepare public.research_source_preparations%rowtype;v_daily_limit integer;v_count integer;
begin
  if p_workspace_id is null or p_run_id is null or jsonb_typeof(p_source) is distinct from 'object' or octet_length(p_source::text)>90000 or coalesce(p_source->>'documentHash','') !~ '^[a-f0-9]{64}$'
    or length(coalesce(p_source->>'text','')) not between 100 and 18000 or length(coalesce(p_source->>'url',''))>2000 or coalesce(p_source->>'url','') !~ '^https://[^/@]+/'
    or length(coalesce(p_source->>'title','')) not between 1 and 240 or length(coalesce(p_source->>'adapterUrl',''))>2000
    or encode(sha256(convert_to(p_source->>'text','UTF8')),'hex') is distinct from p_source->>'documentHash' then return jsonb_build_object('status','invalid-input','reason','invalid-source-evidence'); end if;
  select * into v_run from public.research_runs where id=p_run_id and workspace_id=p_workspace_id and status='running' for update;
  if not found then return jsonb_build_object('status','invalid-input','reason','run-not-active'); end if;
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||':research-brand:'||v_run.brand_id::text,0));
  -- Expire bounded text only; citations, hashes and receipts remain auditable.
  update public.research_source_documents set evidence_text=null where workspace_id=p_workspace_id and evidence_expires_at<clock_timestamp() and evidence_text is not null;
  insert into public.research_source_documents(workspace_id,url,entry_url,title,document_hash,evidence_text,official,truncated)
    values(p_workspace_id,p_source->>'url',coalesce(p_source->>'entryUrl',p_source->>'url'),p_source->>'title',p_source->>'documentHash',p_source->>'text',coalesce((p_source->>'official')::boolean,false),coalesce((p_source->>'truncated')::boolean,false))
    on conflict(workspace_id,document_hash) do nothing;
  select * into v_document from public.research_source_documents where workspace_id=p_workspace_id and document_hash=p_source->>'documentHash';
  insert into public.research_source_cursors(workspace_id,brand_id,adapter_url,last_url,document_hash)
    values(p_workspace_id,v_run.brand_id,coalesce(p_source->>'adapterUrl','unknown'),p_source->>'url',v_document.document_hash)
    on conflict(workspace_id,brand_id,adapter_url) do update set last_url=excluded.last_url,document_hash=excluded.document_hash,last_seen_at=clock_timestamp();
  select * into v_prepare from public.research_source_preparations where workspace_id=p_workspace_id and brand_id=v_run.brand_id and document_id=v_document.id for update;
  if found then
    if v_prepare.status='saved' then return v_prepare.result||jsonb_build_object('status','duplicate'); end if;
    -- Pending is safe to retry: Engine has never claimed a model call. An active
    -- or unknown model outcome is never reset or billed a second time.
    if v_prepare.status='pending' and v_document.evidence_text is not null then return jsonb_build_object('status','claimed','preparationId',v_prepare.id); end if;
    return jsonb_build_object('status',case when v_prepare.status='generating' then 'running' when v_prepare.status='unknown' then 'unknown' else 'error' end,'reason',coalesce(v_prepare.reason,'source-already-claimed'),'preparationId',v_prepare.id);
  end if;
  v_daily_limit:=case v_run.brand_slug when 'class.moon' then 3 when '22nomad' then 1 else 8 end;
  select count(*) into v_count from public.research_source_preparations where workspace_id=p_workspace_id and brand_id=v_run.brand_id and created_at>=date_trunc('day',clock_timestamp() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
  if v_count>=v_daily_limit then return jsonb_build_object('status','error','reason','daily-quantity-reached'); end if;
  select count(*) into v_count from public.research_source_preparations where workspace_id=p_workspace_id and run_id=p_run_id;
  if v_count>=v_run.requested_limit then return jsonb_build_object('status','error','reason','run-quantity-reached'); end if;
  if v_document.evidence_text is null then return jsonb_build_object('status','error','reason','source-evidence-expired'); end if;
  insert into public.research_source_preparations(workspace_id,run_id,brand_id,document_id) values(p_workspace_id,p_run_id,v_run.brand_id,v_document.id) returning * into v_prepare;
  return jsonb_build_object('status','claimed','preparationId',v_prepare.id);
exception when invalid_text_representation or numeric_value_out_of_range then return jsonb_build_object('status','invalid-input','reason','invalid-reference');
end; $$;
revoke all on function public.research_source_claim_v1(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.research_source_claim_v1(uuid,uuid,jsonb) to service_role;

create or replace function public.research_model_claim_v1(p_workspace_id uuid,p_preparation_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_prepare public.research_source_preparations%rowtype;v_doc public.research_source_documents%rowtype;v_brand public.brands%rowtype;
begin
  select * into v_prepare from public.research_source_preparations where id=p_preparation_id and workspace_id=p_workspace_id for update;
  if not found then return jsonb_build_object('status','invalid-input','reason','preparation-not-found'); end if;
  if v_prepare.status='saved' then return v_prepare.result||jsonb_build_object('status','duplicate'); end if;
  if v_prepare.status='generating' then
    if v_prepare.model_started_at<clock_timestamp()-interval '90 seconds' then
      update public.research_source_preparations set status='unknown',reason='model-outcome-unknown' where id=v_prepare.id;
      return jsonb_build_object('status','unknown','reason','model-outcome-unknown');
    end if;
    return jsonb_build_object('status','running','reason','model-in-progress');
  end if;
  if v_prepare.status<>'pending' then return jsonb_build_object('status',case when v_prepare.status='unknown' then 'unknown' else 'error' end,'reason',coalesce(v_prepare.reason,'preparation-failed')); end if;
  select * into v_doc from public.research_source_documents where id=v_prepare.document_id and workspace_id=p_workspace_id;
  select * into v_brand from public.brands where id=v_prepare.brand_id and workspace_id=p_workspace_id and status='active';
  if v_doc.evidence_text is null or v_doc.evidence_expires_at<clock_timestamp() or v_brand.id is null then return jsonb_build_object('status','error','reason','claimed-evidence-unavailable'); end if;
  update public.research_source_preparations set status='generating',model_started_at=clock_timestamp() where id=v_prepare.id;
  return jsonb_build_object('status','claimed','source',jsonb_build_object('id',v_doc.id,'url',v_doc.url,'title',v_doc.title,'text',v_doc.evidence_text,'documentHash',v_doc.document_hash),'brand',jsonb_build_object('id',v_brand.id,'slug',v_brand.slug,'name',v_brand.name,'meta',v_brand.meta));
end; $$;
revoke all on function public.research_model_claim_v1(uuid,uuid) from public,anon,authenticated;
grant execute on function public.research_model_claim_v1(uuid,uuid) to service_role;

create or replace function public.research_source_complete_v1(p_workspace_id uuid,p_preparation_id uuid,p_result jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_prepare public.research_source_preparations%rowtype;v_doc public.research_source_documents%rowtype;v_body jsonb;v_brief public.research_briefs%rowtype;v_fact jsonb;v_event text;v_result jsonb;v_previous uuid;v_plain text;v_run public.research_runs%rowtype;
begin
  if jsonb_typeof(p_result) is distinct from 'object' or octet_length(p_result::text)>64000 or coalesce(p_result->>'status','') not in ('saved','error') then return jsonb_build_object('status','invalid-input','reason','invalid-result'); end if;
  -- Match source_claim's run-before-preparation order. A late completion and
  -- resumed Hub collection must not hold the two rows in opposite orders.
  select run_id into v_run.id from public.research_source_preparations where id=p_preparation_id and workspace_id=p_workspace_id;
  if not found then return jsonb_build_object('status','invalid-input','reason','preparation-not-found'); end if;
  select * into v_run from public.research_runs where id=v_run.id and workspace_id=p_workspace_id for update;
  select * into v_prepare from public.research_source_preparations where id=p_preparation_id and workspace_id=p_workspace_id for update;
  if not found then return jsonb_build_object('status','invalid-input','reason','preparation-not-found'); end if;
  if v_prepare.status='saved' then return v_prepare.result||jsonb_build_object('status','duplicate'); end if;
  if v_prepare.status='failed' then return v_prepare.result; end if;
  if v_prepare.status not in ('generating','unknown') then return jsonb_build_object('status','conflict','reason','model-not-claimed'); end if;
  select * into v_doc from public.research_source_documents where id=v_prepare.document_id and workspace_id=p_workspace_id;
  if p_result->>'status'='error' then
    v_result:=jsonb_build_object('status','error','reason',case when p_result->>'reason'='invalid-model-evidence' then 'invalid-model-evidence' else 'model-outcome-unknown' end,'model',left(p_result->>'model',100),'usage',p_result->'usage','estimatedCostUsd',null);
    update public.research_source_preparations set status=case when v_result->>'reason'='model-outcome-unknown' then 'unknown' else 'failed' end,reason=v_result->>'reason',model=v_result->>'model',usage=v_result->'usage',finished_at=clock_timestamp(),result=v_result where id=v_prepare.id;
    return v_result;
  end if;
  v_body:=p_result->'brief';
  if jsonb_typeof(v_body) is distinct from 'object' or length(btrim(coalesce(v_body->>'title',''))) not between 1 and 180 or length(btrim(coalesce(v_body->>'change',''))) not between 1 and 1000
    or length(btrim(coalesce(v_body->>'whyBrand',''))) not between 1 and 1000 or length(btrim(coalesce(v_body->>'draft',''))) not between 1 and 12000
    or jsonb_typeof(v_body->'facts') is distinct from 'array' or jsonb_typeof(v_body->'factEvidence') is distinct from 'array'
    or jsonb_array_length(v_body->'facts') not between 1 and 8 or jsonb_array_length(v_body->'factEvidence') is distinct from jsonb_array_length(v_body->'facts') then return jsonb_build_object('status','invalid-input','reason','invalid-prepared-brief'); end if;
  v_plain:=regexp_replace(regexp_replace(v_doc.evidence_text,'(^|\n)L[0-9]+: ','\1','g'),'\s+',' ','g');
  for v_fact in select value from jsonb_array_elements(v_body->'factEvidence') loop
    if v_fact->>'sourceId' is distinct from v_doc.id::text or coalesce(v_fact->>'locator','') !~ '^L[0-9]+(-L?[0-9]+)?$'
      or length(coalesce(v_fact->>'quote','')) not between 1 and 800 or strpos(v_plain,regexp_replace(v_fact->>'quote','\s+',' ','g'))=0 then return jsonb_build_object('status','invalid-input','reason','invalid-source-location'); end if;
  end loop;
  v_event:=left(v_doc.document_hash,40);
  select p.brief_id into v_previous from public.research_source_preparations p join public.research_source_documents d on d.id=p.document_id where p.workspace_id=p_workspace_id and p.brand_id=v_prepare.brand_id and d.entry_url=v_doc.entry_url and p.status='saved' order by d.fetched_at desc limit 1;
  v_body:=v_body||jsonb_build_object('brandId',v_prepare.brand_id,'eventKey',v_event,'origin','research-ai','verificationLevel','unreviewed','supersedesBriefId',v_previous,
    'sources',jsonb_build_array(jsonb_build_object('url',v_doc.url,'title',v_doc.title,'accessLevel','full-text','documentHash',v_doc.document_hash,'locator',(select string_agg(value->>'locator',', ') from jsonb_array_elements(v_body->'factEvidence')))));
  insert into public.research_briefs(workspace_id,brand_id,event_key) values(p_workspace_id,v_prepare.brand_id,v_event) returning * into v_brief;
  insert into public.research_brief_revisions(workspace_id,brief_id,revision,payload) values(p_workspace_id,v_brief.id,1,v_body);
  v_result:=jsonb_build_object('status','saved','briefId',v_brief.id,'revision',1,'model',left(p_result->>'model',100),'usage',p_result->'usage','estimatedCostUsd',null);
  update public.research_source_preparations set status='saved',brief_id=v_brief.id,model=v_result->>'model',usage=v_result->'usage',reason='ok',result=v_result,finished_at=clock_timestamp() where id=v_prepare.id;
  -- The Hub may have timed out while this authorized model call completed.
  -- Reconcile its finished run from durable preparations, without another call.
  select * into v_run from public.research_runs where id=v_prepare.run_id and workspace_id=p_workspace_id;
  if v_run.status in ('unknown','partial') then
    perform public.research_run_finish_v1(p_workspace_id,v_run.id,jsonb_build_object('counts',v_run.counts||jsonb_build_object('failedCount',greatest(0,coalesce((v_run.counts->>'failedCount')::integer,0)-1)),
      'reason',case when v_run.reason='preparation-outcome-unknown' then 'ok' else v_run.reason end,
      'failures',coalesce((select jsonb_agg(value) from jsonb_array_elements(v_run.failures) where value->>'reason'<>'preparation-outcome-unknown'),'[]')));
  end if;
  return v_result;
end; $$;
revoke all on function public.research_source_complete_v1(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.research_source_complete_v1(uuid,uuid,jsonb) to service_role;

create or replace function public.research_run_finish_v1(p_workspace_id uuid,p_run_id uuid,p_result jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_run public.research_runs%rowtype;v_prepared integer;v_pending integer;v_failed integer;v_usage jsonb;v_briefs jsonb;v_model text;v_counts jsonb;
begin
  if jsonb_typeof(p_result) is distinct from 'object' or octet_length(p_result::text)>8192 then return jsonb_build_object('status','invalid-input','reason','invalid-run-result'); end if;
  select * into v_run from public.research_runs where id=p_run_id and workspace_id=p_workspace_id for update;
  if not found then return jsonb_build_object('status','invalid-input','reason','run-not-found'); end if;
  if v_run.status not in ('running','unknown','partial') then return jsonb_build_object('status','duplicate','run',to_jsonb(v_run)); end if;
  select count(*) filter(where status='saved'),count(*) filter(where status in ('pending','generating','unknown')),count(*) filter(where status='failed'),
    jsonb_agg(brief_id) filter(where brief_id is not null),case when count(distinct model)=1 then max(model) else null end,case when count(*) filter(where usage is not null and usage<>'null')>0 then jsonb_build_object('promptTokenCount',case when count(*) filter(where model_started_at is not null)=count(usage->>'promptTokenCount') then sum((usage->>'promptTokenCount')::bigint) else null end,'candidatesTokenCount',case when count(*) filter(where model_started_at is not null)=count(usage->>'candidatesTokenCount') then sum((usage->>'candidatesTokenCount')::bigint) else null end,'thoughtsTokenCount',case when count(*) filter(where model_started_at is not null)=count(usage->>'thoughtsTokenCount') then sum((usage->>'thoughtsTokenCount')::bigint) else null end,'totalTokenCount',case when count(*) filter(where model_started_at is not null)=count(usage->>'totalTokenCount') then sum((usage->>'totalTokenCount')::bigint) else null end) else null end
    into v_prepared,v_pending,v_failed,v_briefs,v_model,v_usage from public.research_source_preparations where workspace_id=p_workspace_id and run_id=p_run_id;
  v_counts:=jsonb_build_object('preparedCount',v_prepared,'sourceCount',least(greatest(coalesce((p_result->'counts'->>'sourceCount')::integer,0),0),8),'searchCalls',least(greatest(coalesce((p_result->'counts'->>'searchCalls')::integer,0),0),1),'duplicateCount',least(greatest(coalesce((p_result->'counts'->>'duplicateCount')::integer,0),0),8),'failedCount',greatest(v_failed,least(greatest(coalesce((p_result->'counts'->>'failedCount')::integer,0),0),12)));
  update public.research_runs set status=case when v_pending>0 then case when v_prepared>0 then 'partial' else 'unknown' end when (v_counts->>'failedCount')::integer>0 then case when v_prepared>0 then 'partial' else 'failed' end else 'success' end,
    counts=v_counts,model=v_model,usage=v_usage,estimated_cost_usd=null,reason=left(coalesce(p_result->>'reason','ok'),80),failures=coalesce(p_result->'failures','[]'),brief_ids=coalesce(v_briefs,'[]'),finished_at=clock_timestamp() where id=p_run_id returning * into v_run;
  return jsonb_build_object('status','saved','run',to_jsonb(v_run));
exception when invalid_text_representation or numeric_value_out_of_range then return jsonb_build_object('status','invalid-input','reason','invalid-run-counts');
end; $$;
revoke all on function public.research_run_finish_v1(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.research_run_finish_v1(uuid,uuid,jsonb) to service_role;
