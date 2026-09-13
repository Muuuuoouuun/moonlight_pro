-- Persistent suppression is separate from the discovery ledger and its revisions.
begin;
create table if not exists public.discovery_nudge_states (
  workspace_id uuid not null,
  record_id uuid not null,
  revision bigint not null check (revision between 1 and 9007199254740991),
  trigger_key text check (trigger_key is null or (length(trigger_key) between 1 and 128 and trigger_key collate "C" ~ '^[a-zA-Z0-9:_-]+$')),
  snoozed_until date check (snoozed_until between date '0001-01-01' and date '9999-12-31'),
  dismissed boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key(workspace_id,record_id),
  foreign key(workspace_id,record_id) references public.discovery_records(workspace_id,id) on delete cascade,
  check (not dismissed or (trigger_key is not null and snoozed_until is null))
);
create table if not exists public.discovery_nudge_receipts (
  workspace_id uuid not null,
  request_id uuid not null,
  record_id uuid not null,
  request_payload jsonb not null check (jsonb_typeof(request_payload)='object'),
  response jsonb not null check (jsonb_typeof(response)='object'),
  created_at timestamptz not null default now(),
  primary key(workspace_id,request_id),
  foreign key(workspace_id,record_id) references public.discovery_records(workspace_id,id) on delete cascade
);
create index if not exists discovery_nudge_receipts_record_idx on public.discovery_nudge_receipts(workspace_id,record_id);
alter table public.discovery_nudge_states enable row level security;
alter table public.discovery_nudge_receipts enable row level security;
revoke all on public.discovery_nudge_states,public.discovery_nudge_receipts from public,anon,authenticated,service_role;
grant select on public.discovery_nudge_states,public.discovery_nudge_receipts to service_role;

create or replace function public.read_discovery_nudge_v1(p_workspace_id uuid,p_record_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare
  v_record public.discovery_records%rowtype;
  v_state public.discovery_nudge_states%rowtype;
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_review date;
  v_evidence text; v_hypothesis text; v_experiment text; v_findings text;
  v_spaces text := E' \t\n\r\f\v'||U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF';
  v_done jsonb;
  v_rule text; v_field text; v_key text; v_trigger jsonb;
  v_candidate jsonb; v_suppression jsonb;
begin
  select * into v_record from public.discovery_records where workspace_id=p_workspace_id and id=p_record_id;
  if v_record.id is null then return jsonb_build_object('status','error','context',null); end if;
  select * into v_state from public.discovery_nudge_states where workspace_id=p_workspace_id and record_id=p_record_id;
  v_review := (v_record.snapshot->>'reviewDate')::date;
  v_evidence := btrim(coalesce(v_record.snapshot->>'evidence',''),v_spaces);
  v_hypothesis := btrim(coalesce(v_record.snapshot->>'hypothesis',''),v_spaces);
  v_experiment := btrim(coalesce(v_record.snapshot->>'experiment',''),v_spaces);
  v_findings := btrim(coalesce(v_record.snapshot->>'findings',''),v_spaces);

  if v_record.snapshot->>'status'<>'closed' then
    -- Priority is selected first; hiding a review must not reveal a lesser nudge.
    if v_review<=v_today then
      v_rule:='review'; v_field:='reviewDate'; v_trigger:=to_jsonb(v_review);
    else
      if v_findings='' then
        select jsonb_agg(jsonb_build_object('id',t.id,'updatedAt',extract(epoch from t.updated_at)) order by t.id)
          into v_done from public.tasks t
          where t.workspace_id=p_workspace_id and t.status='done'
            and exists(select 1 from jsonb_array_elements(coalesce(v_record.snapshot->'links','[]'::jsonb)) link
              where link->>'type'='task' and lower(link->>'id')=t.id::text);
      end if;
      if v_done is not null then
        v_rule:='result'; v_field:='findings'; v_trigger:=jsonb_build_object('experiment',v_experiment,'done',v_done);
      elsif v_record.snapshot->>'status'<>'paused' then
        if v_evidence='' then
          v_rule:='evidence'; v_field:='evidence'; v_trigger:=to_jsonb(v_evidence);
        elsif v_hypothesis='' then
          v_rule:='hypothesis'; v_field:='hypothesis'; v_trigger:=to_jsonb(v_hypothesis);
        elsif v_experiment='' then
          v_rule:='experiment'; v_field:='experiment'; v_trigger:=to_jsonb(v_experiment);
        elsif v_findings<>'' and v_review is null then
          v_rule:='decision'; v_field:='status'; v_trigger:=to_jsonb(v_findings);
        end if;
      end if;
    end if;
  end if;
  if v_rule is not null then
    -- Fingerprints deliberately exclude titles, ledger revisions and link labels.
    v_key:=v_rule||':'||md5(v_trigger::text);
    v_candidate:=jsonb_build_object('ruleId',v_rule,'triggerKey',v_key,'field',v_field);
  end if;
  -- Snooze spans the record even when its highest candidate changes or resolves.
  if v_state.snoozed_until>v_today then
    v_suppression:=jsonb_build_object('kind','snoozed','until',v_state.snoozed_until);
  elsif v_state.dismissed and v_state.trigger_key=v_key then
    v_suppression:=jsonb_build_object('kind','dismissed','until',null);
  end if;
  return jsonb_build_object('status','live','context',jsonb_build_object(
    'recordId',v_record.id,'recordRevision',v_record.revision,'stateRevision',coalesce(v_state.revision,0),
    'today',v_today,'candidate',v_candidate,'suppression',v_suppression,'visible',v_candidate is not null and v_suppression is null));
end;
$$;
revoke all on function public.read_discovery_nudge_v1(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.read_discovery_nudge_v1(uuid,uuid) to service_role;

create or replace function public.save_discovery_nudge_v1(p_workspace_id uuid,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  v_id uuid; v_request uuid; v_expected bigint; v_until date;
  v_action text; v_key text; v_context jsonb; v_response jsonb;
  v_record public.discovery_records%rowtype;
  v_receipt public.discovery_nudge_receipts%rowtype;
  v_invalid jsonb := '{"status":"invalid-input","context":null}'::jsonb;
begin
  if p_workspace_id is null or not exists(select 1 from public.workspaces where id=p_workspace_id)
    or p_payload is null or jsonb_typeof(p_payload)<>'object'
    or not p_payload ?& array['recordId','requestId','expectedRevision','triggerKey','action','until']
    or (p_payload-array['recordId','requestId','expectedRevision','triggerKey','action','until'])<>'{}'::jsonb
  then return v_invalid; end if;
  begin
    if jsonb_typeof(p_payload->'recordId')<>'string' or (p_payload->>'recordId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or jsonb_typeof(p_payload->'requestId')<>'string' or (p_payload->>'requestId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or jsonb_typeof(p_payload->'expectedRevision')<>'number' or (p_payload->>'expectedRevision') !~ '^[0-9]+$'
      or jsonb_typeof(p_payload->'action')<>'string' or (p_payload->>'action') not in ('snooze','dismiss','resume')
    then return v_invalid; end if;
    v_id:=(p_payload->>'recordId')::uuid; v_request:=(p_payload->>'requestId')::uuid;
    v_expected:=(p_payload->>'expectedRevision')::bigint; v_action:=p_payload->>'action'; v_key:=p_payload->>'triggerKey';
    if v_expected<0 or v_expected>=9007199254740991
      or (p_payload->'triggerKey'<>'null'::jsonb and (jsonb_typeof(p_payload->'triggerKey')<>'string' or length(v_key) not between 1 and 128 or v_key collate "C" !~ '^[a-zA-Z0-9:_-]+$'))
      or (v_action in ('snooze','dismiss') and v_key is null)
      or (v_action='resume' and v_key is not null)
      or (v_action<>'snooze' and p_payload->'until'<>'null'::jsonb)
      or (v_action='snooze' and p_payload->'until'='null'::jsonb)
    then return v_invalid; end if;
    if p_payload->'until'<>'null'::jsonb then
      if jsonb_typeof(p_payload->'until')<>'string' or (p_payload->>'until') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then return v_invalid; end if;
      v_until:=(p_payload->>'until')::date;
      if v_until<date '0001-01-01' or v_until>date '9999-12-31' then return v_invalid; end if;
    end if;
  exception when invalid_text_representation or numeric_value_out_of_range or datetime_field_overflow or invalid_datetime_format then return v_invalid;
  end;

  perform pg_advisory_xact_lock(hashtextextended('discovery-nudge-request:'||p_workspace_id::text||':'||v_request::text,0));
  select * into v_receipt from public.discovery_nudge_receipts where workspace_id=p_workspace_id and request_id=v_request;
  if v_receipt.request_id is not null then
    v_context:=public.read_discovery_nudge_v1(p_workspace_id,v_id)->'context';
    if v_context='null'::jsonb then return v_invalid; end if;
    if v_receipt.request_payload is distinct from p_payload then
      return jsonb_build_object('status','conflict','context',v_context);
    end if;
    -- Receipts never change; old retries receive the current record/state context.
    return jsonb_build_object('status','duplicate','context',v_context);
  end if;
  -- Reuse discovery's record lock so snapshot edits cannot race candidate checks.
  perform pg_advisory_xact_lock(hashtextextended('discovery-record:'||v_id::text,0));
  select * into v_record from public.discovery_records where workspace_id=p_workspace_id and id=v_id for update;
  if v_record.id is null then return v_invalid; end if;
  -- Task completion is another trigger source: keep linked task rows fixed to commit.
  perform t.id from public.tasks t where t.workspace_id=p_workspace_id
    and exists(select 1 from jsonb_array_elements(coalesce(v_record.snapshot->'links','[]'::jsonb)) link
      where link->>'type'='task' and lower(link->>'id')=t.id::text)
    order by t.id for share;
  v_context:=public.read_discovery_nudge_v1(p_workspace_id,v_id)->'context';
  if v_action='snooze' and (v_until<=(v_context->>'today')::date or v_until>(v_context->>'today')::date+365) then return v_invalid; end if;
  if (v_context->>'stateRevision')::bigint<>v_expected
    or (v_action in ('dismiss','snooze') and (v_context->'candidate'->>'triggerKey') is distinct from v_key)
  then return jsonb_build_object('status','conflict','context',v_context); end if;

  insert into public.discovery_nudge_states(workspace_id,record_id,revision,trigger_key,snoozed_until,dismissed)
    values(p_workspace_id,v_id,1,case when v_action='resume' then null else v_key end,v_until,v_action='dismiss')
    on conflict(workspace_id,record_id) do update set revision=discovery_nudge_states.revision+1,
      trigger_key=excluded.trigger_key,snoozed_until=excluded.snoozed_until,dismissed=excluded.dismissed,updated_at=clock_timestamp();
  v_response:=jsonb_build_object('status','saved','context',public.read_discovery_nudge_v1(p_workspace_id,v_id)->'context');
  insert into public.discovery_nudge_receipts(workspace_id,request_id,record_id,request_payload,response)
    values(p_workspace_id,v_request,v_id,p_payload,v_response);
  return v_response;
end;
$$;
revoke all on function public.save_discovery_nudge_v1(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.save_discovery_nudge_v1(uuid,jsonb) to service_role;
commit;
