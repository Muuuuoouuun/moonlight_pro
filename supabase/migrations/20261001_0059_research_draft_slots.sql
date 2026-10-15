-- Daily quantities target valid review drafts. Known invalid output releases
-- its slot; paid source claims and unknown outcomes remain durable and single-use.
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
    if v_prepare.status='pending' and v_prepare.model_started_at is null and v_document.evidence_text is not null then
      -- pending_run_recovery_v1: no paid call has been claimed. Attribute a
      -- safely resumed preparation to the requesting run before Engine claims.
      update public.research_source_preparations set run_id=p_run_id where id=v_prepare.id;
      return jsonb_build_object('status','claimed','preparationId',v_prepare.id);
    end if;
    return jsonb_build_object('status',case when v_prepare.status='generating' then 'running' when v_prepare.status='unknown' then 'unknown' else 'error' end,'reason',coalesce(v_prepare.reason,'source-already-claimed'),'preparationId',v_prepare.id);
  end if;
  -- research_draft_slot_limits_v1: failed evidence is a definitive rejected
  -- draft, not a completed/potential draft slot. Never reset the paid claim.
  v_daily_limit:=case v_run.brand_slug when 'class.moon' then 3 when '22nomad' then 1 else 8 end;
  select count(*) into v_count from public.research_source_preparations where workspace_id=p_workspace_id and brand_id=v_run.brand_id and status in ('pending','generating','unknown','saved') and created_at>=date_trunc('day',clock_timestamp() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
  if v_count>=v_daily_limit then return jsonb_build_object('status','error','reason','daily-quantity-reached'); end if;
  select count(*) into v_count from public.research_source_preparations where workspace_id=p_workspace_id and run_id=p_run_id and status in ('pending','generating','unknown','saved');
  if v_count>=v_run.requested_limit then return jsonb_build_object('status','error','reason','run-quantity-reached'); end if;
  if v_document.evidence_text is null then return jsonb_build_object('status','error','reason','source-evidence-expired'); end if;
  insert into public.research_source_preparations(workspace_id,run_id,brand_id,document_id) values(p_workspace_id,p_run_id,v_run.brand_id,v_document.id) returning * into v_prepare;
  return jsonb_build_object('status','claimed','preparationId',v_prepare.id);
exception when invalid_text_representation or numeric_value_out_of_range then return jsonb_build_object('status','invalid-input','reason','invalid-reference');
end; $$;
revoke all on function public.research_source_claim_v1(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.research_source_claim_v1(uuid,uuid,jsonb) to service_role;


create or replace function public.research_source_complete_v1(p_workspace_id uuid,p_preparation_id uuid,p_result jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_prepare public.research_source_preparations%rowtype;v_doc public.research_source_documents%rowtype;v_body jsonb;v_brief public.research_briefs%rowtype;v_fact jsonb;v_event text;v_result jsonb;v_previous uuid;v_plain text;v_run public.research_runs%rowtype;v_range text[];v_start integer;v_end integer;v_line_count integer;
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
    -- research_validation_diagnostic_v1: codes/field/range only, no text or URL.
    if v_result->>'reason'='invalid-model-evidence'
      and p_result->'validationDiagnostic'->>'code' in ('invalid-json','invalid-object','invalid-brand','invalid-field','invalid-facts','invalid-fact','invalid-source-id','invalid-locator','invalid-line-range','missing-source-line','quote-not-in-cited-lines')
      and p_result->'validationDiagnostic'->>'field' in ('body','brandId','title','change','whyBrand','interpretation','conditions','counterevidence','unknown','draft','facts','facts.text','facts.quote','facts.sourceId','facts.locator') then
      v_result:=v_result||jsonb_build_object('validationDiagnostic',jsonb_strip_nulls(jsonb_build_object(
        'code',p_result->'validationDiagnostic'->>'code','field',p_result->'validationDiagnostic'->>'field',
        'factIndex',case when p_result->'validationDiagnostic'->>'factIndex' ~ '^[0-7]$' then (p_result->'validationDiagnostic'->>'factIndex')::integer else null end,
        'lineStart',case when p_result->'validationDiagnostic'->>'lineStart' ~ '^[0-9]{1,5}$' then (p_result->'validationDiagnostic'->>'lineStart')::integer else null end,
        'lineEnd',case when p_result->'validationDiagnostic'->>'lineEnd' ~ '^[0-9]{1,5}$' then (p_result->'validationDiagnostic'->>'lineEnd')::integer else null end)));
    end if;
    update public.research_source_preparations set status=case when v_result->>'reason'='model-outcome-unknown' then 'unknown' else 'failed' end,reason=v_result->>'reason',model=v_result->>'model',usage=v_result->'usage',finished_at=clock_timestamp(),result=v_result where id=v_prepare.id;
    return v_result;
  end if;
  v_body:=p_result->'brief';
  if jsonb_typeof(v_body) is distinct from 'object' or length(btrim(coalesce(v_body->>'title',''))) not between 1 and 180 or length(btrim(coalesce(v_body->>'change',''))) not between 1 and 1000
    or length(btrim(coalesce(v_body->>'whyBrand',''))) not between 1 and 1000 or length(btrim(coalesce(v_body->>'draft',''))) not between 1 and 12000
    or jsonb_typeof(v_body->'facts') is distinct from 'array' or jsonb_typeof(v_body->'factEvidence') is distinct from 'array'
    or jsonb_array_length(v_body->'facts') not between 1 and 8 or jsonb_array_length(v_body->'factEvidence') is distinct from jsonb_array_length(v_body->'facts') then return jsonb_build_object('status','invalid-input','reason','invalid-prepared-brief'); end if;
  -- source_locator_lines_v1: match only the cited line range, as Engine does.
  for v_fact in select value from jsonb_array_elements(v_body->'factEvidence') loop
    v_range:=regexp_match(coalesce(v_fact->>'locator',''),'^L([0-9]{1,5})(-L?([0-9]{1,5}))?$');
    if v_fact->>'sourceId' is distinct from v_doc.id::text or v_range is null
      or length(coalesce(v_fact->>'quote','')) not between 1 and 800 then return jsonb_build_object('status','invalid-input','reason','invalid-source-location'); end if;
    v_start:=v_range[1]::integer;v_end:=coalesce(v_range[3],v_range[1])::integer;
    if v_start<1 or v_end<v_start or v_end-v_start>5 then return jsonb_build_object('status','invalid-input','reason','invalid-source-location'); end if;
    select count(*),string_agg(regexp_replace(line,'^L[0-9]+: *',''),' ' order by ordinal)
      into v_line_count,v_plain from regexp_split_to_table(v_doc.evidence_text,E'\n') with ordinality as lines(line,ordinal)
      where substring(line from '^L([0-9]+):')::integer between v_start and v_end;
    if v_line_count<>v_end-v_start+1 or strpos(regexp_replace(v_plain,'\s+',' ','g'),regexp_replace(v_fact->>'quote','\s+',' ','g'))=0 then return jsonb_build_object('status','invalid-input','reason','invalid-source-location'); end if;
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
