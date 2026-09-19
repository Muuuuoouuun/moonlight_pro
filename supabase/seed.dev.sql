-- 로컬 개발 전용 더미 데이터.
--
-- 운영자 확정(2026-09-20): 더미 데이터는 **로컬 전용 Supabase 프로젝트에만** 두고
-- 코드에는 절대 넣지 않는다. `scripts/no-mock-data.test.mjs` 가 코드 쪽을 막고,
-- 이 파일이 그 대신 화면을 채운다. 그래서 "로컬에만 보이고 배포에는 안 보인다"가
-- 런타임 분기가 아니라 구조로 보장된다.
--
-- 적용: psql --dbname "$MOONLIGHT_DEV_DB_URL" -f supabase/seed.dev.sql
-- 멱등하다 — 여러 번 돌려도 같은 상태가 된다.
--
-- 이름은 전부 한눈에 가짜임을 알 수 있게 짓는다(`[개발]` 접두사). 실데이터와
-- 섞이면 안 되는 자리라서, 헷갈릴 여지를 남기지 않는 것이 규칙보다 안전하다.

begin;

-- 앱이 기대하는 기본 워크스페이스 (COM_MOON_DEFAULT_WORKSPACE_ID)
insert into public.workspaces (id, slug, name)
values ('11111111-1111-1111-1111-111111111111', 'dev', '[개발] 로컬 워크스페이스')
on conflict (id) do update set name = excluded.name;

-- 브랜드 2개
insert into public.brands (id, workspace_id, slug, name, status) values
  ('b0000000-0000-4000-8000-000000000001', '11111111-1111-1111-1111-111111111111', 'dev-brand-a', '[개발] 브랜드 A', 'active'),
  ('b0000000-0000-4000-8000-000000000002', '11111111-1111-1111-1111-111111111111', 'dev-brand-b', '[개발] 브랜드 B', 'active')
on conflict (id) do update set name = excluded.name, status = excluded.status;

-- 프로젝트 3개 — 상태·우선순위·진척을 흩어 놓아 보드/타임라인이 비지 않게 한다
insert into public.projects (id, workspace_id, brand_id, name, slug, status, priority, progress, summary, due_at) values
  ('c0000000-0000-4000-8000-000000000001', '11111111-1111-1111-1111-111111111111', 'b0000000-0000-4000-8000-000000000001', '[개발] 진행 중 프로젝트', 'dev-active', 'active', 'high', 40, '보드·타임라인 확인용', now() + interval '10 days'),
  ('c0000000-0000-4000-8000-000000000002', '11111111-1111-1111-1111-111111111111', 'b0000000-0000-4000-8000-000000000002', '[개발] 막힌 프로젝트', 'dev-blocked', 'blocked', 'critical', 15, '차단 상태 표시 확인용', now() + interval '3 days'),
  ('c0000000-0000-4000-8000-000000000003', '11111111-1111-1111-1111-111111111111', null, '[개발] 완료 프로젝트', 'dev-done', 'completed', 'low', 100, '완료 표시 확인용', now() - interval '5 days')
on conflict (id) do update set name = excluded.name, status = excluded.status, progress = excluded.progress;

-- 할 일 6개 — 기한을 오늘/내일/지남/없음으로 흩어 To-dos 구간이 모두 나오게 한다
insert into public.tasks (id, workspace_id, project_id, title, status, priority, due_at) values
  ('d0000000-0000-4000-8000-000000000001', '11111111-1111-1111-1111-111111111111', 'c0000000-0000-4000-8000-000000000001', '[개발] 오늘 기한 할 일', 'todo', 'high', date_trunc('day', now()) + interval '18 hours'),
  ('d0000000-0000-4000-8000-000000000002', '11111111-1111-1111-1111-111111111111', 'c0000000-0000-4000-8000-000000000001', '[개발] 내일 기한 할 일', 'todo', 'medium', date_trunc('day', now()) + interval '1 day 18 hours'),
  ('d0000000-0000-4000-8000-000000000003', '11111111-1111-1111-1111-111111111111', 'c0000000-0000-4000-8000-000000000002', '[개발] 기한 지난 할 일', 'todo', 'critical', now() - interval '2 days'),
  ('d0000000-0000-4000-8000-000000000004', '11111111-1111-1111-1111-111111111111', 'c0000000-0000-4000-8000-000000000001', '[개발] 진행 중 할 일', 'doing', 'medium', null),
  ('d0000000-0000-4000-8000-000000000005', '11111111-1111-1111-1111-111111111111', null, '[개발] 기한 없는 할 일', 'todo', 'low', null),
  ('d0000000-0000-4000-8000-000000000006', '11111111-1111-1111-1111-111111111111', 'c0000000-0000-4000-8000-000000000003', '[개발] 완료된 할 일', 'done', 'low', now() - interval '3 days')
on conflict (id) do update set title = excluded.title, status = excluded.status, due_at = excluded.due_at;

-- 컨택 3명
insert into public.contacts (id, workspace_id, name) values
  ('e0000000-0000-4000-8000-000000000001', '11111111-1111-1111-1111-111111111111', '[개발] 김테스트'),
  ('e0000000-0000-4000-8000-000000000002', '11111111-1111-1111-1111-111111111111', '[개발] 이샘플'),
  ('e0000000-0000-4000-8000-000000000003', '11111111-1111-1111-1111-111111111111', '[개발] 박더미')
on conflict (id) do update set name = excluded.name;

-- 리드 4개 — 상태와 점수를 흩어 놓는다
insert into public.leads (id, workspace_id, contact_id, name, email, phone, source, status, score, channel, next_action, last_touch_at) values
  ('f0000000-0000-4000-8000-000000000001', '11111111-1111-1111-1111-111111111111', 'e0000000-0000-4000-8000-000000000001', '[개발] 신규 리드', 'dev1@example.test', '010-0000-0001', 'inbox', 'new', 82, 'inbound', '첫 연락하기', now() - interval '1 day'),
  ('f0000000-0000-4000-8000-000000000002', '11111111-1111-1111-1111-111111111111', 'e0000000-0000-4000-8000-000000000002', '[개발] 검증된 리드', 'dev2@example.test', '010-0000-0002', 'inbox', 'qualified', 65, 'inbound', '견적 보내기', now() - interval '6 days'),
  ('f0000000-0000-4000-8000-000000000003', '11111111-1111-1111-1111-111111111111', 'e0000000-0000-4000-8000-000000000003', '[개발] 정체된 리드', 'dev3@example.test', '010-0000-0003', 'inbox', 'nurturing', 40, 'outbound', '재연락 필요', now() - interval '21 days'),
  ('f0000000-0000-4000-8000-000000000004', '11111111-1111-1111-1111-111111111111', null, '[개발] 종료된 리드', 'dev4@example.test', null, 'inbox', 'lost', 10, 'inbound', null, now() - interval '40 days')
on conflict (id) do update set name = excluded.name, status = excluded.status, score = excluded.score;

-- 딜 4개 — 퍼널 단계를 고루 채워 칸반이 비지 않게 한다
insert into public.deals (id, workspace_id, lead_id, title, amount, currency, stage, expected_close_at, next_action, last_activity_at) values
  ('a1000000-0000-4000-8000-000000000001', '11111111-1111-1111-1111-111111111111', 'f0000000-0000-4000-8000-000000000001', '[개발] 초기 논의 건', 1200000, 'KRW', 'prospect', now() + interval '20 days', '요구사항 정리', now() - interval '2 days'),
  ('a1000000-0000-4000-8000-000000000002', '11111111-1111-1111-1111-111111111111', 'f0000000-0000-4000-8000-000000000002', '[개발] 제안 발송 건', 3500000, 'KRW', 'proposal', now() + interval '12 days', '제안서 회신 대기', now() - interval '4 days'),
  ('a1000000-0000-4000-8000-000000000003', '11111111-1111-1111-1111-111111111111', 'f0000000-0000-4000-8000-000000000003', '[개발] 정체된 협상 건', 8000000, 'KRW', 'negotiation', now() + interval '5 days', '가격 재협의', now() - interval '18 days'),
  ('a1000000-0000-4000-8000-000000000004', '11111111-1111-1111-1111-111111111111', null, '[개발] 성사된 건', 5000000, 'KRW', 'won', now() - interval '3 days', null, now() - interval '3 days')
on conflict (id) do update set title = excluded.title, stage = excluded.stage, amount = excluded.amount;

commit;

-- 확인
select '워크스페이스 ' || (select count(*) from public.workspaces)::text
    || ' · 브랜드 ' || (select count(*) from public.brands)::text
    || ' · 프로젝트 ' || (select count(*) from public.projects)::text
    || ' · 할 일 ' || (select count(*) from public.tasks)::text
    || ' · 컨택 ' || (select count(*) from public.contacts)::text
    || ' · 리드 ' || (select count(*) from public.leads)::text
    || ' · 딜 ' || (select count(*) from public.deals)::text as seeded;
