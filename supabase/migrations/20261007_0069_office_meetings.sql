-- Operator-triggered durable Office meetings. No tools, dispatch, task writes or expiry sweep.
create table if not exists public.office_meetings (
 id uuid primary key,
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 operator_id text not null check(operator_id='operator'),
 scope text not null check(scope in ('personal','classin')),
 title text not null check(char_length(title) between 1 and 200),
 source_task_id uuid,
 source_task_snapshot jsonb,
 owner_id text not null,
 reviewers jsonb not null default '[]',
 mode text not null check(mode in ('chat','draft','review','council')),
 decision_context text not null default '' check(char_length(decision_context)<=4000),
 revision bigint not null default 1 check(revision>0),
 state text not null default 'open' check(state in ('open','closed')),
 create_hash text not null,
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp()
);
create table if not exists public.office_meeting_turns (
 id uuid primary key,
 meeting_id uuid not null references public.office_meetings(id) on delete cascade,
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 operator_id text not null check(operator_id='operator'),
 round_number integer not null check(round_number>0),
 request_hash text not null,
 request_snapshot jsonb not null,
 meeting_revision bigint not null,
 decision_context text not null,
 state text not null check(state in ('running','generated','error','unknown')),
 attempt_token uuid not null,
 deadline_at timestamptz not null,
 result jsonb,
 result_hash text,
 created_at timestamptz not null default clock_timestamp(),
 finished_at timestamptz,
 unique(meeting_id,round_number)
);
create index if not exists office_meetings_recent_idx on public.office_meetings(workspace_id,operator_id,scope,state,updated_at desc,id desc);
alter table public.office_meetings enable row level security;
alter table public.office_meeting_turns enable row level security;
revoke all on public.office_meetings,public.office_meeting_turns from public,anon,authenticated,service_role;

alter table public.local_skill_requests add column if not exists meeting_id uuid references public.office_meetings(id);
alter table public.local_skill_requests add column if not exists office_turn_id uuid references public.office_meeting_turns(id);
create index if not exists local_skill_requests_meeting_idx on public.local_skill_requests(workspace_id,operator_id,meeting_id,created_at);

create or replace function public.office_meeting_settings_valid_v1(p_owner text,p_reviewers jsonb,p_mode text)
returns boolean language plpgsql immutable set search_path=pg_catalog,public as $$
declare v_ids text[]:=array['eevee','vaporeon','jolteon','flareon','espeon','umbreon','leafeon','glaceon','sylveon'];v_values text[];
begin
 if p_owner is null or not(p_owner=any(v_ids)) or p_mode is null or p_mode not in ('chat','draft','review','council') or jsonb_typeof(p_reviewers) is distinct from 'array' then return false;end if;
 select array_agg(value) into v_values from jsonb_array_elements_text(p_reviewers);
 if jsonb_array_length(p_reviewers)>2 or exists(select 1 from unnest(v_values) x where x=p_owner or not(x=any(v_ids)))
   or (select count(*) from unnest(v_values))<>(select count(distinct x) from unnest(v_values) x) then return false;end if;
 return case when p_mode='council' then jsonb_array_length(p_reviewers)>=1 else jsonb_array_length(p_reviewers)=0 end;
end;$$;
create or replace function public.office_meeting_public_v1(p_row public.office_meetings)
returns jsonb language sql stable set search_path=pg_catalog,public as $$
 select jsonb_build_object('meetingId',p_row.id,'scope',p_row.scope,'title',p_row.title,'sourceTask',p_row.source_task_snapshot,
 'turnCount',(select count(*) from public.office_meeting_turns where meeting_id=p_row.id),'ownerId',p_row.owner_id,'reviewers',p_row.reviewers,'mode',p_row.mode,'decisionContext',p_row.decision_context,'revision',p_row.revision,'state',p_row.state,'createdAt',p_row.created_at,'updatedAt',p_row.updated_at);
$$;
create or replace function public.office_meeting_turn_public_v1(p_row public.office_meeting_turns)
returns jsonb language sql stable set search_path=pg_catalog,public as $$
 select jsonb_build_object('id',p_row.id,'roundNumber',p_row.round_number,'state',case when p_row.state='running' and p_row.deadline_at<=now() then 'unknown' else p_row.state end,
 'request',p_row.request_snapshot,'result',p_row.result,'createdAt',p_row.created_at,'finishedAt',p_row.finished_at);
$$;
create or replace function public.local_skill_request_public_v1(p_row public.local_skill_requests)
returns jsonb language sql stable set search_path=pg_catalog,public as $$
 select jsonb_build_object('status','ready','persisted',true,'request',jsonb_build_object(
 'requestId',p_row.id,'taskId',p_row.task_id,'scope',p_row.scope,'instruction',p_row.instruction,'expectedEvidence',p_row.expected_evidence,
 'state',p_row.state,'createdAt',p_row.created_at,'updatedAt',p_row.updated_at,'receiptAt',p_row.receipt_at,'receiptActorId',p_row.receipt_actor_id,'receipt',p_row.receipt,
 'meetingId',p_row.meeting_id,'officeTurnId',p_row.office_turn_id));
$$;
create or replace function public.office_meeting_get_v1(p_workspace_id uuid,p_operator_id text,p_meeting_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare m public.office_meetings%rowtype;v_turns jsonb;v_skills jsonb;
begin
 if p_workspace_id is null or p_operator_id is distinct from 'operator' or p_meeting_id is null then return jsonb_build_object('status','invalid-input','error','invalid-meeting-id','persisted',false);end if;
 select * into m from public.office_meetings where id=p_meeting_id and workspace_id=p_workspace_id and operator_id=p_operator_id;
 if not found then return jsonb_build_object('status','not-found','error','office-meeting-not-found','persisted',false);end if;
 select coalesce(jsonb_agg(public.office_meeting_turn_public_v1(t) order by t.round_number),'[]') into v_turns from public.office_meeting_turns t where meeting_id=m.id and workspace_id=p_workspace_id and operator_id=p_operator_id;
 select coalesce(jsonb_agg(public.local_skill_request_public_v1(s)->'request' order by s.created_at),'[]') into v_skills from public.local_skill_requests s where meeting_id=m.id and workspace_id=p_workspace_id and operator_id=p_operator_id;
 return jsonb_build_object('status','ready','persisted',true,'meeting',public.office_meeting_public_v1(m),'turns',v_turns,'skillRequests',v_skills);
end;$$;
create or replace function public.office_meeting_create_v1(p_workspace_id uuid,p_operator_id text,p_input jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare m public.office_meetings%rowtype;t public.tasks%rowtype;v_id uuid;v_task uuid;v_scope text;v_hash text;v_snapshot jsonb;
begin
 if p_workspace_id is null or p_operator_id is distinct from 'operator' or jsonb_typeof(p_input) is distinct from 'object'
 or (p_input-array['meetingId','title','scope','sourceTaskId','ownerId','reviewers','mode','decisionContext'])<>'{}'::jsonb or octet_length(p_input::text)>32768 then return jsonb_build_object('status','invalid-input','error','invalid-meeting','persisted',false);end if;
 v_id:=(p_input->>'meetingId')::uuid;v_task:=(p_input->>'sourceTaskId')::uuid;v_scope:=p_input->>'scope';
 if v_id is null or v_scope is null or v_scope not in ('personal','classin') or char_length(btrim(coalesce(p_input->>'title',''))) not between 1 and 200
 or char_length(coalesce(p_input->>'decisionContext',''))>4000 or not public.office_meeting_settings_valid_v1(p_input->>'ownerId',p_input->'reviewers',p_input->>'mode') then return jsonb_build_object('status','invalid-input','error','invalid-meeting','persisted',false);end if;
 v_hash:=encode(sha256(convert_to(p_input::text,'UTF8')),'hex');perform pg_advisory_xact_lock(hashtextextended('office-meeting:'||v_id::text,0));
 select * into m from public.office_meetings where id=v_id;
 if found then
  if m.workspace_id<>p_workspace_id or m.operator_id<>p_operator_id or m.create_hash<>v_hash then return jsonb_build_object('status','conflict','error','meeting-id-reused','persisted',false);end if;
  return public.office_meeting_get_v1(p_workspace_id,p_operator_id,v_id)||jsonb_build_object('replayed',true);
 end if;
 if v_task is not null then
  select * into t from public.tasks where id=v_task and workspace_id=p_workspace_id for share;
  if not found or not public.local_skill_task_valid_v1(p_workspace_id,v_task,v_scope) then return jsonb_build_object('status','invalid-input','error','task-scope-or-owner-mismatch','persisted',false);end if;
  v_snapshot:=jsonb_build_object('id',t.id,'title',t.title,'description',t.description,'nextAction',t.next_action,'status',t.status,'workspace',case v_scope when 'classin' then 'classin' else 'brand' end,'updatedAt',t.updated_at,'importedAt',clock_timestamp());
 end if;
 insert into public.office_meetings(id,workspace_id,operator_id,scope,title,source_task_id,source_task_snapshot,owner_id,reviewers,mode,decision_context,create_hash)
 values(v_id,p_workspace_id,p_operator_id,v_scope,btrim(p_input->>'title'),v_task,v_snapshot,p_input->>'ownerId',p_input->'reviewers',p_input->>'mode',coalesce(p_input->>'decisionContext',''),v_hash);
 return public.office_meeting_get_v1(p_workspace_id,p_operator_id,v_id)||jsonb_build_object('replayed',false);
exception when invalid_text_representation or check_violation or foreign_key_violation then return jsonb_build_object('status','invalid-input','error','invalid-meeting','persisted',false);
end;$$;
create or replace function public.office_meeting_update_v1(p_workspace_id uuid,p_operator_id text,p_meeting_id uuid,p_patch jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare m public.office_meetings%rowtype;v_owner text;v_reviewers jsonb;v_mode text;v_title text;v_decision text;v_state text;
begin
 if p_workspace_id is null or p_operator_id is distinct from 'operator' or jsonb_typeof(p_patch) is distinct from 'object'
 or (p_patch-array['expectedRevision','title','ownerId','reviewers','mode','decisionContext','state'])<>'{}'::jsonb or octet_length(p_patch::text)>32768
 or not(p_patch ? 'expectedRevision') then return jsonb_build_object('status','invalid-input','error','invalid-meeting-update','persisted',false);end if;
 select * into m from public.office_meetings where id=p_meeting_id and workspace_id=p_workspace_id and operator_id=p_operator_id for update;
 if not found then return jsonb_build_object('status','not-found','error','office-meeting-not-found','persisted',false);end if;
 if (p_patch->>'expectedRevision')::bigint is distinct from m.revision then return jsonb_build_object('status','conflict','error','meeting-revision-changed','persisted',false);end if;
 if exists(select 1 from public.office_meeting_turns where meeting_id=m.id and state='running' and deadline_at>clock_timestamp()) then return jsonb_build_object('status','conflict','error','meeting-turn-running','persisted',false);end if;
 v_owner:=case when p_patch ? 'ownerId' then p_patch->>'ownerId' else m.owner_id end;v_reviewers:=coalesce(p_patch->'reviewers',m.reviewers);v_mode:=coalesce(p_patch->>'mode',m.mode);
 v_title:=case when p_patch ? 'title' then btrim(p_patch->>'title') else m.title end;v_decision:=case when p_patch ? 'decisionContext' then p_patch->>'decisionContext' else m.decision_context end;v_state:=coalesce(p_patch->>'state',m.state);
 if not public.office_meeting_settings_valid_v1(v_owner,v_reviewers,v_mode) or char_length(coalesce(v_title,'')) not between 1 and 200 or v_decision is null or char_length(v_decision)>4000 or v_state not in ('open','closed') then return jsonb_build_object('status','invalid-input','error','invalid-meeting-update','persisted',false);end if;
 update public.office_meetings set title=v_title,owner_id=v_owner,reviewers=v_reviewers,mode=v_mode,decision_context=v_decision,state=v_state,revision=revision+1,updated_at=clock_timestamp() where id=m.id;
 return public.office_meeting_get_v1(p_workspace_id,p_operator_id,m.id);
exception when invalid_text_representation or numeric_value_out_of_range or check_violation then return jsonb_build_object('status','invalid-input','error','invalid-meeting-update','persisted',false);
end;$$;
create or replace function public.office_meeting_list_v1(p_workspace_id uuid,p_operator_id text,p_scope text,p_limit integer default 20,p_before jsonb default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_rows jsonb;v_last jsonb;v_more boolean;
begin
 if p_workspace_id is null or p_operator_id is distinct from 'operator' or p_scope is null or p_scope not in ('personal','classin') or p_limit is null or p_limit not between 1 and 50 then return jsonb_build_object('status','invalid-input','error','invalid-meeting-query');end if;
 select coalesce(jsonb_agg(public.office_meeting_public_v1(x) order by x.updated_at desc,x.id desc),'[]') into v_rows from (
 select * from public.office_meetings where workspace_id=p_workspace_id and operator_id=p_operator_id and scope=p_scope
 and (p_before is null or (updated_at,id)<((p_before->>'updatedAt')::timestamptz,(p_before->>'meetingId')::uuid)) order by updated_at desc,id desc limit p_limit+1) x;
 v_more:=jsonb_array_length(v_rows)>p_limit;if v_more then v_rows:=v_rows-p_limit;end if;v_last:=v_rows->(jsonb_array_length(v_rows)-1);
 return jsonb_build_object('status','ready','meetings',v_rows,'nextCursor',case when v_more then jsonb_build_object('meetingId',v_last->'meetingId','updatedAt',v_last->'updatedAt') else null end);
exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then return jsonb_build_object('status','invalid-input','error','invalid-meeting-query');
end;$$;
create or replace function public.office_meeting_turn_claim_v1(p_workspace_id uuid,p_operator_id text,p_meeting_id uuid,p_input jsonb,p_request jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare m public.office_meetings%rowtype;t public.office_meeting_turns%rowtype;v_id uuid;v_hash text;v_round integer;
begin
 if p_workspace_id is null or p_operator_id is distinct from 'operator' or jsonb_typeof(p_input) is distinct from 'object' or jsonb_typeof(p_request) is distinct from 'object'
 or (p_input-array['requestId','expectedRevision','message','mode','includeProjects','deliberation'])<>'{}'::jsonb or octet_length(p_request::text)>150000
 or char_length(coalesce(p_input->>'message','')) not between 1 and 6000 then return jsonb_build_object('status','invalid-input','error','invalid-meeting-turn','persisted',false);end if;
 v_id:=(p_input->>'requestId')::uuid;v_hash:=encode(sha256(convert_to(p_input::text,'UTF8')),'hex');
 if v_id is null then return jsonb_build_object('status','invalid-input','error','invalid-meeting-turn','persisted',false);end if;
 select * into m from public.office_meetings where id=p_meeting_id and workspace_id=p_workspace_id and operator_id=p_operator_id for update;
 if not found then return jsonb_build_object('status','not-found','error','office-meeting-not-found','persisted',false);end if;
 -- Lock a request ID across different meetings as well as serializing each meeting.
 perform pg_advisory_xact_lock(hashtextextended('office-meeting-turn:'||v_id::text,0));
 select * into t from public.office_meeting_turns where id=v_id;
 if found then
  if t.meeting_id<>m.id or t.workspace_id<>p_workspace_id or t.operator_id<>p_operator_id or t.request_hash<>v_hash then return jsonb_build_object('status','conflict','error','meeting-request-id-reused','persisted',false);end if;
  return public.office_meeting_get_v1(p_workspace_id,p_operator_id,m.id)||jsonb_build_object('claimed',false,'turn',public.office_meeting_turn_public_v1(t));
 end if;
 if (p_input->>'expectedRevision')::bigint is distinct from m.revision then return jsonb_build_object('status','conflict','error','meeting-revision-changed','persisted',false);end if;
 if m.state<>'open' then return jsonb_build_object('status','conflict','error','meeting-closed','persisted',false);end if;
 select * into t from public.office_meeting_turns where meeting_id=m.id and state in ('running','unknown') order by round_number limit 1;
 if found then return public.office_meeting_get_v1(p_workspace_id,p_operator_id,m.id)||jsonb_build_object('claimed',false,'turn',public.office_meeting_turn_public_v1(t),'error','meeting-turn-unresolved');end if;
 if p_request->>'scope' is distinct from m.scope or p_request->>'ownerId' is distinct from m.owner_id
 or p_request->>'message' is distinct from p_input->>'message' or p_request->>'mode' is distinct from coalesce(p_input->>'mode',m.mode) then return jsonb_build_object('status','invalid-input','error','meeting-request-mismatch','persisted',false);end if;
 select coalesce(max(round_number),0)+1 into v_round from public.office_meeting_turns where meeting_id=m.id;
 insert into public.office_meeting_turns(id,meeting_id,workspace_id,operator_id,round_number,request_hash,request_snapshot,meeting_revision,decision_context,state,attempt_token,deadline_at)
 values(v_id,m.id,p_workspace_id,p_operator_id,v_round,v_hash,p_request,m.revision,m.decision_context,'running',gen_random_uuid(),clock_timestamp()+interval '65 seconds') returning * into t;
 update public.office_meetings set revision=revision+1,updated_at=clock_timestamp() where id=m.id;
 return public.office_meeting_get_v1(p_workspace_id,p_operator_id,m.id)||jsonb_build_object('claimed',true,'attemptToken',t.attempt_token,'turn',public.office_meeting_turn_public_v1(t));
exception when invalid_text_representation or numeric_value_out_of_range or check_violation then return jsonb_build_object('status','invalid-input','error','invalid-meeting-turn','persisted',false);
end;$$;
create or replace function public.office_meeting_turn_finish_v1(p_workspace_id uuid,p_operator_id text,p_meeting_id uuid,p_request_id uuid,p_attempt_token uuid,p_result jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare t public.office_meeting_turns%rowtype;v_hash text;
begin
 if p_workspace_id is null or p_operator_id is distinct from 'operator' or jsonb_typeof(p_result) is distinct from 'object'
 or p_result->>'status' is null or p_result->>'status' not in ('generated','error','unknown') or octet_length(p_result::text)>180000 then return jsonb_build_object('status','invalid-input','error','invalid-meeting-result','persisted',false);end if;
 select * into t from public.office_meeting_turns where id=p_request_id and meeting_id=p_meeting_id and workspace_id=p_workspace_id and operator_id=p_operator_id for update;
 if not found then return jsonb_build_object('status','not-found','error','office-meeting-turn-not-found','persisted',false);end if;
 if p_attempt_token is distinct from t.attempt_token then return jsonb_build_object('status','conflict','error','meeting-attempt-mismatch','persisted',false);end if;
 v_hash:=encode(sha256(convert_to(p_result::text,'UTF8')),'hex');
 if t.result_hash is not null then
  if t.result_hash<>v_hash then return jsonb_build_object('status','conflict','error','meeting-result-already-saved','persisted',false);end if;
  return public.office_meeting_get_v1(p_workspace_id,p_operator_id,p_meeting_id)||jsonb_build_object('turn',public.office_meeting_turn_public_v1(t),'replayed',true);
 end if;
 update public.office_meeting_turns set state=p_result->>'status',result=p_result,result_hash=v_hash,finished_at=clock_timestamp() where id=t.id returning * into t;
 update public.office_meetings set updated_at=clock_timestamp() where id=p_meeting_id;
 return public.office_meeting_get_v1(p_workspace_id,p_operator_id,p_meeting_id)||jsonb_build_object('turn',public.office_meeting_turn_public_v1(t),'replayed',false);
end;$$;

-- Existing skill request contract remains valid. Associated requests retain exact Office provenance.
create or replace function public.local_skill_request_create_v1(p_workspace_id uuid,p_operator_id text,p_request jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_id uuid;v_task uuid;v_scope text;v_instruction text;v_evidence text;v_hash text;v_row public.local_skill_requests%rowtype;v_meeting uuid;v_turn uuid;
begin
 if p_operator_id is distinct from 'operator' or p_workspace_id is null or jsonb_typeof(p_request) is distinct from 'object'
 or (p_request-array['requestId','taskId','scope','instruction','expectedEvidence','meetingId','officeTurnId'])<>'{}'::jsonb or octet_length(p_request::text)>16384 then return jsonb_build_object('status','invalid-input','error','invalid-skill-request','persisted',false);end if;
 v_id:=(p_request->>'requestId')::uuid;v_task:=(p_request->>'taskId')::uuid;v_meeting:=(p_request->>'meetingId')::uuid;v_turn:=(p_request->>'officeTurnId')::uuid;
 v_scope:=p_request->>'scope';v_instruction:=btrim(p_request->>'instruction');v_evidence:=btrim(p_request->>'expectedEvidence');
 if v_id is null or v_task is null or v_scope is null or v_scope not in ('classin','personal') or char_length(coalesce(v_instruction,'')) not between 1 and 4000
 or char_length(coalesce(v_evidence,'')) not between 1 and 500 or (v_meeting is null)<>(v_turn is null)
 or ((p_request ? 'meetingId' or p_request ? 'officeTurnId') and (v_meeting is null or v_turn is null)) then return jsonb_build_object('status','invalid-input','error','invalid-skill-request','persisted',false);end if;
 v_hash:=encode(sha256(convert_to(p_request::text,'UTF8')),'hex');perform pg_advisory_xact_lock(hashtextextended('local-skill:'||p_workspace_id::text||':'||v_id::text,0));
 select * into v_row from public.local_skill_requests where id=v_id;
 if found then
  if v_row.workspace_id<>p_workspace_id or v_row.operator_id<>p_operator_id or v_row.request_hash<>v_hash then return jsonb_build_object('status','conflict','error','request-id-reused','persisted',false);end if;
  return public.local_skill_request_public_v1(v_row)||jsonb_build_object('replayed',true);
 end if;
 if not public.local_skill_task_valid_v1(p_workspace_id,v_task,v_scope) then return jsonb_build_object('status','invalid-input','error','task-scope-or-owner-mismatch','persisted',false);end if;
 if v_meeting is not null then
  perform 1 from public.office_meetings m join public.office_meeting_turns t on t.meeting_id=m.id where m.id=v_meeting and m.workspace_id=p_workspace_id and m.operator_id=p_operator_id
  and m.scope=v_scope and m.source_task_id=v_task and t.id=v_turn and t.workspace_id=p_workspace_id and t.operator_id=p_operator_id and t.state='generated';
  if not found then return jsonb_build_object('status','invalid-input','error','skill-office-source-mismatch','persisted',false);end if;
 end if;
 insert into public.local_skill_requests(id,workspace_id,operator_id,task_id,scope,instruction,expected_evidence,request_hash,meeting_id,office_turn_id)
 values(v_id,p_workspace_id,p_operator_id,v_task,v_scope,v_instruction,v_evidence,v_hash,v_meeting,v_turn) returning * into v_row;
 return public.local_skill_request_public_v1(v_row)||jsonb_build_object('replayed',false);
exception when invalid_text_representation or check_violation or foreign_key_violation then return jsonb_build_object('status','invalid-input','error','invalid-skill-request','persisted',false);
end;$$;

revoke all on function public.office_meeting_settings_valid_v1(text,jsonb,text),public.office_meeting_public_v1(public.office_meetings),public.office_meeting_turn_public_v1(public.office_meeting_turns),public.local_skill_request_public_v1(public.local_skill_requests) from public,anon,authenticated,service_role;
revoke all on function public.office_meeting_get_v1(uuid,text,uuid),public.office_meeting_create_v1(uuid,text,jsonb),public.office_meeting_update_v1(uuid,text,uuid,jsonb),public.office_meeting_list_v1(uuid,text,text,integer,jsonb),public.office_meeting_turn_claim_v1(uuid,text,uuid,jsonb,jsonb),public.office_meeting_turn_finish_v1(uuid,text,uuid,uuid,uuid,jsonb),public.local_skill_request_create_v1(uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.office_meeting_get_v1(uuid,text,uuid),public.office_meeting_create_v1(uuid,text,jsonb),public.office_meeting_update_v1(uuid,text,uuid,jsonb),public.office_meeting_list_v1(uuid,text,text,integer,jsonb),public.office_meeting_turn_claim_v1(uuid,text,uuid,jsonb,jsonb),public.office_meeting_turn_finish_v1(uuid,text,uuid,uuid,uuid,jsonb),public.local_skill_request_create_v1(uuid,text,jsonb) to service_role;
notify pgrst,'reload schema';
