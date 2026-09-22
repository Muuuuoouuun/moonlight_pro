-- Requires 20260716_0018_record_contact_outcome.sql. Forward-only, idempotent.
-- 공용 기록창(contact-record-form)은 반응을 묻지 않는 채널 — 회신 체크를 안 한 카톡·이메일,
-- 그리고 메모 — 을 반응 없이 보낸다(buildContactRecordPayload의 reaction: ""). 0018은 빈
-- 반응을 invalid-reaction으로 거절해서 "카톡 보냄, 아직 답 없음"처럼 가장 흔한 기록이 전부
-- 저장에 실패했다. 여기서는 그 채널에 한해 빈 반응을 null로 저장한다.
--  · 반응 없는 채널: kakao · email · note · update · quote (발신·메모 — 상대의 반응이 아니다).
--    lib/sales-os/contact-record.js의 REACTIONLESS_KINDS와 같은 목록이다.
--  · 대화 채널(call · meeting · visit · demo · info_session)은 여전히 반응 필수.
--  · 반응이 없으면 대상 레코드의 meta.last_reaction을 덮지 않는다 — 발신 기록이 마지막
--    반응을 지우면 첫 화면 집중 고객 행의 근거가 사라진다.
--  · 반응이 있는 경우의 동작은 0018과 같다. 시그니처가 같아 0032 agent 경로도 그대로 쓴다.
begin;

create or replace function public.record_contact_outcome_v1(
  p_workspace_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_contact_id uuid,
  p_kind text,
  p_summary text,
  p_reaction text,
  p_next_action text,
  p_next_action_at text,
  p_dormant boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_summary text := btrim(coalesce(p_summary, ''));
  v_kind text := lower(btrim(coalesce(p_kind, 'call')));
  v_reaction text := lower(btrim(coalesce(p_reaction, '')));
  v_next_action text := nullif(btrim(coalesce(p_next_action, '')), '');
  v_dormant boolean := coalesce(p_dormant, false);
  v_activity_id uuid;
  v_meta_patch jsonb;
  v_warning text := null;
  v_updated integer := 0;
begin
  if p_workspace_id is null then
    return jsonb_build_object('status', 'invalid-input', 'error', 'missing-workspace');
  end if;
  if p_entity_type not in ('lead', 'deal', 'account') or p_entity_id is null then
    return jsonb_build_object('status', 'invalid-input', 'error', 'invalid-entity');
  end if;
  if v_summary = '' then
    return jsonb_build_object('status', 'invalid-input', 'error', 'missing-summary');
  end if;
  if v_kind not in ('call', 'meeting', 'info_session', 'demo', 'visit', 'email', 'update', 'note', 'kakao', 'quote') then
    v_kind := 'call';
  end if;
  if v_reaction = '' and v_kind in ('kakao', 'email', 'note', 'update', 'quote') then
    v_reaction := null;
  elsif v_reaction not in ('positive', 'neutral', 'concern', 'rejected', 'no_response') then
    return jsonb_build_object('status', 'invalid-input', 'error', 'invalid-reaction');
  end if;
  if not v_dormant and v_next_action is null then
    v_warning := 'no-next-action';
  end if;

  -- 1) 활동 기록
  insert into public.crm_activities (
    workspace_id, entity_type, kind, body, reaction, contact_id,
    lead_id, deal_id, account_id, occurred_at
  ) values (
    p_workspace_id,
    p_entity_type,
    v_kind,
    v_summary,
    v_reaction,
    p_contact_id,
    case when p_entity_type = 'lead' then p_entity_id end,
    case when p_entity_type = 'deal' then p_entity_id end,
    case when p_entity_type = 'account' then p_entity_id end,
    now()
  )
  returning id into v_activity_id;

  -- 2) 대상 레코드 next_action + 휴면 상태 갱신 (buildFollowupWrite와 같은 meta 계약)
  v_meta_patch := case
    when v_dormant then jsonb_build_object(
      'dormant', true,
      'dormant_since', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'next_action_at', null
    )
    else jsonb_build_object(
      'dormant', false,
      'dormant_since', null,
      'next_action_at', p_next_action_at
    )
  end || case
    when v_reaction is null then '{}'::jsonb
    else jsonb_build_object('last_reaction', v_reaction)
  end;

  if p_entity_type = 'lead' then
    update public.leads
      set next_action = v_next_action,
          last_touch_at = now(),
          updated_at = now(),
          meta = coalesce(meta, '{}'::jsonb) || v_meta_patch
      where id = p_entity_id and workspace_id = p_workspace_id;
    get diagnostics v_updated = row_count;
  elsif p_entity_type = 'deal' then
    update public.deals
      set next_action = v_next_action,
          last_activity_at = now(),
          updated_at = now(),
          meta = coalesce(meta, '{}'::jsonb) || v_meta_patch
      where id = p_entity_id and workspace_id = p_workspace_id;
    get diagnostics v_updated = row_count;
  else
    update public.customer_accounts
      set next_action = v_next_action,
          updated_at = now(),
          meta = coalesce(meta, '{}'::jsonb) || v_meta_patch
      where id = p_entity_id and workspace_id = p_workspace_id;
    get diagnostics v_updated = row_count;
  end if;

  if v_updated = 0 then
    -- 대상 레코드 행이 없으면 전체 롤백 — 활동만 남는 반쪽 저장을 만들지 않는다
    raise exception 'entity-not-found';
  end if;

  return jsonb_build_object(
    'status', 'saved',
    'activityId', v_activity_id,
    'entityType', p_entity_type,
    'entityId', p_entity_id,
    'dormant', v_dormant,
    'warning', v_warning
  );
exception
  when others then
    if sqlerrm = 'entity-not-found' then
      return jsonb_build_object('status', 'invalid-input', 'error', 'entity-not-found');
    end if;
    return jsonb_build_object('status', 'error', 'error', sqlerrm);
end;
$$;

revoke all on function public.record_contact_outcome_v1(uuid, text, uuid, uuid, text, text, text, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.record_contact_outcome_v1(uuid, text, uuid, uuid, text, text, text, text, text, boolean)
  to service_role;

commit;
