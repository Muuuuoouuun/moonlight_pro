-- Requires 20260921_0037_ai_assistance.sql. Forward-only hardening of the AI assistance ledger; idempotent.
-- 1) 0037 revoked table privileges from public/anon/authenticated only, so Supabase's default
--    privileges still let service_role INSERT/UPDATE/DELETE/TRUNCATE both tables directly.
--    Writes must go only through the SECURITY DEFINER RPCs below (siblings 0031/0032/0036/0038).
--    The Hub reads operating_ai_candidates over PostgREST, so service_role keeps SELECT there;
--    operating_ai_receipts is read only through operating_ai_receipt_v1, as 0037 intended.
-- 2) PL/pgSQL IF treats NULL as false, so a missing action/input/expectedRevision/outcome/
--    expectedSourceUpdatedAt/scope/operation/entityType skipped validation or the CAS checks.
--    operating_ai_command_v1 is re-created from 0037 with NULL-safe checks only; valid commands
--    behave exactly as before, and missing fields return the existing invalid-input envelope.
begin;
REVOKE ALL ON public.operating_ai_candidates, public.operating_ai_receipts FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.operating_ai_candidates TO service_role;

CREATE OR REPLACE FUNCTION public.operating_ai_command_v1(p_workspace_id uuid,p_actor_id text,p_command jsonb,p_source jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_id uuid; v_action text; v_input jsonb; v_type text; v_entity uuid; v_version timestamptz;
 c operating_ai_candidates; response jsonb; previous jsonb; v_review jsonb; k text;
BEGIN
 IF p_workspace_id IS NULL OR coalesce(p_actor_id,'')='' OR jsonb_typeof(p_command) IS DISTINCT FROM 'object'
    OR octet_length(p_command::text)>40000 THEN RETURN jsonb_build_object('status','invalid-input','persisted',false,'error','invalid-command'); END IF;
 v_id:=(p_command->>'commandId')::uuid; v_action:=p_command->>'action'; v_input:=p_command->'input';
 IF v_id IS NULL OR v_action IS NULL OR v_action NOT IN ('save_candidate','generate','review_candidate') OR jsonb_typeof(v_input) IS DISTINCT FROM 'object' THEN
 RETURN jsonb_build_object('status','invalid-input','persisted',false,'error','invalid-command'); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||v_id::text,0));
 previous:=operating_ai_receipt_v1(p_workspace_id,p_actor_id,v_id,p_command);
 IF previous->>'persisted'='true' OR previous->>'status'='conflict' THEN RETURN previous; END IF;
 -- An ID belongs to its original actor as well as its content.
 IF EXISTS(SELECT 1 FROM operating_ai_receipts WHERE workspace_id=p_workspace_id AND command_id=v_id) THEN
 RETURN jsonb_build_object('status','conflict','persisted',false,'error','command-conflict'); END IF;
 IF v_action='review_candidate' THEN
  -- A review without its compare-and-set revision is malformed, not a stale write.
  IF v_input->>'expectedRevision' IS NULL THEN RETURN jsonb_build_object('status','invalid-input','persisted',false,'error','invalid-review'); END IF;
  SELECT * INTO c FROM operating_ai_candidates WHERE workspace_id=p_workspace_id AND id=(v_input->>'candidateId')::uuid FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','error','persisted',false,'error','candidate-not-found'); END IF;
  IF c.status NOT IN ('saved','generated') OR c.revision IS DISTINCT FROM (v_input->>'expectedRevision')::integer THEN
   RETURN jsonb_build_object('status','conflict','persisted',false,'error','candidate-conflict'); END IF;
  IF coalesce(v_input->>'outcome','') NOT IN ('accepted','edited','rejected') THEN RETURN jsonb_build_object('status','invalid-input','persisted',false,'error','invalid-review'); END IF;
  FOREACH k IN ARRAY ARRAY['baselineMinutes','reviewMinutes','actualMinutes'] LOOP
   IF v_input->k IS NOT NULL AND v_input->k<>'null'::jsonb AND (jsonb_typeof(v_input->k)<>'number' OR (v_input->>k)::numeric<0 OR (v_input->>k)::numeric>10080) THEN
    RETURN jsonb_build_object('status','invalid-input','persisted',false,'error','invalid-minutes'); END IF;
  END LOOP;
  v_review:=v_input-'candidateId'-'expectedRevision';
  UPDATE operating_ai_candidates SET review=v_review,revision=revision+1,updated_at=now() WHERE id=c.id RETURNING * INTO c;
 ELSE
  v_type:=v_input->>'entityType'; v_entity:=(v_input->>'entityId')::uuid;
  IF coalesce(v_type,'') NOT IN ('tasks','projects','content_items') OR coalesce(v_input->>'scope','') NOT IN ('personal','company')
   OR coalesce(v_input->>'operation','') NOT IN ('draft','rewrite','critique','analyze') OR v_input->>'expectedSourceUpdatedAt' IS NULL OR p_source IS NULL THEN
   RETURN jsonb_build_object('status','invalid-input','persisted',false,'error','invalid-source'); END IF;
  EXECUTE format('SELECT updated_at FROM public.%I WHERE workspace_id=$1 AND id=$2 FOR SHARE',v_type) INTO v_version USING p_workspace_id,v_entity;
  IF v_version IS NULL THEN RETURN jsonb_build_object('status','error','persisted',false,'error','source-not-found'); END IF;
  IF public.operating_goal_entity_scope_v1(p_workspace_id,v_type,v_entity) IS DISTINCT FROM v_input->>'scope' THEN RETURN jsonb_build_object('status','conflict','persisted',false,'error','scope-mismatch'); END IF;
  IF v_version IS DISTINCT FROM (v_input->>'expectedSourceUpdatedAt')::timestamptz THEN RETURN jsonb_build_object('status','conflict','persisted',false,'error','source-conflict'); END IF;
  IF v_action='save_candidate' AND (coalesce(trim(v_input->>'output'),'')='' OR coalesce(trim(v_input->>'client'),'')='') THEN
   RETURN jsonb_build_object('status','invalid-input','persisted',false,'error','empty-candidate'); END IF;
  INSERT INTO operating_ai_candidates(id,workspace_id,actor_id,entity_type,entity_id,scope,source_updated_at,source_snapshot,operation,instruction,status,output,provider,client,model)
   VALUES(v_id,p_workspace_id,p_actor_id,v_type,v_entity,v_input->>'scope',v_version,p_source,v_input->>'operation',coalesce(v_input->>'instruction',''),
    CASE WHEN v_action='generate' THEN 'running' ELSE 'saved' END,v_input->>'output',CASE WHEN v_action='generate' THEN 'gemini' ELSE 'client-reported' END,v_input->>'client',v_input->>'model') RETURNING * INTO c;
 END IF;
 response:=jsonb_build_object('status',CASE WHEN v_action='generate' THEN 'running' ELSE 'saved' END,'persisted',true,'replayed',false,'claimed',v_action='generate','commandId',v_id,'candidate',to_jsonb(c));
 INSERT INTO operating_ai_receipts(workspace_id,command_id,actor_id,request,candidate_id,response) VALUES(p_workspace_id,v_id,p_actor_id,p_command,c.id,response);
 RETURN response;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR datetime_field_overflow OR check_violation THEN
 RETURN jsonb_build_object('status','invalid-input','persisted',false,'error','invalid-command');
END $$;
REVOKE ALL ON FUNCTION public.operating_ai_command_v1(uuid,text,jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.operating_ai_command_v1(uuid,text,jsonb,jsonb) TO service_role;
commit;
