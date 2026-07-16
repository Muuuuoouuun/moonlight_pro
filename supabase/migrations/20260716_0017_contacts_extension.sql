-- Contact 레이어 확장 (deep-design spec §9: Contact → Account → Opportunity).
-- live contacts 테이블은 id/workspace_id/company_id/name/email/title/created_at만 있다.
-- 고객 DB 통합 뷰와 Customer 360 헤더가 쓰는 전화·메타(라벨, focus_override 등)·updated_at을 추가한다.

alter table if exists public.contacts
  add column if not exists phone text,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists meta jsonb not null default '{}'::jsonb;

create index if not exists idx_contacts_workspace_company
  on public.contacts (workspace_id, company_id);
