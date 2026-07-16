-- Phase 1C: 컨택 완료 시트 원자 RPC (deep-design spec §10).
-- 통화·미팅 완료 시 "1줄 요약 + 고객 반응 + 다음 액션(날짜) 또는 명시적 기약 없음"을
-- 활동 기록과 대상 원장(lead/deal/account) next_action 갱신까지 한 트랜잭션으로 남긴다.
--
-- 규칙:
--  · summary(1줄 요약)와 reaction은 필수 — 비면 invalid-input.
--  · dormant(기약 없음)는 삭제가 아니라 저우선 휴면: next_action_at을 비우고 dormant_since를 찍는다.
--  · dormant도 아니고 next_action도 없으면 저장은 허용하되 warning으로 알린다
--    (열린 딜 경고는 UI가 저장 전에 이미 표시 — spec §10).

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
  if v_reaction not in ('positive', 'neutral', 'concern', 'rejected', 'no_response') then
    return jsonb_build_object('status', 'invalid-input', 'error', 'invalid-reaction');
  end if;
  if v_kind not in ('call', 'meeting', 'info_session', 'demo', 'visit', 'email', 'update', 'note', 'kakao', 'quote') then
    v_kind := 'call';
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

  -- 2) 대상 원장 next_action + 휴면 상태 갱신 (buildFollowupWrite와 같은 meta 계약)
  v_meta_patch := case
    when v_dormant then jsonb_build_object(
      'dormant', true,
      'dormant_since', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'next_action_at', null,
      'last_reaction', v_reaction
    )
    else jsonb_build_object(
      'dormant', false,
      'dormant_since', null,
      'next_action_at', p_next_action_at,
      'last_reaction', v_reaction
    )
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
    -- 대상 원장 행이 없으면 전체 롤백 — 활동만 남는 반쪽 저장을 만들지 않는다
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
