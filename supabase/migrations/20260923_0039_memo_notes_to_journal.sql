-- 빠른 메모 저장소 통합 — notes → journal_entries (1회성 데이터 이관, 멱등).
--
-- 배경: 빠른 메모는 `/api/hub/memo-capture` → `notes` 로 갔고, 사이드바 "메모" 페이지는
-- `/api/hub/journal` → `journal_entries` 를 읽었다. 그래서 빠른 메모로 적은 것이 메모
-- 목록에 영원히 뜨지 않았고(실측 2026-09-20: notes 2행 / journal_entries 0행), 발췌→할 일·
-- 콘텐츠 전환·업무 연결·검색 같은 후처리가 전부 journal 쪽에만 있어 후처리가 불가능했다.
-- 코드는 `8ec7b43` 에서 journal 경로로 통합했고, 이 파일은 남아 있던 기록을 옮긴다.
--
-- notes 테이블은 지우지 않는다 — Notion 동기화(`apps/engine/lib/notion-sync.ts`)가 같은
-- 테이블을 target 으로 쓰고, 되돌릴 자리를 남겨 둔다.

begin;

insert into public.journal_entries (
  id, workspace_id, entry_kind, title, body,
  occurred_at, created_at, updated_at,
  source, content_hash, note_meta, note_revision, review_data
)
select
  n.id,
  n.workspace_id,
  'note',
  coalesce(nullif(btrim(n.title), ''), ''),
  n.body,
  n.created_at,                                   -- 타임라인 순서를 원래 작성 시각으로 보존
  n.created_at,
  coalesce(n.updated_at, n.created_at),
  'import',                                       -- source 제약: hub | paste | import
  nullif(n.meta #>> '{memo_capture,contentHash}', ''),
  jsonb_build_object('kind', 'note', 'enhancement', '')
    || case
         when jsonb_typeof(n.meta #> '{memo_capture,labels}') = 'array'
              and jsonb_array_length(n.meta #> '{memo_capture,labels}') > 0
         then jsonb_build_object('tags', n.meta #> '{memo_capture,labels}')
         else '{}'::jsonb
       end,
  1,
  '{}'::jsonb                                     -- entry_kind='note' 제약이 요구
from public.notes n
where n.body is not null
  and btrim(n.body) <> ''                         -- entry_kind='note' 는 빈 본문을 거부한다
on conflict (id) do nothing;

commit;

select 'notes ' || (select count(*) from public.notes)::text
    || ' · journal_entries(note) ' || (select count(*) from public.journal_entries where entry_kind = 'note')::text as result;
