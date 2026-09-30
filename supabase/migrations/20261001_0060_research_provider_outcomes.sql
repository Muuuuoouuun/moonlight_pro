-- Completed provider failures release draft slots without releasing paid source claims.
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
    v_result:=jsonb_build_object('status','error','reason',case when p_result->>'reason'='invalid-model-evidence' then 'invalid-model-evidence' when p_result->>'reason'='model-response-invalid' and p_result->'providerDiagnostic'->>'failureCategory' in ('invalid-json','blocked-prompt','blocked-output','incomplete-output','empty-output') then 'model-response-invalid' when p_result->>'reason'='model-request-rejected' and p_result->'providerDiagnostic'->>'failureCategory' in ('missing-api-key','authentication','rate-limit','provider-unavailable','invalid-request','http-error') then 'model-request-rejected' else 'model-outcome-unknown' end,'model',left(p_result->>'model',100),'usage',p_result->'usage','estimatedCostUsd',null);
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
    -- research_provider_outcome_v1: bounded machine fields only. A transport
    -- timeout remains unknown even if HTTP headers had already arrived.
    if p_result->'providerDiagnostic'->>'failureCategory' in ('missing-api-key','timeout','aborted','network-error','authentication','rate-limit','provider-unavailable','invalid-request','http-error','invalid-json','blocked-prompt','blocked-output','incomplete-output','empty-output','provider-error') then
      v_result:=v_result||jsonb_build_object('providerDiagnostic',jsonb_strip_nulls(jsonb_build_object(
        'failureCategory',p_result->'providerDiagnostic'->>'failureCategory',
        'finishReason',case when p_result->'providerDiagnostic'->>'finishReason' ~ '^[A-Z][A-Z0-9_]{0,79}$' then p_result->'providerDiagnostic'->>'finishReason' else null end,
        'blockReason',case when p_result->'providerDiagnostic'->>'blockReason' ~ '^[A-Z][A-Z0-9_]{0,79}$' then p_result->'providerDiagnostic'->>'blockReason' else null end,
        'httpStatus',case when p_result->'providerDiagnostic'->>'httpStatus' ~ '^[1-5][0-9]{2}$' then (p_result->'providerDiagnostic'->>'httpStatus')::integer else null end)));
    end if;
    update public.research_source_preparations set status=case when v_result->>'reason'='model-outcome-unknown' then 'unknown' else 'failed' end,reason=v_result->>'reason',model=v_result->>'model',usage=v_result->'usage',finished_at=clock_timestamp(),result=v_result where id=v_prepare.id;
    -- research_terminal_response_repair_v1: reconcile late definite failures,
    -- retaining all usage and model_started_at. Other unknown claims stay held.
    if v_result->>'reason'<>'model-outcome-unknown' and v_run.status in ('unknown','partial') then
      perform public.research_run_finish_v1(p_workspace_id,v_run.id,jsonb_build_object('counts',v_run.counts,
        'reason',case when v_run.reason in ('model-outcome-unknown','preparation-outcome-unknown') and not exists(select 1 from public.research_source_preparations where run_id=v_run.id and status in ('pending','generating','unknown')) then v_result->>'reason' else v_run.reason end,
        'failures',case when not exists(select 1 from public.research_source_preparations where run_id=v_run.id and status in ('pending','generating','unknown')) then coalesce((select jsonb_agg(case when value->>'reason' in ('model-outcome-unknown','preparation-outcome-unknown') then value||jsonb_build_object('reason',v_result->>'reason') else value end) from jsonb_array_elements(v_run.failures)),'[]') else v_run.failures end));
    end if;
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


-- The previous Engine recorded parsed provider usage but classified all failed
-- responses as unknown. Positive sanitized token counts + model + finished_at
-- prove that a response had returned. Only legacy receipts without the new
-- provider diagnostic qualify; a later transport diagnosis is never replaced.
-- Preserve the receipt and paid claim; do
-- not infer the missing finish reason or reset/retry the same source version.
do $$
declare v_run public.research_runs%rowtype;v_prepare record;
begin
  for v_run in select r.* from public.research_runs r where exists(
    select 1 from public.research_source_preparations p where p.run_id=r.id and p.status='unknown' and p.reason='model-outcome-unknown'
      and not(coalesce(p.result,'{}') ? 'providerDiagnostic') and p.finished_at is not null and p.model_started_at is not null and p.model ~ '^[a-zA-Z0-9._:/@-]{1,100}$' and jsonb_typeof(p.usage)='object'
      and exists(select 1 from jsonb_each_text(case when jsonb_typeof(p.usage)='object' then p.usage else '{}' end) tokens where tokens.key in ('promptTokenCount','candidatesTokenCount','thoughtsTokenCount','totalTokenCount')
        and case when tokens.value ~ '^[0-9]{1,15}$' then tokens.value::numeric>0 else false end)) for update
  loop
    for v_prepare in select p.id from public.research_source_preparations p where p.run_id=v_run.id and p.status='unknown' and p.reason='model-outcome-unknown'
      and not(coalesce(p.result,'{}') ? 'providerDiagnostic') and p.finished_at is not null and p.model_started_at is not null and p.model ~ '^[a-zA-Z0-9._:/@-]{1,100}$' and jsonb_typeof(p.usage)='object'
      and exists(select 1 from jsonb_each_text(case when jsonb_typeof(p.usage)='object' then p.usage else '{}' end) tokens where tokens.key in ('promptTokenCount','candidatesTokenCount','thoughtsTokenCount','totalTokenCount')
        and case when tokens.value ~ '^[0-9]{1,15}$' then tokens.value::numeric>0 else false end) for update
    loop
      update public.research_source_preparations set status='failed',reason='model-response-invalid',
        result=coalesce(result,'{}')||jsonb_build_object('status','error','reason','model-response-invalid','providerDiagnostic',jsonb_build_object('failureCategory','legacy-response-invalid')) where id=v_prepare.id;
    end loop;
    if v_run.status in ('unknown','partial','running') then
      perform public.research_run_finish_v1(v_run.workspace_id,v_run.id,jsonb_build_object('counts',v_run.counts,
        'reason',case when v_run.reason in ('model-outcome-unknown','preparation-outcome-unknown') and not exists(select 1 from public.research_source_preparations where run_id=v_run.id and status in ('pending','generating','unknown')) then 'model-response-invalid' else v_run.reason end,
        'failures',case when not exists(select 1 from public.research_source_preparations where run_id=v_run.id and status in ('pending','generating','unknown')) then coalesce((select jsonb_agg(case when value->>'reason' in ('model-outcome-unknown','preparation-outcome-unknown') then value||jsonb_build_object('reason','model-response-invalid') else value end) from jsonb_array_elements(v_run.failures)),'[]') else v_run.failures end));
    end if;
  end loop;
end; $$;
