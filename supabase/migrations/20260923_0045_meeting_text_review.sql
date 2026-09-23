-- Manual, text-only meeting analysis. Source notes and canonical task writes remain
-- in journal_entries / journal_workflow_v1; these rows hold review proposals only.
begin;

create table if not exists public.meeting_review_runs (
  request_id uuid primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  journal_id uuid not null,
  source_revision bigint not null check (source_revision between 1 and 9007199254740991),
  source_body text not null check (length(source_body) between 1 and 20000),
  state text not null check (state in ('generating','ready','error')),
  deadline_at timestamptz not null,
  summary text,
  model text,
  usage jsonb,
  error_code text,
  created_at timestamptz not null default clock_timestamp(),
  finished_at timestamptz,
  foreign key (workspace_id,journal_id) references public.journal_entries(workspace_id,id) on delete cascade,
  unique(workspace_id,journal_id,request_id)
);
create index if not exists meeting_review_runs_note_idx on public.meeting_review_runs(workspace_id,journal_id,created_at desc,request_id desc);

create table if not exists public.meeting_review_proposals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  journal_id uuid not null,
  request_id uuid not null,
  ordinal integer not null check (ordinal between 0 and 30),
  kind text not null check (kind in ('summary','decision','open_issue','value','concern','signal','action')),
  proposal_text text not null check (length(btrim(proposal_text)) between 1 and 4000),
  source_start integer check (source_start >= 0),
  source_end integer check (source_end > source_start),
  source_quote text check (source_quote is null or length(source_quote) between 1 and 20000),
  certainty text not null check (certainty in ('stated','derived','unknown')),
  suggested_due date,
  review_status text not null default 'pending' check (review_status in ('pending','accepted','rejected')),
  review_text text check (review_text is null or length(btrim(review_text)) between 1 and 4000),
  reviewed_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  check ((kind='summary' and source_start is null and source_end is null and source_quote is null)
    or (kind<>'summary' and source_start is not null and source_end is not null and source_quote is not null)),
  foreign key (workspace_id,journal_id,request_id) references public.meeting_review_runs(workspace_id,journal_id,request_id) on delete cascade,
  unique(request_id,ordinal)
);
create index if not exists meeting_review_proposals_run_idx on public.meeting_review_proposals(workspace_id,journal_id,request_id,ordinal);

alter table public.meeting_review_runs enable row level security;
alter table public.meeting_review_proposals enable row level security;
revoke all on public.meeting_review_runs,public.meeting_review_proposals from public,anon,authenticated,service_role;

-- This projection intentionally omits source_body, request payloads and the
-- unfiltered journal receipt. A task counts as applied only if both the task
-- and its source link still exist and the receipt matches the evidence.
create or replace function public.meeting_review_snapshot_v1(p_workspace_id uuid,p_journal_id uuid,p_request_id uuid default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_note public.journal_entries%rowtype;v_run public.meeting_review_runs%rowtype;v_proposals jsonb;
begin
  select * into v_note from public.journal_entries where workspace_id=p_workspace_id and id=p_journal_id and entry_kind='note';
  if not found then return jsonb_build_object('status','not-found','error','note-unavailable'); end if;
  if p_request_id is null then
    select * into v_run from public.meeting_review_runs where workspace_id=p_workspace_id and journal_id=p_journal_id
      order by created_at desc,request_id desc limit 1;
  else
    select * into v_run from public.meeting_review_runs where workspace_id=p_workspace_id and journal_id=p_journal_id and request_id=p_request_id;
  end if;
  if not found then
    return jsonb_build_object('status','live','entryId',p_journal_id,'revision',v_note.note_revision,'run',null,'proposals','[]'::jsonb,
      'usage',jsonb_build_object('status','unknown'));
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',p.id,'kind',p.kind,'text',p.proposal_text,'source',case when p.kind='summary' then null
      else jsonb_build_object('start',p.source_start,'end',p.source_end,'quote',p.source_quote) end,
    'certainty',p.certainty,'suggestedDue',p.suggested_due,
    'review',jsonb_build_object('status',p.review_status,'text',coalesce(p.review_text,p.proposal_text),'edited',p.review_text is not null,'reviewedAt',p.reviewed_at),
    'application',case when wr.request_id is not null and p.review_status='accepted' and wr.request_payload->>'action'='create_task'
      and wr.request_payload->>'entryId'=p_journal_id::text and wr.request_payload->>'expectedRevision'=v_run.source_revision::text
      and wr.request_payload->'target'->>'title'=coalesce(p.review_text,p.proposal_text)
      and wr.request_payload->'selection'->>'text'=p.source_quote and wr.response->>'status'='saved'
      and wr.response->'target'->>'type'='task' and t.id is not null and l.id is not null
      then jsonb_build_object('status','saved','targetId',t.id,'href',wr.response->'target'->>'href')
      when wr.request_id is not null then jsonb_build_object('status','unknown')
      else jsonb_build_object('status','none') end
    ) order by p.ordinal),'[]'::jsonb) into v_proposals
    from public.meeting_review_proposals p
    left join public.journal_workflow_receipts wr on wr.workspace_id=p.workspace_id and wr.journal_id=p.journal_id and wr.request_id=p.id
    left join public.tasks t on t.workspace_id=p.workspace_id and t.id=(wr.response->'target'->>'id')::uuid
    left join public.journal_links l on l.workspace_id=p.workspace_id and l.journal_id=p.journal_id
      and l.id=(wr.response->'link'->>'id')::uuid and l.target_type='task' and l.target_id=t.id
      and l.source_revision=v_run.source_revision and l.excerpt=p.source_quote
    where p.workspace_id=p_workspace_id and p.journal_id=p_journal_id and p.request_id=v_run.request_id;
  return jsonb_build_object('status','live','entryId',p_journal_id,'revision',v_note.note_revision,
    'run',jsonb_build_object('requestId',v_run.request_id,'state',case when v_run.state='generating' and v_run.deadline_at<=clock_timestamp()
      then 'unknown' else v_run.state end,'sourceRevision',v_run.source_revision,'stale',v_run.source_revision<>v_note.note_revision,
      'summary',v_run.summary,'model',v_run.model,'error',v_run.error_code,'createdAt',v_run.created_at,'finishedAt',v_run.finished_at),
    'proposals',v_proposals,'usage',case when v_run.usage is null then jsonb_build_object('status','unknown')
      else v_run.usage||jsonb_build_object('status','known') end);
end; $$;

create or replace function public.meeting_review_claim_v1(p_workspace_id uuid,p_journal_id uuid,p_revision bigint,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_note public.journal_entries%rowtype;v_run public.meeting_review_runs%rowtype;
begin
  if p_workspace_id is null or p_journal_id is null or p_request_id is null or p_revision is null or p_revision<1 then
    return jsonb_build_object('status','invalid-input','error','invalid-request'); end if;
  perform pg_advisory_xact_lock(hashtextextended('meeting-review-request:'||p_request_id::text,0));
  select * into v_run from public.meeting_review_runs where request_id=p_request_id;
  if found then
    if v_run.workspace_id<>p_workspace_id or v_run.journal_id<>p_journal_id or v_run.source_revision<>p_revision then
      return jsonb_build_object('status','conflict','error','request-id-reused'); end if;
    return jsonb_build_object('status','existing','snapshot',public.meeting_review_snapshot_v1(p_workspace_id,p_journal_id,p_request_id));
  end if;
  select * into v_note from public.journal_entries where workspace_id=p_workspace_id and id=p_journal_id and entry_kind='note' for share;
  if not found then return jsonb_build_object('status','not-found','error','note-unavailable'); end if;
  if v_note.note_revision<>p_revision then return jsonb_build_object('status','conflict','error','stale-revision','revision',v_note.note_revision); end if;
  if length(v_note.body) not between 1 and 20000 then return jsonb_build_object('status','invalid-input','error','source-length'); end if;
  insert into public.meeting_review_runs(request_id,workspace_id,journal_id,source_revision,source_body,state,deadline_at)
    values(p_request_id,p_workspace_id,p_journal_id,p_revision,v_note.body,'generating',clock_timestamp()+interval '2 minutes');
  return jsonb_build_object('status','claimed','sourceBody',v_note.body,'sourceRevision',p_revision);
end; $$;

create or replace function public.meeting_review_finish_v1(p_workspace_id uuid,p_journal_id uuid,p_request_id uuid,p_result jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_run public.meeting_review_runs%rowtype;v_item jsonb;v_ordinal integer:=0;v_kind text;v_quote text;v_text text;v_start integer;v_end integer;v_certainty text;v_due date;
begin
  if p_workspace_id is null or p_journal_id is null or p_request_id is null or jsonb_typeof(p_result) is distinct from 'object'
    or octet_length(p_result::text)>131072 or coalesce(p_result->>'state','') not in ('ready','error') then
    return jsonb_build_object('status','invalid-input','error','invalid-result'); end if;
  select * into v_run from public.meeting_review_runs where request_id=p_request_id and workspace_id=p_workspace_id and journal_id=p_journal_id for update;
  if not found then return jsonb_build_object('status','not-found','error','run-unavailable'); end if;
  if v_run.state<>'generating' then return jsonb_build_object('status','existing','snapshot',public.meeting_review_snapshot_v1(p_workspace_id,p_journal_id,p_request_id)); end if;
  if p_result->>'state'='error' then
    update public.meeting_review_runs set state='error',error_code=left(coalesce(p_result->>'error','provider-error'),100),finished_at=clock_timestamp()
      where request_id=p_request_id;
    return jsonb_build_object('status','saved','snapshot',public.meeting_review_snapshot_v1(p_workspace_id,p_journal_id,p_request_id));
  end if;
  if not public.journal_note_text_v1(p_result->'summary',4000,true) or jsonb_typeof(p_result->'proposals') is distinct from 'array'
    or jsonb_array_length(p_result->'proposals')>30 or not public.journal_note_text_v1(p_result->'model',120,true)
    or (p_result->'usage' is not null and jsonb_typeof(p_result->'usage') not in ('object','null')) then
    return jsonb_build_object('status','invalid-input','error','invalid-analysis'); end if;
  for v_item in select value from jsonb_array_elements(p_result->'proposals') loop
    v_kind:=v_item->>'kind';v_quote:=v_item->>'quote';v_text:=v_item->>'text';v_certainty:=coalesce(v_item->>'certainty','unknown');
    if jsonb_typeof(v_item) is distinct from 'object' or coalesce(v_kind,'') not in ('decision','open_issue','value','concern','signal','action')
      or not public.journal_note_text_v1(v_item->'text',4000,true) or not public.journal_note_text_v1(v_item->'quote',20000,true)
      or v_certainty not in ('stated','derived','unknown') or coalesce(v_item->>'start','') !~ '^[0-9]+$'
      or coalesce(v_item->>'end','') !~ '^[0-9]+$' then
      return jsonb_build_object('status','invalid-input','error','invalid-proposal'); end if;
    v_start:=(v_item->>'start')::integer;v_end:=(v_item->>'end')::integer;
    if v_start>=v_end or v_end>length(v_run.source_body)*2 or position(v_quote in v_run.source_body)=0 then
      return jsonb_build_object('status','invalid-input','error','invalid-evidence'); end if;
    v_due:=null;
    if v_item->>'suggestedDue' is not null then v_due:=(v_item->>'suggestedDue')::date; end if;
  end loop;
  for v_item in select value from jsonb_array_elements(p_result->'proposals') loop
    v_kind:=v_item->>'kind';v_quote:=v_item->>'quote';v_text:=v_item->>'text';v_certainty:=coalesce(v_item->>'certainty','unknown');
    v_start:=(v_item->>'start')::integer;v_end:=(v_item->>'end')::integer;
    v_due:=null;
    if v_item->>'suggestedDue' is not null then v_due:=(v_item->>'suggestedDue')::date; end if;
    -- All proposal writes follow full validation. SQL verifies quote presence;
    -- Hub verifies exact UTF-16 offsets before invoking this RPC.
    insert into public.meeting_review_proposals(workspace_id,journal_id,request_id,ordinal,kind,proposal_text,source_start,source_end,source_quote,certainty,suggested_due)
      values(p_workspace_id,p_journal_id,p_request_id,v_ordinal,v_kind,v_text,v_start,v_end,v_quote,v_certainty,v_due);
    v_ordinal:=v_ordinal+1;
  end loop;
  -- A summary has no single verbatim source span. It must never be presented
  -- as a source-quoted decision or measurable fact.
  insert into public.meeting_review_proposals(workspace_id,journal_id,request_id,ordinal,kind,proposal_text,certainty)
    values(p_workspace_id,p_journal_id,p_request_id,v_ordinal,'summary',p_result->>'summary','derived');
  update public.meeting_review_runs set state='ready',summary=p_result->>'summary',model=p_result->>'model',usage=p_result->'usage',finished_at=clock_timestamp()
    where request_id=p_request_id;
  return jsonb_build_object('status','saved','snapshot',public.meeting_review_snapshot_v1(p_workspace_id,p_journal_id,p_request_id));
exception when invalid_text_representation or numeric_value_out_of_range or datetime_field_overflow or invalid_datetime_format then
  return jsonb_build_object('status','invalid-input','error','invalid-proposal');
end; $$;

create or replace function public.meeting_review_decide_v1(p_workspace_id uuid,p_journal_id uuid,p_proposal_id uuid,p_decision text,p_edited_text text default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_proposal public.meeting_review_proposals%rowtype;v_run public.meeting_review_runs%rowtype;v_revision bigint;v_review_text text;
begin
  if p_workspace_id is null or p_journal_id is null or p_proposal_id is null or p_decision not in ('pending','accepted','rejected')
    or (p_edited_text is not null and (length(btrim(p_edited_text))<1 or length(p_edited_text)>4000)) then
    return jsonb_build_object('status','invalid-input','error','invalid-review'); end if;
  select * into v_proposal from public.meeting_review_proposals where workspace_id=p_workspace_id and journal_id=p_journal_id and id=p_proposal_id for update;
  if not found then return jsonb_build_object('status','not-found','error','proposal-unavailable'); end if;
  select * into v_run from public.meeting_review_runs where request_id=v_proposal.request_id and workspace_id=p_workspace_id and journal_id=p_journal_id;
  if v_run.state<>'ready' then return jsonb_build_object('status','conflict','error','run-not-ready'); end if;
  select note_revision into v_revision from public.journal_entries where workspace_id=p_workspace_id and id=p_journal_id and entry_kind='note';
  if p_decision='accepted' and v_revision is distinct from v_run.source_revision then
    return jsonb_build_object('status','conflict','error','stale-revision','revision',v_revision); end if;
  v_review_text:=case when p_edited_text is distinct from v_proposal.proposal_text then p_edited_text else null end;
  if v_proposal.review_status=p_decision and v_proposal.review_text is not distinct from v_review_text then
    return jsonb_build_object('status','duplicate','snapshot',public.meeting_review_snapshot_v1(p_workspace_id,p_journal_id,v_proposal.request_id)); end if;
  -- Serialize a review edit with the existing journal task command that uses
  -- this proposal UUID as its request ID.
  perform pg_advisory_xact_lock(hashtextextended('journal-request:'||p_workspace_id::text||':'||p_proposal_id::text,0));
  if exists(select 1 from public.journal_workflow_receipts where workspace_id=p_workspace_id and journal_id=p_journal_id and request_id=p_proposal_id) then
    return jsonb_build_object('status','conflict','error','already-applied'); end if;
  update public.meeting_review_proposals set review_status=p_decision,review_text=v_review_text,reviewed_at=clock_timestamp()
    where id=p_proposal_id;
  return jsonb_build_object('status','saved','snapshot',public.meeting_review_snapshot_v1(p_workspace_id,p_journal_id,v_proposal.request_id));
end; $$;

revoke all on function public.meeting_review_snapshot_v1(uuid,uuid,uuid),public.meeting_review_claim_v1(uuid,uuid,bigint,uuid),
  public.meeting_review_finish_v1(uuid,uuid,uuid,jsonb),public.meeting_review_decide_v1(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.meeting_review_snapshot_v1(uuid,uuid,uuid),public.meeting_review_claim_v1(uuid,uuid,bigint,uuid),
  public.meeting_review_finish_v1(uuid,uuid,uuid,jsonb),public.meeting_review_decide_v1(uuid,uuid,uuid,text,text) to service_role;
commit;
