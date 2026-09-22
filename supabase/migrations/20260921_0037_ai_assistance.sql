-- Requires 0036 for the canonical transactional entity scope resolver.
begin;
-- Source-backed suggestions are separate from applied work and business outcomes.
CREATE TABLE IF NOT EXISTS public.operating_ai_candidates (
 id uuid PRIMARY KEY, workspace_id uuid NOT NULL REFERENCES public.workspaces(id), actor_id text NOT NULL,
 entity_type text NOT NULL CHECK(entity_type IN ('tasks','projects','content_items')), entity_id uuid NOT NULL,
 scope text NOT NULL CHECK(scope IN ('personal','company')), source_updated_at timestamptz NOT NULL,
 source_snapshot jsonb NOT NULL, operation text NOT NULL CHECK(operation IN ('draft','rewrite','critique','analyze')),
 instruction text NOT NULL DEFAULT '', status text NOT NULL CHECK(status IN ('running','saved','generated','error','unknown')),
 output text, provider text, client text, model text, usage jsonb, usage_reason text NOT NULL DEFAULT 'not-reported',
 review jsonb, revision integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(octet_length(coalesce(output,'')) <= 24000), CHECK(octet_length(source_snapshot::text) <= 40000)
);
CREATE INDEX IF NOT EXISTS operating_ai_entity_idx ON public.operating_ai_candidates(workspace_id,entity_type,entity_id,created_at DESC);
CREATE TABLE IF NOT EXISTS public.operating_ai_receipts (
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id), command_id uuid NOT NULL, actor_id text NOT NULL,
 request jsonb NOT NULL, candidate_id uuid NOT NULL REFERENCES public.operating_ai_candidates(id),
 response jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(workspace_id,command_id)
);
ALTER TABLE public.operating_ai_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operating_ai_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.operating_ai_candidates, public.operating_ai_receipts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.operating_ai_candidates TO service_role;

CREATE OR REPLACE FUNCTION public.operating_ai_receipt_v1(p_workspace_id uuid,p_actor_id text,p_command_id uuid,p_request jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r operating_ai_receipts; c operating_ai_candidates;
BEGIN
 SELECT * INTO r FROM operating_ai_receipts WHERE workspace_id=p_workspace_id AND command_id=p_command_id AND actor_id=p_actor_id;
 IF NOT FOUND THEN RETURN jsonb_build_object('status','unknown','persisted',NULL,'error','receipt-not-found','commandId',p_command_id); END IF;
 IF p_request IS NOT NULL AND r.request<>p_request THEN RETURN jsonb_build_object('status','conflict','persisted',false,'error','command-conflict'); END IF;
 IF r.request->>'action'='generate' THEN
  SELECT * INTO c FROM operating_ai_candidates WHERE id=r.candidate_id AND workspace_id=p_workspace_id;
  RETURN jsonb_build_object('status',CASE WHEN c.status='running' AND c.created_at<now()-interval '2 minutes' THEN 'unknown' ELSE c.status END,'persisted',true,'replayed',true,'claimed',false,'commandId',p_command_id,'candidate',to_jsonb(c));
 END IF;
 RETURN r.response || jsonb_build_object('replayed',true,'claimed',false);
END $$;

CREATE OR REPLACE FUNCTION public.operating_ai_command_v1(p_workspace_id uuid,p_actor_id text,p_command jsonb,p_source jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_id uuid; v_action text; v_input jsonb; v_type text; v_entity uuid; v_version timestamptz;
 c operating_ai_candidates; response jsonb; previous jsonb; v_review jsonb; k text;
BEGIN
 IF p_workspace_id IS NULL OR coalesce(p_actor_id,'')='' OR jsonb_typeof(p_command)<>'object'
    OR octet_length(p_command::text)>40000 THEN RETURN jsonb_build_object('status','invalid-input','persisted',false,'error','invalid-command'); END IF;
 v_id:=(p_command->>'commandId')::uuid; v_action:=p_command->>'action'; v_input:=p_command->'input';
 IF v_id IS NULL OR v_action NOT IN ('save_candidate','generate','review_candidate') OR jsonb_typeof(v_input)<>'object' THEN
 RETURN jsonb_build_object('status','invalid-input','persisted',false,'error','invalid-command'); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||v_id::text,0));
 previous:=operating_ai_receipt_v1(p_workspace_id,p_actor_id,v_id,p_command);
 IF previous->>'persisted'='true' OR previous->>'status'='conflict' THEN RETURN previous; END IF;
 -- An ID belongs to its original actor as well as its content.
 IF EXISTS(SELECT 1 FROM operating_ai_receipts WHERE workspace_id=p_workspace_id AND command_id=v_id) THEN
 RETURN jsonb_build_object('status','conflict','persisted',false,'error','command-conflict'); END IF;
 IF v_action='review_candidate' THEN
  SELECT * INTO c FROM operating_ai_candidates WHERE workspace_id=p_workspace_id AND id=(v_input->>'candidateId')::uuid FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','error','persisted',false,'error','candidate-not-found'); END IF;
  IF c.status NOT IN ('saved','generated') OR c.revision<>(v_input->>'expectedRevision')::integer THEN
   RETURN jsonb_build_object('status','conflict','persisted',false,'error','candidate-conflict'); END IF;
  IF v_input->>'outcome' NOT IN ('accepted','edited','rejected') THEN RETURN jsonb_build_object('status','invalid-input','persisted',false,'error','invalid-review'); END IF;
  FOREACH k IN ARRAY ARRAY['baselineMinutes','reviewMinutes','actualMinutes'] LOOP
   IF v_input->k IS NOT NULL AND v_input->k<>'null'::jsonb AND (jsonb_typeof(v_input->k)<>'number' OR (v_input->>k)::numeric<0 OR (v_input->>k)::numeric>10080) THEN
    RETURN jsonb_build_object('status','invalid-input','persisted',false,'error','invalid-minutes'); END IF;
  END LOOP;
  v_review:=v_input-'candidateId'-'expectedRevision';
  UPDATE operating_ai_candidates SET review=v_review,revision=revision+1,updated_at=now() WHERE id=c.id RETURNING * INTO c;
 ELSE
  v_type:=v_input->>'entityType'; v_entity:=(v_input->>'entityId')::uuid;
  IF v_type NOT IN ('tasks','projects','content_items') OR v_input->>'scope' NOT IN ('personal','company')
   OR v_input->>'operation' NOT IN ('draft','rewrite','critique','analyze') OR p_source IS NULL THEN
   RETURN jsonb_build_object('status','invalid-input','persisted',false,'error','invalid-source'); END IF;
  EXECUTE format('SELECT updated_at FROM public.%I WHERE workspace_id=$1 AND id=$2 FOR SHARE',v_type) INTO v_version USING p_workspace_id,v_entity;
  IF v_version IS NULL THEN RETURN jsonb_build_object('status','error','persisted',false,'error','source-not-found'); END IF;
  IF public.operating_goal_entity_scope_v1(p_workspace_id,v_type,v_entity) IS DISTINCT FROM v_input->>'scope' THEN RETURN jsonb_build_object('status','conflict','persisted',false,'error','scope-mismatch'); END IF;
  IF v_version<>(v_input->>'expectedSourceUpdatedAt')::timestamptz THEN RETURN jsonb_build_object('status','conflict','persisted',false,'error','source-conflict'); END IF;
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

CREATE OR REPLACE FUNCTION public.operating_ai_finish_v1(p_workspace_id uuid,p_actor_id text,p_candidate_id uuid,p_result jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c operating_ai_candidates; v_status text;
BEGIN
 SELECT * INTO c FROM operating_ai_candidates WHERE workspace_id=p_workspace_id AND actor_id=p_actor_id AND id=p_candidate_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('status','error','persisted',false,'error','candidate-not-found'); END IF;
 IF c.status='running' THEN
  v_status:=CASE WHEN p_result->>'status'='generated' AND coalesce(trim(p_result->>'output'),'')<>'' AND octet_length(p_result->>'output')<=24000 THEN 'generated'
                 WHEN p_result->>'status' IN ('error','preview','invalid-input') THEN 'error' ELSE 'unknown' END;
  UPDATE operating_ai_candidates SET status=v_status,output=CASE WHEN v_status='generated' THEN p_result->>'output' ELSE NULL END,
   model=p_result->>'model',usage=nullif(p_result->'usage','null'::jsonb),usage_reason=CASE WHEN nullif(p_result->'usage','null'::jsonb) IS NULL THEN 'not-reported' ELSE 'reported' END,
   updated_at=now() WHERE id=c.id RETURNING * INTO c;
 END IF;
 RETURN jsonb_build_object('status',c.status,'persisted',true,'commandId',p_candidate_id,'candidate',to_jsonb(c));
END $$;
REVOKE ALL ON FUNCTION public.operating_ai_command_v1(uuid,text,jsonb,jsonb),public.operating_ai_receipt_v1(uuid,text,uuid,jsonb),public.operating_ai_finish_v1(uuid,text,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.operating_ai_command_v1(uuid,text,jsonb,jsonb),public.operating_ai_receipt_v1(uuid,text,uuid,jsonb),public.operating_ai_finish_v1(uuid,text,uuid,jsonb) TO service_role;

commit;
