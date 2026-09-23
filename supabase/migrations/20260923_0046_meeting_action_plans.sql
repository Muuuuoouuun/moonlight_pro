-- Keep reviewed responsibility, dates and steps beside the source evidence.
-- The task plan is applied inside the existing journal workflow transaction.
begin;

alter table public.meeting_review_proposals
  add column if not exists action_scope text check (action_scope in ('mine','related','unknown')),
  add column if not exists relation_evidence jsonb,
  add column if not exists date_mentions jsonb,
  add column if not exists method_quote text,
  add column if not exists checklist_suggestions jsonb,
  add column if not exists review_execution jsonb;

create or replace function public.meeting_review_execution_valid_v1(p_execution jsonb)
returns boolean language plpgsql immutable set search_path=pg_catalog,public as $$
declare v_item jsonb;v_ids text[]:=array[]::text[];v_date text;
begin
  if p_execution is null then return true; end if;
  if jsonb_typeof(p_execution) is distinct from 'object'
    or coalesce(p_execution->>'actionScope','') not in ('mine','related','unknown')
    or jsonb_typeof(p_execution->'checklist') is distinct from 'array'
    or jsonb_array_length(p_execution->'checklist')>50
    or coalesce(jsonb_typeof(p_execution->'method'),'missing') not in ('string','null')
    or length(coalesce(p_execution->>'method',''))>1000
    or coalesce(jsonb_typeof(p_execution->'dueAt'),'missing') not in ('string','null') then return false; end if;
  v_date:=p_execution->>'dueAt';
  if v_date is not null and (v_date !~ '^\d{4}-\d{2}-\d{2}$' or to_char(v_date::date,'YYYY-MM-DD')<>v_date) then return false; end if;
  for v_item in select value from jsonb_array_elements(p_execution->'checklist') loop
    if jsonb_typeof(v_item) is distinct from 'object'
      or coalesce(v_item->>'id','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or (v_item->>'id')::uuid::text <> v_item->>'id'
      or coalesce(length(btrim(v_item->>'title')),0)<1 or length(v_item->>'title')>200
      or jsonb_typeof(v_item->'done') is distinct from 'boolean' or v_item->>'done'<>'false'
      or jsonb_typeof(v_item->'note') is distinct from 'string' or length(v_item->>'note')>500
      or (v_item ? 'dueAt' and (jsonb_typeof(v_item->'dueAt') is distinct from 'string'
        or coalesce(v_item->>'dueAt','') !~ '^\d{4}-\d{2}-\d{2}$'
        or to_char((v_item->>'dueAt')::date,'YYYY-MM-DD')<>v_item->>'dueAt'))
      or v_item->>'id'=any(v_ids) then return false; end if;
    v_ids:=array_append(v_ids,v_item->>'id');
  end loop;
  return true;
exception when invalid_text_representation or datetime_field_overflow or invalid_datetime_format then return false;
end; $$;

-- v1 still validates the source span and persists the run. This wrapper adds
-- action suggestions before returning a projection, in the same transaction.
create or replace function public.meeting_review_finish_v2(p_workspace_id uuid,p_journal_id uuid,p_request_id uuid,p_result jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_result jsonb;v_item jsonb;v_ordinal integer:=0;
begin
  v_result:=public.meeting_review_finish_v1(p_workspace_id,p_journal_id,p_request_id,p_result);
  if v_result->>'status'='saved' and p_result->>'state'='ready' then
    for v_item in select value from jsonb_array_elements(p_result->'proposals') loop
      if v_item->>'kind'='action' then
        update public.meeting_review_proposals set
          action_scope=coalesce(v_item->>'actionScope','unknown'),
          relation_evidence=v_item->'relation',date_mentions=coalesce(v_item->'dateMentions','[]'::jsonb),
          method_quote=v_item->>'methodQuote',checklist_suggestions=coalesce(v_item->'checklist','[]'::jsonb)
          where workspace_id=p_workspace_id and journal_id=p_journal_id and request_id=p_request_id and ordinal=v_ordinal;
      end if;
      v_ordinal:=v_ordinal+1;
    end loop;
  end if;
  if v_result->>'status' in ('saved','existing') then
    return (v_result-'snapshot')||jsonb_build_object('snapshot',public.meeting_review_snapshot_v2(p_workspace_id,p_journal_id,p_request_id));
  end if;
  return v_result;
end; $$;

-- Upgrade the narrow v1 projection without disclosing source_body or receipts.
-- A task is certified only when its persisted plan matches the reviewed plan.
create or replace function public.meeting_review_snapshot_v2(p_workspace_id uuid,p_journal_id uuid,p_request_id uuid default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_snapshot jsonb;v_item jsonb;v_row public.meeting_review_proposals%rowtype;v_receipt public.journal_workflow_receipts%rowtype;
  v_application jsonb;v_proposals jsonb:='[]'::jsonb;v_due_text text;
begin
  v_snapshot:=public.meeting_review_snapshot_v1(p_workspace_id,p_journal_id,p_request_id);
  if v_snapshot->>'status'<>'live' then return v_snapshot; end if;
  for v_item in select value from jsonb_array_elements(v_snapshot->'proposals') loop
    select * into v_row from public.meeting_review_proposals where workspace_id=p_workspace_id and journal_id=p_journal_id and id=(v_item->>'id')::uuid;
    v_application:=v_item->'application';
    if v_row.review_execution is not null then
      select * into v_receipt from public.journal_workflow_receipts
        where workspace_id=p_workspace_id and journal_id=p_journal_id and request_id=v_row.id;
      if v_row.review_execution->>'actionScope'<>'mine' then
        v_application:=jsonb_build_object('status',case when v_receipt.request_id is null then 'none' else 'unknown' end);
      elsif v_application->>'status'='saved' then
        v_due_text:=case when v_row.review_execution->>'dueAt' is null then null
          else (v_row.review_execution->>'dueAt')||'T00:00:00+09:00' end;
        if v_receipt.request_payload->'target'->>'dueAt' is distinct from v_due_text
          or v_receipt.request_payload->'target'->>'nextAction' is distinct from v_row.review_execution->>'method'
          or v_receipt.request_payload->'target'->'checklist' is distinct from v_row.review_execution->'checklist' then
          v_application:=jsonb_build_object('status','unknown');
        end if;
      end if;
    end if;
    v_proposals:=v_proposals||jsonb_build_array(v_item||jsonb_build_object(
      'actionScope',v_row.action_scope,'relation',v_row.relation_evidence,
      'dateMentions',coalesce(v_row.date_mentions,'[]'::jsonb),'methodQuote',v_row.method_quote,
      'checklist',coalesce(v_row.checklist_suggestions,'[]'::jsonb),
      'review',(v_item->'review')||jsonb_build_object('execution',v_row.review_execution),
      'application',v_application));
  end loop;
  return v_snapshot||jsonb_build_object('proposals',v_proposals);
end; $$;

-- The versioned claim is the model-cost gate. A partially migrated database
-- cannot reserve a run and call Gemini before v2 finish/review is available.
create or replace function public.meeting_review_claim_v2(p_workspace_id uuid,p_journal_id uuid,p_revision bigint,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_result jsonb;
begin
  v_result:=public.meeting_review_claim_v1(p_workspace_id,p_journal_id,p_revision,p_request_id);
  if v_result->>'status'='existing' then
    return (v_result-'snapshot')||jsonb_build_object('snapshot',public.meeting_review_snapshot_v2(p_workspace_id,p_journal_id,p_request_id));
  end if;
  return v_result;
end; $$;

create or replace function public.meeting_review_decide_v2(p_workspace_id uuid,p_journal_id uuid,p_proposal_id uuid,
  p_decision text,p_edited_text text default null,p_execution jsonb default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_result jsonb;v_row public.meeting_review_proposals%rowtype;v_changed boolean;
begin
  if not public.meeting_review_execution_valid_v1(p_execution) or (p_decision<>'accepted' and p_execution is not null) then
    return jsonb_build_object('status','invalid-input','error','invalid-execution'); end if;
  select * into v_row from public.meeting_review_proposals
    where workspace_id=p_workspace_id and journal_id=p_journal_id and id=p_proposal_id for update;
  if found and v_row.kind<>'action' and p_execution is not null then
    return jsonb_build_object('status','invalid-input','error','invalid-execution'); end if;
  if found and p_decision='accepted' and p_execution->>'actionScope'='mine'
    and coalesce(v_row.review_execution->>'actionScope',v_row.action_scope)='related'
    and coalesce(p_edited_text,v_row.proposal_text)=coalesce(v_row.review_text,v_row.proposal_text) then
    return jsonb_build_object('status','invalid-input','error','watch-needs-owned-action'); end if;
  v_changed:=v_row.review_execution is distinct from p_execution;
  v_result:=public.meeting_review_decide_v1(p_workspace_id,p_journal_id,p_proposal_id,p_decision,p_edited_text);
  if v_result->>'status' not in ('saved','duplicate') then return v_result; end if;
  perform pg_advisory_xact_lock(hashtextextended('journal-request:'||p_workspace_id::text||':'||p_proposal_id::text,0));
  if v_changed and exists(select 1 from public.journal_workflow_receipts
    where workspace_id=p_workspace_id and journal_id=p_journal_id and request_id=p_proposal_id) then
    return jsonb_build_object('status','conflict','error','already-applied'); end if;
  if v_changed then
    update public.meeting_review_proposals set review_execution=p_execution,reviewed_at=clock_timestamp() where id=p_proposal_id;
  end if;
  return jsonb_build_object('status',case when v_changed then 'saved' else v_result->>'status' end,
    'snapshot',public.meeting_review_snapshot_v2(p_workspace_id,p_journal_id,v_row.request_id));
end; $$;

-- A reviewed related action is a watch item, not a task. Only the current
-- revision participates. The latest reviewed decision for the same evidence
-- supersedes older runs, including a rejection or a change to "mine".
create index if not exists meeting_review_proposals_reviewed_idx
  on public.meeting_review_proposals(workspace_id,reviewed_at desc,id)
  where reviewed_at is not null;

create or replace function public.meeting_review_watchlist_v1(p_workspace_id uuid,p_limit integer default 20)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_limit integer:=least(greatest(coalesce(p_limit,20),1),50);
  v_items jsonb:='[]'::jsonb;v_has_more boolean:=false;v_count integer:=0;v_item record;
begin
  if p_workspace_id is null then return jsonb_build_object('status','invalid-input','error','invalid-workspace'); end if;
  if not exists(select 1 from public.workspaces where id=p_workspace_id) then
    return jsonb_build_object('status','not-found','error','workspace-unavailable'); end if;
  for v_item in
    with reviewed as (
      select p.*,row_number() over (
        partition by p.journal_id,p.source_start,p.source_end,p.source_quote
        order by p.reviewed_at desc,p.id desc
      ) as evidence_rank
      from public.meeting_review_proposals p
      join public.meeting_review_runs r on r.request_id=p.request_id
        and r.workspace_id=p.workspace_id and r.journal_id=p.journal_id
      join public.journal_entries j on j.id=p.journal_id and j.workspace_id=p.workspace_id
        and j.entry_kind='note' and j.note_revision=r.source_revision
      where p.workspace_id=p_workspace_id and p.kind='action'
        and p.reviewed_at is not null and r.state='ready'
    )
    select id,journal_id,coalesce(review_text,proposal_text) as title,
      review_execution->>'dueAt' as check_at,review_execution->>'method' as method,
      jsonb_array_length(review_execution->'checklist') as step_count,reviewed_at
    from reviewed
    where evidence_rank=1 and review_status='accepted'
      and review_execution->>'actionScope'='related'
    order by (review_execution->>'dueAt') is null,
      review_execution->>'dueAt' asc,reviewed_at desc,id desc
    limit v_limit+1
  loop
    v_count:=v_count+1;
    if v_count>v_limit then v_has_more:=true;exit;end if;
    v_items:=v_items||jsonb_build_array(jsonb_build_object(
      'proposalId',v_item.id,'entryId',v_item.journal_id,'title',v_item.title,
      'checkAt',v_item.check_at,'method',v_item.method,'stepCount',v_item.step_count,
      'href','/dashboard/work/memos?note='||v_item.journal_id::text,'reviewedAt',v_item.reviewed_at));
  end loop;
  return jsonb_build_object('status','live','items',v_items,'hasMore',v_has_more);
end; $$;

-- journal_workflow_v1 inserts task, source link and receipt in one transaction.
-- This trigger attaches the reviewed plan before that transaction can commit.
create or replace function public.journal_task_plan_receipt_v1()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_target jsonb:=new.request_payload->'target';v_next text;v_checklist jsonb;v_item jsonb;v_ids text[]:=array[]::text[];
begin
  if new.request_payload->>'action'<>'create_task' or not (v_target ? 'nextAction' or v_target ? 'checklist') then return new; end if;
  if jsonb_typeof(v_target->'nextAction') not in ('string','null')
    or length(coalesce(v_target->>'nextAction',''))>1000
    or jsonb_typeof(v_target->'checklist') is distinct from 'array'
    or jsonb_array_length(v_target->'checklist')>50 then raise exception 'invalid-task-plan' using errcode='22023'; end if;
  v_next:=nullif(btrim(v_target->>'nextAction'),'');v_checklist:=v_target->'checklist';
  for v_item in select value from jsonb_array_elements(v_checklist) loop
    if jsonb_typeof(v_item) is distinct from 'object'
      or coalesce(v_item->>'id','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or (v_item->>'id')::uuid::text<>v_item->>'id'
      or coalesce(length(btrim(v_item->>'title')),0)<1 or length(v_item->>'title')>200
      or jsonb_typeof(v_item->'done') is distinct from 'boolean'
      or jsonb_typeof(v_item->'note') is distinct from 'string' or length(v_item->>'note')>500
      or (v_item ? 'dueAt' and (jsonb_typeof(v_item->'dueAt') is distinct from 'string'
        or coalesce(v_item->>'dueAt','') !~ '^\d{4}-\d{2}-\d{2}$'
        or to_char((v_item->>'dueAt')::date,'YYYY-MM-DD')<>v_item->>'dueAt'))
      or v_item->>'id'=any(v_ids) then raise exception 'invalid-task-checklist' using errcode='22023'; end if;
    v_ids:=array_append(v_ids,v_item->>'id');
  end loop;
  update public.tasks set next_action=v_next,meta=meta||jsonb_build_object('checklist',v_checklist)
    where workspace_id=new.workspace_id and id=(new.response->'target'->>'id')::uuid;
  if not found then raise exception 'task-plan-target-unavailable' using errcode='22023'; end if;
  return new;
end; $$;

drop trigger if exists journal_task_plan_receipt on public.journal_workflow_receipts;
create trigger journal_task_plan_receipt before insert on public.journal_workflow_receipts
  for each row execute function public.journal_task_plan_receipt_v1();

revoke all on function public.meeting_review_execution_valid_v1(jsonb),public.meeting_review_finish_v2(uuid,uuid,uuid,jsonb),
  public.meeting_review_snapshot_v2(uuid,uuid,uuid),public.meeting_review_claim_v2(uuid,uuid,bigint,uuid),
  public.meeting_review_decide_v2(uuid,uuid,uuid,text,text,jsonb),public.meeting_review_watchlist_v1(uuid,integer)
  from public,anon,authenticated;
grant execute on function public.meeting_review_finish_v2(uuid,uuid,uuid,jsonb),public.meeting_review_snapshot_v2(uuid,uuid,uuid),
  public.meeting_review_claim_v2(uuid,uuid,bigint,uuid),
  public.meeting_review_decide_v2(uuid,uuid,uuid,text,text,jsonb),public.meeting_review_watchlist_v1(uuid,integer) to service_role;
commit;
