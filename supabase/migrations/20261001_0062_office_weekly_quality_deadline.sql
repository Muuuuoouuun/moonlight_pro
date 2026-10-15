-- Give only newly claimed, non-Council weekly reports time for their bounded
-- draft and source review. Existing attempts and all other workflow deadlines stay intact.
create or replace function public.office_request_claim_v1(p_workspace_id uuid,p_actor_id text,p_request jsonb,p_context jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_row public.office_requests%rowtype;v_id uuid;v_parent uuid;v_hash text;v_intent text;v_scope text;v_origin jsonb;
begin
  if not public.office_identity_valid_v1(p_workspace_id,p_actor_id)
    or jsonb_typeof(p_request) is distinct from 'object' or jsonb_typeof(p_context) is distinct from 'object'
    -- Wire contracts keep facts at 24 KiB. JSONB text adds formatting spaces;
    -- the storage ceiling includes that overhead instead of rejecting valid JSON.
    or octet_length(p_request::text)>100000 or octet_length((p_context->'facts')::text)>49152 then
    return jsonb_build_object('status','invalid-input','error','invalid-request','persisted',false);
  end if;
  v_id:=(p_request->>'requestId')::uuid;v_parent:=(p_request->>'parentRequestId')::uuid;
  v_intent:=p_request->>'intent';v_scope:=p_request->>'scope';v_origin:=p_request->'originRef';
  if v_id is null or v_intent not in ('weekly_report','customer_reply') or v_scope not in ('classin','personal')
    or v_intent is null or v_scope is null or jsonb_typeof(v_origin) is distinct from 'object'
    or p_context->>'scope' is distinct from v_scope or p_context->'originRef' is distinct from v_origin
    or p_context->>'contextHash' is distinct from p_request->>'expectedContextHash'
    or coalesce(p_context->>'contextHash','') !~ '^[0-9a-f]{64}$'
    or p_context->>'status' is distinct from 'ready' or p_context->'capabilities'->>'generate' is distinct from 'true' then
    return jsonb_build_object('status','invalid-input','error','invalid-request-context','persisted',false);
  end if;
  v_hash:=encode(sha256(convert_to(p_request::text,'UTF8')),'hex');
  perform pg_advisory_xact_lock(hashtextextended('office:'||v_id::text,0));
  select * into v_row from public.office_requests where id=v_id;
  if found then
    if v_row.workspace_id<>p_workspace_id or v_row.actor_id<>p_actor_id or v_row.request_hash<>v_hash then
      return jsonb_build_object('status','conflict','error','request-id-reuse','persisted',false);
    end if;
    return public.office_request_envelope_v1(v_row);
  end if;
  if v_parent is not null then
    perform 1 from public.office_requests where id=v_parent and workspace_id=p_workspace_id and actor_id=p_actor_id
      and scope=v_scope and intent=v_intent and origin_ref=v_origin;
    if not found then return jsonb_build_object('status','invalid-input','error','invalid-parent','persisted',false); end if;
  end if;
  insert into public.office_requests(id,workspace_id,actor_id,request_hash,request_contract_version,intent,owner_id,mode,participants,scope,
    origin_ref,origin_key,context_hash,source_refs,input_snapshot,context_snapshot,state,attempt_token,deadline_at,parent_request_id)
  values(v_id,p_workspace_id,p_actor_id,v_hash,'2026-09-21.v1',v_intent,p_request->>'ownerId',p_request->>'mode',p_request->'participants',v_scope,
    v_origin,public.office_origin_key_v1(v_intent,v_scope,v_origin),p_context->>'contextHash',p_context->'sourceRefs',p_request,p_context,
    -- office_weekly_content_deadline_v1: two bounded quality stages share a 95s
    -- Engine budget and a 105s Hub budget. Replays never renew this deadline.
    'running',gen_random_uuid(),clock_timestamp()+case
      when v_intent='weekly_report' and p_request->>'mode'<>'council' then interval '120 seconds'
      else interval '60 seconds' end,v_parent) returning * into v_row;
  return public.office_request_envelope_v1(v_row,true);
exception when invalid_text_representation or not_null_violation or check_violation or foreign_key_violation then
  return jsonb_build_object('status','invalid-input','error','invalid-request','persisted',false);
end; $$;

revoke all on function public.office_request_claim_v1(uuid,text,jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.office_request_claim_v1(uuid,text,jsonb,jsonb) to service_role;
