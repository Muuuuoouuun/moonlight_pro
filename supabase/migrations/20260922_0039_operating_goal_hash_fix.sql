-- Operating goal writes: replace the pgcrypto request hash with the built-in sha256.
--
-- 20260921_0036 computed the receipt hash with public.digest(). On Supabase pgcrypto
-- is installed in schema "extensions", so public.digest(text,text) does not exist and
-- every operating_goal_command_v1 call raised 42883 (PostgREST 404), which the Hub
-- reports as goals-migration-required. No goal command ever succeeded, so
-- operating_goal_receipts is empty and no stored request_hash changes meaning.
--
-- This redefines only operating_goal_command_v1, verbatim from 0036 except:
--   1. v_hash uses sha256(convert_to(...,'UTF8')), like every other command RPC
--      (20260921_0038_office_requests.sql), so it no longer depends on where
--      pgcrypto lives.
--   2. The exception clause also maps invalid_time_zone_displacement_value (22009)
--      and invalid_datetime_format (22007) to the invalid-input envelope. An
--      observedAt/occurredAt offset such as +16:00 matches the format regex but is
--      outside PostgreSQL's +-15:59 range; it used to escape as a raw error that the
--      Hub maps to command-outcome-unknown.
--   3. search_path pins pg_temp last so temporary objects cannot shadow names inside
--      this security definer function.
-- Same signature, same return shapes, same grants. Safe to re-apply.
begin;
create or replace function public.operating_goal_command_v1(p_workspace_id uuid,p_actor_id text,p_command jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare
  v_id uuid; v_action text:=p_command->>'action'; v_input jsonb:=p_command->'input';
  v_hash text; v_receipt public.operating_goal_receipts%rowtype;
  v_objective public.operating_objectives%rowtype; v_metric public.operating_metrics%rowtype;
  v_observation public.operating_observations%rowtype; v_entity jsonb; v_before jsonb;
  v_expected bigint; v_kind text; v_exists boolean; v_table text; v_evidence jsonb;
  v_error jsonb:=jsonb_build_object('status','invalid-input','persisted',false,'error','invalid-command');
begin
  if p_workspace_id is null or p_actor_id is null or p_actor_id!~'^[a-zA-Z0-9._:@/-]{1,128}$'
    or jsonb_typeof(p_command) is distinct from 'object' or octet_length(p_command::text)>65536
    or (p_command-array['commandId','action','expectedRevision','input'])<>'{}'::jsonb
    or jsonb_typeof(v_input) is distinct from 'object' or v_action is null
    or v_action not in ('create_objective','update_objective','create_metric','archive_metric','record_observation','link_entity','unlink_entity')
    or p_command->>'commandId' is null then return v_error; end if;
  v_id:=(p_command->>'commandId')::uuid;
  perform 1 from public.workspaces where id=p_workspace_id;
  if not found then return v_error||jsonb_build_object('error','workspace-unavailable'); end if;
  v_hash:=encode(sha256(convert_to(p_command::text,'UTF8')),'hex');
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||':'||p_actor_id||':'||v_id::text,0));
  select * into v_receipt from public.operating_goal_receipts where workspace_id=p_workspace_id and actor_id=p_actor_id and command_id=v_id;
  if found then
    if v_receipt.request_hash<>v_hash then return jsonb_build_object('status','conflict','persisted',false,'error','command-id-reused','commandId',v_id); end if;
    return v_receipt.response||jsonb_build_object('replayed',true);
  end if;
  if v_action in ('update_objective','archive_metric','link_entity','unlink_entity') then
    if jsonb_typeof(p_command->'expectedRevision') is distinct from 'number' or (p_command->>'expectedRevision')!~'^[1-9][0-9]*$' then return v_error||jsonb_build_object('error','invalid-revision'); end if;
    v_expected:=(p_command->>'expectedRevision')::bigint;
    if v_expected>9007199254740991 then return v_error; end if;
  elsif p_command ? 'expectedRevision' then return v_error; end if;

  if v_action='create_objective' then
    if (v_input-array['title','description','scope','periodStart','periodEnd','timezone'])<>'{}'::jsonb
      or jsonb_typeof(v_input->'title') is distinct from 'string'
      or (v_input ? 'description' and jsonb_typeof(v_input->'description') is distinct from 'string')
      or coalesce(v_input->>'periodStart','')!~'^\d{4}-\d{2}-\d{2}$' or coalesce(v_input->>'periodEnd','')!~'^\d{4}-\d{2}-\d{2}$'
      or not exists(select 1 from pg_timezone_names where name=v_input->>'timezone') then return v_error; end if;
    insert into public.operating_objectives(workspace_id,title,description,scope,period_start,period_end,timezone)
      values(p_workspace_id,btrim(v_input->>'title'),coalesce(v_input->>'description',''),v_input->>'scope',(v_input->>'periodStart')::date,(v_input->>'periodEnd')::date,v_input->>'timezone') returning * into v_objective;
    v_entity:=public.operating_goal_project_v1('objective',to_jsonb(v_objective));
  elsif v_action in ('update_objective','create_metric','link_entity','unlink_entity') then
    select * into v_objective from public.operating_objectives where workspace_id=p_workspace_id and id=(case when v_action='update_objective' then v_input->>'id' else v_input->>'objectiveId' end)::uuid for update;
    if not found then return v_error||jsonb_build_object('error','objective-not-found'); end if;
    v_before:=public.operating_goal_project_v1('objective',to_jsonb(v_objective));
    if v_expected is not null and v_expected<>v_objective.revision then return jsonb_build_object('status','conflict','persisted',false,'error','stale-revision','entity',v_before); end if;
    if v_action not in ('update_objective','unlink_entity') and v_objective.status<>'active' then return v_error||jsonb_build_object('error','objective-archived'); end if;
    if v_action='update_objective' then
      if (v_input-array['id','title','description','status'])<>'{}'::jsonb or v_input-'id'='{}'::jsonb
        or (v_input ? 'title' and jsonb_typeof(v_input->'title') is distinct from 'string')
        or (v_input ? 'description' and jsonb_typeof(v_input->'description') is distinct from 'string') then return v_error; end if;
      update public.operating_objectives set title=case when v_input?'title' then btrim(v_input->>'title') else title end,
        description=case when v_input?'description' then v_input->>'description' else description end,
        status=case when v_input?'status' then v_input->>'status' else status end,revision=revision+1,updated_at=clock_timestamp()
        where workspace_id=p_workspace_id and id=v_objective.id returning * into v_objective;
      v_entity:=public.operating_goal_project_v1('objective',to_jsonb(v_objective));
    elsif v_action='create_metric' then
      if (v_input-array['objectiveId','name','unit','role','direction','baseline','target','targetMin','targetMax','sourceKey'])<>'{}'::jsonb
        or jsonb_typeof(v_input->'name') is distinct from 'string' or jsonb_typeof(v_input->'unit') is distinct from 'string' then return v_error; end if;
      foreach v_kind in array array['baseline','target','targetMin','targetMax'] loop
        if v_input?v_kind and jsonb_typeof(v_input->v_kind) not in ('number','null') then return v_error; end if;
      end loop;
      insert into public.operating_metrics(workspace_id,objective_id,name,unit,role,direction,baseline,target,target_min,target_max,source_key)
        values(p_workspace_id,v_objective.id,btrim(v_input->>'name'),btrim(v_input->>'unit'),v_input->>'role',v_input->>'direction',(v_input->>'baseline')::numeric,(v_input->>'target')::numeric,(v_input->>'targetMin')::numeric,(v_input->>'targetMax')::numeric,v_input->>'sourceKey') returning * into v_metric;
      v_entity:=public.operating_goal_project_v1('metric',to_jsonb(v_metric));
    else
      if (v_input-array['objectiveId','entityType','entityId'])<>'{}'::jsonb or v_input->>'entityType' is null or v_input->>'entityType' not in ('projects','tasks','campaigns','brands','content_items','deals','leads','customer_accounts','memos','journal_entries') or v_input->>'entityId' is null then return v_error; end if;
      if v_action='link_entity' then
        v_table:=case when v_input->>'entityType'='memos' then 'journal_entries' else v_input->>'entityType' end;
        if to_regclass('public.'||v_table) is null then return v_error||jsonb_build_object('error','entity-unavailable'); end if;
        -- Table name is fixed by the allowlist above; values stay bound parameters.
        execute format('select true from public.%I where workspace_id=$1 and id=$2 for key share',v_table) into v_exists using p_workspace_id,(v_input->>'entityId')::uuid;
        if v_exists is distinct from true then return v_error||jsonb_build_object('error','entity-not-found'); end if;
        if public.operating_goal_entity_scope_v1(p_workspace_id,v_input->>'entityType',(v_input->>'entityId')::uuid) is distinct from v_objective.scope then return v_error||jsonb_build_object('error','entity-scope-mismatch'); end if;
        insert into public.operating_goal_links(workspace_id,objective_id,entity_type,entity_id) values(p_workspace_id,v_objective.id,v_input->>'entityType',(v_input->>'entityId')::uuid) on conflict do nothing;
      -- Unlink acts on the objective's relation, so a deleted source must not
      -- prevent cleanup. The objective lock, workspace and CAS still apply.
      else delete from public.operating_goal_links where workspace_id=p_workspace_id and objective_id=v_objective.id and entity_type=v_input->>'entityType' and entity_id=(v_input->>'entityId')::uuid; end if;
      update public.operating_objectives set revision=revision+1,updated_at=clock_timestamp() where workspace_id=p_workspace_id and id=v_objective.id returning * into v_objective;
      v_entity:=jsonb_build_object('objectiveId',v_objective.id,'entityType',v_input->>'entityType','entityId',v_input->>'entityId','revision',v_objective.revision,'linked',v_action='link_entity');
    end if;
  else
    -- Lock objective before metric, consistent with all other command branches.
    select o.* into v_objective from public.operating_objectives o join public.operating_metrics m on m.workspace_id=o.workspace_id and m.objective_id=o.id
      where m.workspace_id=p_workspace_id and m.id=(case when v_action='archive_metric' then v_input->>'id' else v_input->>'metricId' end)::uuid for update of o;
    if not found then return v_error||jsonb_build_object('error','metric-not-found'); end if;
    select * into v_metric from public.operating_metrics where workspace_id=p_workspace_id and id=(case when v_action='archive_metric' then v_input->>'id' else v_input->>'metricId' end)::uuid for update;
    v_before:=public.operating_goal_project_v1('metric',to_jsonb(v_metric));
    if v_action='archive_metric' then
      if (v_input-'id')<>'{}'::jsonb then return v_error; end if;
      if v_expected<>v_metric.revision then return jsonb_build_object('status','conflict','persisted',false,'error','stale-revision','entity',v_before); end if;
      update public.operating_metrics set status='archived',revision=revision+1,updated_at=clock_timestamp() where workspace_id=p_workspace_id and id=v_metric.id returning * into v_metric;
      v_entity:=public.operating_goal_project_v1('metric',to_jsonb(v_metric));
    else
      if (v_input-array['metricId','value','observedAt','periodStart','periodEnd','coverage','evidence','note','sourceKey'])<>'{}'::jsonb
        or v_metric.source_key<>'manual' or v_metric.status<>'active' or v_objective.status<>'active'
        or (v_input?'sourceKey' and v_input->>'sourceKey' is distinct from 'manual')
        or jsonb_typeof(v_input->'value') not in ('number','null') or not(v_input?'value')
        or (v_input?'note' and jsonb_typeof(v_input->'note') is distinct from 'string')
        or coalesce(v_input->>'observedAt','')!~'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$'
        or (v_input->>'observedAt')::timestamptz>clock_timestamp()
        or ((v_input->>'observedAt')::timestamptz at time zone v_objective.timezone)::date<v_objective.period_start
        or coalesce(v_input->>'periodStart','')!~'^\d{4}-\d{2}-\d{2}$' or coalesce(v_input->>'periodEnd','')!~'^\d{4}-\d{2}-\d{2}$'
        or (v_input->>'periodStart')::date is distinct from v_objective.period_start or (v_input->>'periodEnd')::date is distinct from v_objective.period_end
        or jsonb_typeof(v_input->'evidence') is distinct from 'array' then return v_error||jsonb_build_object('error','invalid-observation'); end if;
      for v_evidence in select value from jsonb_array_elements(v_input->'evidence') loop
        if jsonb_typeof(v_evidence) is distinct from 'object' or (v_evidence-array['type','label','href','occurredAt'])<>'{}'::jsonb
          or (v_evidence?'type' and v_evidence->>'type' is distinct from 'manual')
          or jsonb_typeof(v_evidence->'label') is distinct from 'string' or length(btrim(v_evidence->>'label')) not between 1 and 300
          or length(coalesce(v_evidence->>'href','')) not between 1 and 2048
          or coalesce(v_evidence->>'href','')!~'^(https?://[^/@[:space:]]+|/dashboard([/?#]|$))'
          or (v_evidence->>'href')~'[[:cntrl:]\\]' or (v_evidence->>'href')~'^https?://[^/]*@'
          or coalesce(v_evidence->>'occurredAt','')!~'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$' then return v_error||jsonb_build_object('error','invalid-evidence'); end if;
        perform (v_evidence->>'occurredAt')::timestamptz;
        if (v_evidence->>'occurredAt')::timestamptz>(v_input->>'observedAt')::timestamptz then return v_error||jsonb_build_object('error','evidence-after-observation'); end if;
      end loop;
      insert into public.operating_observations(workspace_id,metric_id,value,observed_at,period_start,period_end,coverage,evidence,note)
        values(p_workspace_id,v_metric.id,(v_input->>'value')::numeric,(v_input->>'observedAt')::timestamptz,(v_input->>'periodStart')::date,(v_input->>'periodEnd')::date,v_input->>'coverage',v_input->'evidence',coalesce(v_input->>'note','')) returning * into v_observation;
      v_entity:=public.operating_goal_project_v1('observation',to_jsonb(v_observation));
    end if;
  end if;
  v_entity:=jsonb_build_object('status','saved','persisted',true,'replayed',false,'commandId',v_id,'entity',v_entity);
  insert into public.operating_goal_receipts(workspace_id,actor_id,command_id,request_hash,response,before_snapshot) values(p_workspace_id,p_actor_id,v_id,v_hash,v_entity,v_before);
  return v_entity;
exception when invalid_text_representation or datetime_field_overflow or invalid_time_zone_displacement_value or invalid_datetime_format
  or check_violation or not_null_violation or numeric_value_out_of_range then
  return v_error;
end; $$;
revoke all on function public.operating_goal_command_v1(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.operating_goal_command_v1(uuid,text,jsonb) to service_role;
commit;
