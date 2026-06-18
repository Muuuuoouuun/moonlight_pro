-- Sales OS AI 팀 운영 레이어 (v1.3) — agents 시드 + Inbox 캡처 소스.
--
-- 설계: docs/sales-os/team-operating-layer.md · capture-spine.md
-- 새 테이블 없음. 기존 스키마에 최소 추가:
--   (1) lead_intake_raw.source 에 'inbox' 추가 (현장 한 줄 캡처 → 리드 라우팅).
--       0009 의 'business_card' 를 유지하며 widen.
--   (2) agents.agent_type 에 'order'/'production'/'review' 추가 ('sales'/'content' 는 이미 있음).
--   (3) 5 페르소나(오더·세일즈·콘텐츠·제작·검수)를 agents 에 시드 → registry.json 이 DB 로.
-- 멱등: 제약은 동적 이름 조회 후 재생성(0009 패턴), 시드는 not-exists 가드.
-- 안전: additive only. 기존 행/값 보존.

-- (1) lead_intake_raw.source widen ('business_card' 보존 + 'inbox')
do $$
declare c text;
begin
  select conname into c from pg_constraint
   where conrelid = 'public.lead_intake_raw'::regclass
     and pg_get_constraintdef(oid) like '%source%';
  if c is not null then
    execute format('alter table public.lead_intake_raw drop constraint %I', c);
  end if;
end $$;

alter table public.lead_intake_raw
  add constraint lead_intake_raw_source_check
  check (source in ('google_sheets', 'csv', 'manual', 'naver', 'business_card', 'inbox'));

-- (2) agents.agent_type widen ('sales'/'content' 보존 + 'order'/'production'/'review')
do $$
declare c text;
begin
  select conname into c from pg_constraint
   where conrelid = 'public.agents'::regclass
     and pg_get_constraintdef(oid) like '%agent_type%';
  if c is not null then
    execute format('alter table public.agents drop constraint %I', c);
  end if;
end $$;

alter table public.agents
  add constraint agents_agent_type_check
  check (agent_type in ('system', 'strategist', 'content', 'sales', 'ops', 'order', 'production', 'review'));

-- (3) 5 페르소나 시드 (기본 워크스페이스, persona_id 로 멱등)
do $$
declare ws uuid;
begin
  select id into ws from public.workspaces order by created_at asc limit 1;
  if ws is null then
    raise notice 'no workspace found — persona seed skipped';
    return;
  end if;

  insert into public.agents (workspace_id, name, agent_type, status, config)
  select ws, v.name, v.atype, 'idle', v.config::jsonb
  from (values
    ('오더',  'order',
      '{"persona_id":"order","file":"docs/sales-os/personas/00-order-dispatch.md","emits":"work_order[]","activation":"always-first","role":"신호 읽고 작업지시서 + 360 조립 + 건별 활성 페르소나 선택"}'),
    ('세일즈','sales',
      '{"persona_id":"sales","file":"docs/sales-os/personas/01-sales-followup.md","emits":"{next_action,objection,followups[]}","gate":"outbound->codex","role":"딜 다음수·반론·팔로업"}'),
    ('콘텐츠','content',
      '{"persona_id":"content","file":"docs/sales-os/personas/02-content.md","emits":"{ideas[],cadence_note,today_pick}","role":"아이디어 큐·발행 케이던스·앵글"}'),
    ('제작',  'production',
      '{"persona_id":"production","file":"docs/sales-os/personas/03-production.md","emits":"{channel,format,skeleton}","gate":"outbound->codex","role":"승인 앵글 → 채널 포맷 골격"}'),
    ('검수',  'review',
      '{"persona_id":"review","file":"docs/sales-os/personas/04-review-gate.md","emits":"{internal_review,gate,disposition}","gate":"orchestrates","role":"브랜드·사실 셀프리뷰 → Codex 게이트"}')
  ) as v(name, atype, config)
  where not exists (
    select 1 from public.agents a
     where a.workspace_id = ws
       and a.config->>'persona_id' = v.atype
  );
end $$;
