-- Office task application: only deterministic command refusals close the slot.
--
-- Requires 20260913_0032_agent_commands.sql and 20260921_0038_office_requests.sql.
-- Forward-only: replaces office_apply_task_v1 from 0038 with the same signature,
-- security definer and pinned search_path. No other function changes.
--
-- 0038 marked the application 'rejected' whenever agent_command_v1 answered
-- status<>'saved' with persisted=false. agent_command_v1 also answers that way
-- for transient storage failures (its "when others" branch -> code
-- command-storage-error, and undefined_* -> agent-commands-migration-required).
-- A rejected slot is terminal: retries end in application-rejected, the claim
-- returns the existing slot and the Hub never offers applyTask again, so that
-- Office result could never create its task.
--
-- agent_command_v1 deterministic codes (same stored command => same answer):
--   forbidden     invalid-agent-context, insufficient-scope
--   invalid-input invalid-command, invalid-workspace, invalid-task-*, invalid-title,
--                 invalid-status, invalid-priority, invalid-checklist*, invalid-*-reference,
--                 invalid-command-values, invalid-reference, *-expected-updated-at, ...
--   conflict      command-id-reuse, stale-update, task-id-already-exists
--   not-found     task-not-found, entity-not-found
-- Everything else (command-storage-error, agent-commands-migration-required, a
-- missing or future code) is transient/unknown. agent_command_v1 rolled back its
-- own task + receipt writes and this wrapper still holds the command advisory
-- lock, so the command definitely did not commit: the slot stays 'pending' and
-- the same stored command (same commandId, same payload hash) may be dispatched
-- again. The returned envelope keeps status 'error' / persisted false, which the
-- Engine and Hub already surface as "same command, check again", and states the
-- retry policy explicitly.
create or replace function public.office_apply_task_v1(p_workspace_id uuid,p_actor_id text,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_row public.office_requests%rowtype;v_app jsonb;v_command jsonb;v_id uuid;v_project uuid;v_deal uuid;
  v_receipt public.agent_command_receipts%rowtype;v_result jsonb;v_ref jsonb;v_entity jsonb;v_scope text;v_table text;v_ref_id uuid;
begin
  if not public.office_identity_valid_v1(p_workspace_id,p_actor_id) then return jsonb_build_object('status','error','error','invalid-context','persisted',false); end if;
  select * into v_row from public.office_requests where id=p_request_id and workspace_id=p_workspace_id and actor_id=p_actor_id for update;
  if not found or v_row.application is null then return jsonb_build_object('status','not-found','error','application-not-found','persisted',false); end if;
  v_app:=v_row.application;v_command:=v_app->'command';v_id:=(v_app->>'commandId')::uuid;
  -- Same lock as agent_command_v1. A not-found observation before this lock
  -- cannot decide whether a concurrently dispatched command committed.
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||':'||p_actor_id||':'||v_id::text,0));
  select * into v_receipt from public.agent_command_receipts where workspace_id=p_workspace_id and actor_id=p_actor_id and command_id=v_id;
  if found then
    if v_receipt.request_hash is distinct from v_app->>'payloadHash' then
      return jsonb_build_object('status','conflict','error','command-id-reuse','persisted',false);
    end if;
    v_result:=public.agent_command_public_receipt_v1(v_receipt.receipt||jsonb_build_object('replayed',true));
  else
    if v_app->>'state'='rejected' then return jsonb_build_object('status','conflict','error','application-rejected','persisted',false); end if;
    if v_app->>'commandContractVersion' is distinct from 'agent-command.v1' or v_command is null
      or v_app->>'payloadHash' is distinct from encode(sha256(convert_to(v_command::text,'UTF8')),'hex')
      or v_command->>'commandId' is distinct from v_id::text or v_command->>'targetId' is distinct from v_id::text
      or v_command->>'action' is distinct from 'create_task' or v_app->>'expectedScope' is distinct from v_row.scope then
      return jsonb_build_object('status','error','error','invalid-stored-application','persisted',false);
    end if;
    v_project:=(v_command->'payload'->>'project_id')::uuid;v_deal:=(v_command->'payload'->'meta'->>'deal_id')::uuid;
    if v_project is null or not exists(select 1 from jsonb_array_elements(v_app->'sourceRefs') ref where ref->>'type'='projects' and ref->>'id'=v_project::text)
      or (v_deal is not null and not exists(select 1 from jsonb_array_elements(v_app->'sourceRefs') ref where ref->>'type'='deals' and ref->>'id'=v_deal::text)) then
      return jsonb_build_object('status','error','error','missing-target-validation','persisted',false);
    end if;
    -- Reference rows and all scope ancestry remain stable through task commit.
    for v_ref in select value from jsonb_array_elements(v_app->'sourceRefs') order by value->>'type',value->>'id' loop
      v_table:=v_ref->>'type';v_ref_id:=(v_ref->>'id')::uuid;
      if v_table not in ('projects','deals','brands') then return jsonb_build_object('status','invalid-input','error','invalid-target-reference','persisted',false); end if;
      execute format('select to_jsonb(t) from public.%I t where workspace_id=$1 and id=$2 for share',v_table) into v_entity using p_workspace_id,v_ref_id;
      v_scope:=public.operating_goal_entity_scope_v1(p_workspace_id,v_table,v_ref_id);
      if v_entity is null or nullif(v_ref->>'updatedAt','') is null
        or (v_entity->>'updated_at')::timestamptz is distinct from (v_ref->>'updatedAt')::timestamptz
        or (v_table<>'brands' and v_scope is distinct from case when v_row.scope='classin' then 'company' else 'personal' end) then
        update public.office_requests set application=application||jsonb_build_object('state','rejected','error','target-changed') where id=p_request_id;
        return jsonb_build_object('status','conflict','error','target-changed','persisted',false,'commandId',v_id);
      end if;
    end loop;
    if public.office_project_hub_scope_v1(p_workspace_id,v_project) is distinct from v_row.scope then
      update public.office_requests set application=application||jsonb_build_object('state','rejected','error','scope-rules-disagree') where id=p_request_id;
      return jsonb_build_object('status','conflict','error','scope-rules-disagree','persisted',false,'commandId',v_id);
    end if;
    v_result:=public.agent_command_v1(p_workspace_id,p_actor_id,array['read','tasks:write'],v_command);
  end if;
  if v_result->>'status'<>'saved' and v_result->>'persisted'='false' then
    if v_result->>'code' in ('forbidden','invalid-input','conflict','not-found') then
      update public.office_requests set application=application||jsonb_build_object('state','rejected','error',v_result->>'error') where id=p_request_id;
    else
      -- Transient or unknown: the application slot is left untouched ('pending').
      v_result:=v_result||jsonb_build_object('retryable',true,'retryPolicy','same-command-id-and-input-only');
    end if;
  end if;
  return v_result;
exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
  return jsonb_build_object('status','invalid-input','error','invalid-stored-application','persisted',false);
end; $$;

-- Slots that the 0038 wrapper closed after a transient failure (only possible
-- between applying 0038 and this file) go back to 'pending'. The stored command
-- has no receipt-less commit path, and the wrapper re-checks the receipt,
-- payload hash and target versions under the command lock on the next dispatch.
-- Slots whose command body was already removed by office_requests_expire_v1
-- cannot be dispatched again and stay rejected. Idempotent.
update public.office_requests
  set application=(application-'error')||jsonb_build_object('state','pending')
  where application->>'state'='rejected'
    and application->>'error' in ('command-storage-error','contact-outcome-failed','agent-commands-migration-required')
    and application ? 'command' and application ? 'sourceRefs';

-- Same privileges as 20260921_0038_office_requests.sql for this function.
revoke all on function public.office_apply_task_v1(uuid,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.office_apply_task_v1(uuid,text,uuid) to service_role;
