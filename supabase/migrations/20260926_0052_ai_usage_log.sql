-- AI 사용량 기록 (docs/superpowers/specs/2026-09-26-open-ai-tools-borrowed-concepts-plan.md §4 11-1).
-- 2026-09-26 운영자 승인("아직 9월이니 진행"): Moonlight가 부른 Gemini 호출의 토큰 수를 남겨
-- 설정 화면에서 이번 달·지난달 사용량과 추정 비용을 본다(docs/operator-workflow-profile.md
-- "월별 AI 분석 비용과 사용량을 화면에서 확인할 수 있어야 한다").
-- 숫자·호출 출처 키·모델명만 저장한다. 프롬프트·응답·고객 정보는 이 테이블에 들어오지 않는다.
-- 운영자 Mac의 로컬 스킬이 쓰는 다른 계정 API 호출은 이 기록 밖이다.
-- 기록은 Engine·Hub 서버가 service_role로 insert만 하고, Hub read 라우트가 select만 한다.
-- moonlight_ops.apply_migration executes this source and records its hash atomically.

create table if not exists public.ai_usage_log (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  occurred_at timestamptz not null default now(),
  -- 호출 출처 키(예: persona-chat, office-chat, hub-meeting-review). 자유 서술이 아니라 짧은 코드다.
  surface text not null check (surface ~ '^[a-z0-9][a-z0-9-]{0,47}$'),
  -- 요청한 모델 별칭(예: gemini-3.5-flash). 단가 표는 이 값으로 찾는다.
  model text not null check (model ~ '^[a-zA-Z0-9._:/@-]{1,120}$'),
  prompt_tokens integer not null default 0 check (prompt_tokens >= 0),
  -- 답변 토큰(candidatesTokenCount). 생각 토큰은 따로 둔다 — 둘 다 출력 단가로 과금된다.
  output_tokens integer not null default 0 check (output_tokens >= 0),
  thinking_tokens integer not null default 0 check (thinking_tokens >= 0),
  total_tokens integer not null default 0 check (total_tokens >= 0)
);
-- 월 합계 읽기: 워크스페이스 + 기간 범위.
create index if not exists ai_usage_log_workspace_occurred_idx
  on public.ai_usage_log (workspace_id, occurred_at);
alter table public.ai_usage_log enable row level security;
revoke all on public.ai_usage_log from public, anon, authenticated, service_role;
grant select, insert on public.ai_usage_log to service_role;
