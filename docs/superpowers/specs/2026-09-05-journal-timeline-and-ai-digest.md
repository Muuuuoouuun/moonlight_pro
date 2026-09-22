# 일지 — 단일 타임라인 + AI 정리 설계

> 상태: **제안(DRAFT)**. §3 범위 4건은 2026-09-05 운영자 답변으로 **확정**, §2 실측은 사실, 나머지 §4~§11은 구현 전 제안이다.
> 작성일: 2026-09-05 (Asia/Seoul)
> 상위 정본: `docs/operator-workflow-profile.md`, `docs/superpowers/specs/2026-07-13-moonlight-personal-operator-os-deep-design.md`, `../../DESIGN.md`
> 관계:
> - `docs/daily-operating-note-todo.md`(DEFERRED)의 **P1-5 Evening Review · P1-6 Insight tagging · P2-8 Weekly pattern · P2-10 selective import를 흡수**한다. 그 문서의 미해결 질문 2건("`notes`와 `memos`를 통합할지", "저녁 회고를 rule-based로 시작할지 AI draft로 갈지")에 이 문서가 답한다. P0-2 Quick Capture는 이미 구현됐고(§2), P1-7 Obsidian **export**(역방향)는 이 문서 범위 밖이다.
> - `2026-09-04-mcp-server-audit-and-expansion-design.md`의 **투영 계층 원칙을 신규 표면에 선반영**한다(§9). 그 문서가 사후 교정하려는 "화면용 응답 통과" 실수를 일지는 처음부터 하지 않는다.
> - Council·Guru 페르소나 결합은 `docs/README.md`의 보류 게이트에 걸리므로 범위 밖이다. 이 문서의 AI는 Gemini(Engine)와 Claude Code 두 경로뿐이다.

---

## 1. 요약

운영자의 기록은 지금 **세 곳에 흩어져 있고 어느 곳도 정본이 아니다.** 운영자 프로필의 직접 진술이 그것이다 — "떠오른 아이디어는 현재 메모장 또는 Threads 내부 임시 저장에 남긴다. 여러 곳에 흩어져 있어 효율적이지 않다고 느낀다."

허브 안에도 기록 표면이 없지는 않다. 다만 셋 다 일지가 아니다.

- **Quick Capture**(`daily-brief.jsx`)는 **한 줄**만 받고, 목적지가 `task` 아니면 `work_order`다. 생각을 적어두는 곳이 아니라 **일감으로 바꾸는 깔때기**다.
- **`notes` 테이블**은 live지만 `project_id`에 매달린 프로젝트 부속 노트이고, 소비처는 프로젝트 상세 패널의 "노트" 섹션 한 곳뿐이다.
- **`memos` 테이블**은 스키마만 있고 **코드 소비자가 0건**이다(`agent_id` 스코프 — 에이전트용 잔재).

그래서 제안은 하나다. **날짜가 붙은 자유 서술 기록을 위한 단일 타임라인(`journal_entries`)을 새로 만들고, AI 정리를 두 계층으로 쪼개 비용 제약 안에 넣는다.**

AI를 두 계층으로 쪼개는 이유는 운영자 프로필의 확정 제약 때문이다 — "외부 AI API 비용이 발생하므로 모든 기록을 분석하는 핵심 기능으로 삼지 않는다." 그래서 **단건으로 판단 가능한 일(요약·태그)만 저비용 Gemini에 자동으로 맡기고, 기간 전체를 봐야 하는 일(회고·패턴·아이디어 발굴)은 Claude Code가 세션에서 수행해 API 비용을 0으로 만든다.**

---

## 2. 확인 결과 (2026-09-05 실측, 사실)

| 항목 | 실측 | 함의 |
|---|---|---|
| `notes` 테이블 | live. `id, workspace_id, project_id, title, body, created_at` | 날짜(`occurred_at`)·태그·출처·정리 상태 컬럼이 **전부 없다** |
| `notes` 읽기 경로 | `operating-ledger.js:650` 전역 팬아웃 `OPTIONAL_READ_LIMIT+1 = 81`행 + 프로젝트 선택 시 재조회(`:691`) | 일지를 여기 넣으면 **프로젝트 기록이 오염된다**(§4.1) |
| `memos` 테이블 | 스키마 존재, 코드 소비자 **0건**, `agent_id` 스코프 | 일지 용도로 재사용 불가 |
| Quick Capture | `daily-brief.jsx` → `POST /api/hub/inbox` → Engine. `maxLength 4000`, 단일 `<input>`, 목적지 `task`\|`work_order` | 긴 서술 입력 표면이 아님 |
| AI 프로바이더 | `apps/engine/lib/gemini.ts` `generateGeminiText()`. 라우트 `/api/ai/{brief,sales-mentor,brand-mentor}` | 신규 라우트 추가만 하면 되고 프로바이더 배선은 이미 있다 |
| 승인 큐 | `work_orders`. `kind`에 `next_action`·`idea`·`note` 이미 존재. `source` check는 `('team','inbox','guru','manual')` | `'journal'` 추가만 필요 |
| `work_orders` unique 제약 | `uq_work_orders_open_followup`은 `kind='followup' and deal_id is not null` 한정 | 일지 제안(`next_action`/`idea`)과 **충돌하지 않는다** |
| 사이드바 | `SIDEBAR_PRIMARY` 8 + `SIDEBAR_UTILITIES` 2, `hub-nav.test.mjs:42-43`이 개수 고정 | 앵커 추가는 테스트 동반 수정이 **설계된 비용** |
| MCP 페이로드 | read 1회 최대 159KB (`mcp-payload-explosion` 기록) | 일지 도구는 투영 필수(§9) |

---

## 3. 범위 (2026-09-05 운영자 확정)

| 질문 | 확정 |
|---|---|
| 일지에 무엇을 모으나 | **단일 타임라인** — 하루 기록·아이디어·관찰·회고를 한 스트림에 시간순으로 쌓고 태그로 나눈다 |
| 유입 경로 | **허브에서 직접 작성 · 붙여넣기 덤프 · 마크다운/텍스트 파일 임포트** (텔레그램은 범위 밖) |
| AI 정리 주체 | **하이브리드** — 일상 요약·태그는 Engine+Gemini, 심층 회고·패턴은 Claude Code |
| AI 산출물 | **요약+자동 태그 · 할 일 추출 · 콘텐츠 아이디어 추출 · 주간·월간 회고** 4종 전부 |

---

## 4. 데이터 모델

### 4.1 왜 `notes` 재사용이 아니라 신규 테이블인가 (권장, 근거 있음)

`notes`에 일지를 넣으면 **기존 표면이 실제로 회귀한다.**

`operating-ledger.js`는 `notes`를 `created_at.desc` 순으로 81행 읽어 프로젝트 기록에 싣는다. 일지는 정의상 매일 쌓이고 `project_id`가 없다. 하루 3건만 적어도 **한 달이면 90건** — 상위 81행을 일지가 전부 차지하고 프로젝트 노트는 기록에서 사라진다. 정렬 키가 `created_at`이므로 이건 가능성이 아니라 **결정된 결과**다. 여기에 MCP 페이로드가 이미 최대 159KB인 상황이 겹친다.

`memos`는 소비자 0건에 `agent_id` 스코프라 애초에 후보가 아니다. **이 스펙은 `memos`를 폐기 대상으로 표시할 것을 권장한다**(삭제 마이그레이션은 별도 결정 — §12).

역할 분리는 이렇게 고정한다.

- `notes` — **프로젝트에 매인** 작업 노트. 현행 유지, 변경 없음.
- `journal_entries` — **날짜에 매인** 개인 기록 타임라인. 신규.
- 두 방향 연결은 `journal_entries.project_id`(nullable) 하나로 충분하다. 일지에서 프로젝트를 걸면 프로젝트 상세에서 역참조할 수 있다.

### 4.2 스키마 (제안)

`supabase/migrations/20260905_0024_journal_entries.sql`

```sql
create table if not exists public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,

  -- 기록 '대상' 시각 ≠ created_at(입력 시각).
  -- 2년 전 Obsidian 일지를 오늘 임포트해도 타임라인은 occurred_at 순으로 선다.
  occurred_at timestamptz not null default now(),

  body  text not null,
  title text,                         -- nullable: 한 줄 기록엔 제목이 없다

  source text not null default 'hub'
    check (source in ('hub', 'paste', 'import')),
  source_ref   text,                  -- 임포트 파일명 · 붙여넣기 배치 id
  content_hash text not null,         -- 재임포트 멱등성 (§6.3)

  -- 태그 + 확정도. 2026-08-19 lead label_source 패턴을 그대로 상속한다.
  tags       text[] not null default '{}',
  tag_source text   not null default 'none'
    check (tag_source in ('none', 'ai', 'operator')),

  -- AI 정리 상태 기계 (§7.3)
  ai_summary   text,
  digest_status text not null default 'raw'
    check (digest_status in ('raw', 'queued', 'digested', 'failed', 'skipped')),
  digested_at  timestamptz,
  digest_model text,                  -- 어떤 모델이 썼는지 남긴다 (사후 신뢰 판단용)

  project_id uuid references public.projects(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 같은 내용 재임포트 차단. 임포트를 몇 번 돌려도 안전하다.
create unique index if not exists uq_journal_entries_hash
  on public.journal_entries (workspace_id, content_hash);

create index if not exists idx_journal_entries_timeline
  on public.journal_entries (workspace_id, occurred_at desc);

-- 정리 대기 스캔 전용 부분 인덱스 (digested 행은 색인에서 빠진다)
create index if not exists idx_journal_entries_digest
  on public.journal_entries (workspace_id, digest_status, occurred_at)
  where digest_status in ('raw', 'queued', 'failed');

create index if not exists idx_journal_entries_tags
  on public.journal_entries using gin (tags);
```

`work_orders.source`에 `'journal'` 추가 (같은 마이그레이션):

```sql
alter table public.work_orders drop constraint if exists work_orders_source_check;
alter table public.work_orders add constraint work_orders_source_check
  check (source in ('team', 'inbox', 'guru', 'manual', 'journal'));
```

### 4.3 태그 어휘 (고정 6키)

`daily-operating-note-todo.md` P1-6이 제시한 어휘를 그대로 확정한다.

`project` · `content` · `lead` · `risk` · `idea` · `follow-up`

DB check가 아니라 **앱 레벨 상수**(`apps/hub/lib/journal-tags.js`)로 고정한다 — 배열 원소에 check를 거는 건 Postgres에서 다루기 나쁘고, 어휘 변경이 마이그레이션을 요구하면 안 된다. 대신 read·write 양쪽에서 미등재 키를 드랍한다(2026-08-19 스펙의 "미등재 키 드랍"과 동일 규칙).

**`tag_source='operator'`인 행의 태그는 AI가 절대 덮지 않는다.** 재실행 안전성의 핵심이고, 2026-08-19 `label_source` 규칙의 직접 상속이다.

---

## 5. 유입 경로 (확정 3종)

| 경로 | `source` | 동작 |
|---|---|---|
| 허브 직접 작성 | `hub` | 일지 화면 상단 작성 박스. 여러 줄 textarea, `occurred_at` 기본값 오늘(수정 가능) |
| 붙여넣기 덤프 | `paste` | 메모장·Threads 임시저장·카톡 원문을 통째로 붙여넣으면 여러 건으로 쪼개 저장 |
| 파일 임포트 | `import` | `.md`/`.txt` 다중 업로드. Obsidian daily note(`YYYY-MM-DD.md`) 포함 |

붙여넣기·임포트는 §6에서 상세.

---

## 6. 임포트 · 분할

### 6.1 분할은 규칙 기반이 먼저다 (권장)

운영자 비용 제약 때문에 **AI 분할을 기본값으로 두지 않는다.** 다음 순서로 시도한다.

1. YAML frontmatter (`---` 블록) — Obsidian
2. 날짜 헤딩 (`# 2026-09-05`, `## 9/5`, `[2026-09-05]`)
3. 수평선 (`---`, `***`)
4. 빈 줄 2개 이상
5. 위 어느 것도 안 잡히면 **전체를 1건으로** 저장

규칙으로 안 쪼개지고 운영자가 원할 때만 "AI로 쪼개기" 버튼이 Gemini를 부른다. **기본 경로에 API 비용이 0인 상태를 유지한다.**

### 6.2 `occurred_at` 추론

frontmatter `date:` → 파일명 날짜 → 헤딩 날짜 → 본문 첫 줄 날짜 → 없으면 파일 mtime → 그래도 없으면 `now()`. 추론 결과는 미리보기 표에 **추론 근거와 함께** 보여주고 저장 전에 고칠 수 있어야 한다.

### 6.3 멱등성

`content_hash = sha256(normalize(body) || occurred_at::date)`. 같은 파일을 두 번 임포트하면 unique violation이 나고, 그 건은 "이미 있음"으로 **건너뛴 것으로 집계**한다 — 실패가 아니다. `mutation_receipts` 및 `uq_work_orders_open_followup`과 같은 "insert 자체를 중재자로 삼는" 패턴이다.

### 6.4 미리보기 게이트

**임포트는 미리보기 확인 없이 저장하지 않는다.** N건 표(날짜·첫 줄·글자 수·중복 여부)를 보여주고 운영자가 저장을 누른다. 개별 행 제외 가능.

---

## 7. AI 정리 — 하이브리드 2계층

### 7.1 경계 규칙 (설계의 핵심)

**Tier 1은 엔트리 1건 안에서만 판단한다. Tier 2는 기간 전체를 본다.**

이 한 줄이 비용과 품질을 동시에 푼다. 요약과 태그는 단건 문맥으로 충분하므로 짧은 프롬프트 + 저비용 모델로 자동화할 수 있다. 회고·패턴·아이디어 발굴은 단건으로는 **원리상 불가능**하므로 애초에 자동화 대상이 아니고, 운영자가 원할 때 Claude Code가 한다.

| | Tier 1 | Tier 2 |
|---|---|---|
| 주체 | Engine + Gemini (`generateGeminiText`) | Claude Code (MCP) |
| 문맥 | 엔트리 1건 | 기간 전체(주·월) |
| 산출 | `ai_summary` 1줄 + `tags` | 회고 리포트 · 반복 패턴 · 콘텐츠 아이디어 |
| 트리거 | 화면의 "정리하기" 버튼 (배치) | 운영자가 세션에서 요청 |
| API 비용 | 저비용, 상한 있음 | **0** |
| 결과 반영 | 엔트리에 직접 write | 제안은 `work_orders`, 리포트는 일지 엔트리로 |

### 7.2 Tier 1 — Engine + Gemini

- 신규: `POST /api/hub/journal/digest` (Hub BFF, write-guard) → `POST /api/ai/journal-digest` (Engine, shared secret)
- 입력: `digest_status in ('raw','failed')` 엔트리를 `occurred_at` 오름차순으로 **최대 25건/run**
- 출력(엔트리당): `summary`(한국어 1줄, 80자 이내) + `tags`(고정 6키 중 0~3개)
- 저장: `ai_summary`, `tags`(단 `tag_source='operator'`면 태그 미변경), `tag_source='ai'`, `digest_status='digested'`, `digested_at`, `digest_model`

### 7.3 상태 기계와 비용 가드 (확정 필요, 권장)

```
raw ──"정리하기"──> queued ──성공──> digested
 │                     └──실패──> failed ──재시도(수동)──> queued
 └──운영자 "정리 안 함"──> skipped
```

가드 규칙:

1. **저장 시점에 AI를 부르지 않는다.** 일지를 쓰는 행위 자체는 절대 과금되지 않는다.
2. run당 엔트리 상한(25) — 초과분은 다음 run.
3. 화면에 **"이번 정리: N건 · 모델 X"**를 표시한다. 무엇에 돈을 썼는지 보이지 않는 자동화는 만들지 않는다.
4. `digested`는 재처리하지 않는다 — 재실행이 재과금되지 않는다.
5. 실패는 `failed`로 남기고 **자동 재시도하지 않는다**(수동 재시도만).
6. **야간 크론은 P0·P1 범위 밖이다.** 근거: `followup-autopilot`·`content-flywheel` 크론 2개가 Engine 모드·응답 계약 불일치로 이미 상시 실패 중이다. 같은 배선 위에 세 번째 크론을 올리는 건 회귀다 — 그 원인을 먼저 고친 뒤 별도 결정한다(§12).

### 7.4 Tier 2 — Claude Code

MCP로 `list_journal`(투영) → 필요한 건만 `get_journal_entry`로 본문을 읽고 다음을 만든다.

- **주간·월간 회고** — 완료·정체·전환·반복 패턴. 결과는 `source='hub'`, `tags=['idea']`가 아니라 전용 태그 없이 일지 엔트리 1건으로 저장하고 `title`에 기간을 적는다.
- **콘텐츠 아이디어 추출** — `work_orders`에 `kind='idea'`, `source='journal'`로 제안 적재.
- **할 일 추출** — `work_orders`에 `kind='next_action'`, `source='journal'`.

프롬프트는 세션마다 즉흥으로 쓰지 말고 `docs/superpowers/prompts/journal-retro.md`에 정본을 두고 재사용한다 — 회고의 형식이 매번 달라지면 기간 비교가 불가능해진다.

---

## 8. 승인 게이트 (확정)

운영자 프로필 확정 사항: **"자동 분석 결과는 사실로 확정하기 전에 운영자가 확인할 수 있어야 한다."**

따라서 산출물을 위험도로 나눈다.

| 산출물 | 반영 | 이유 |
|---|---|---|
| `ai_summary` | 엔트리에 직접 write | 원문 `body`를 건드리지 않고 되돌릴 수 있다 |
| `tags` | 엔트리에 write, 단 `tag_source='ai'`로 표시 | UI에서 **권장(dashed)**으로 렌더 — 사실로 위장하지 않는다 |
| 할 일 추출 | `work_orders` `status='proposed'` | **`tasks`에 직접 쓰지 않는다** |
| 콘텐츠 아이디어 | `work_orders` `status='proposed'` | **콘텐츠 기록에 직접 쓰지 않는다** |

승인은 기존 `decide_work_order` 경로를 그대로 쓴다. 새 승인 UI를 만들지 않는다.

`work_orders.body` 페이로드: `{ journalEntryId, quote, rationale }` — 제안의 근거가 된 일지 원문 인용을 반드시 싣는다. 근거를 못 보여주는 제안은 승인 판단이 불가능하다.

---

## 9. MCP 도구 (투영 선반영)

`2026-09-04-mcp-server-audit-and-expansion-design.md`가 사후 교정하려는 실수 — 화면용 BFF 응답을 그대로 통과 — 를 **일지는 처음부터 하지 않는다.**

| 도구 | 반환 | 크기 목표 |
|---|---|---|
| `list_journal({ from, to, tags, digestStatus, limit })` | `{ id, occurredAt, summary, tags, tagSource, hasBody }[]` — **본문 제외** | 100건 ≈ 10KB |
| `get_journal_entry({ id })` | 본문 포함 단건 | 건당 수 KB |
| `write_journal({ body, occurredAt?, tags?, title? })` | 저장 봉투 | — |
| `set_journal_tags({ id, tags })` | `tag_source='operator'`로 확정 | — |

쓰기는 `COM_MOON_HUB_WRITE_SECRET` 경유 (기존 계약 상속). `list_journal`이 본문을 반환하지 않는 것이 Tier 2를 실용적으로 만드는 조건이다 — 한 달치를 훑고 필요한 5건만 펼치는 흐름이어야 한다.

---

## 10. UI · IA

### 10.1 사이드바 배치 (권장 — 운영자 결정 필요)

**권장: `일지`를 9번째 primary 앵커로, `오늘` 바로 다음에 둔다.**

근거: (a) 운영자의 문제 진술이 "흩어져 있다"인데 2레벨 아래 묻힌 표면은 "쫙 모아둔다"를 만족시키지 못한다. (b) 매일 쓰고 주간에 읽는 daily-touch 표면이다. (c) `hub-nav.js` 자신의 주석이 "the anchor set is not a fixed contract and may change"라고 적고 있다.

비용: `hub-nav.test.mjs:42`의 `SIDEBAR_PRIMARY.length` 8 → 9, 키 배열 갱신. 설계된 비용이다.

**대안(IA 변경을 미루려면): `내 작업` 앵커의 2레벨 자식으로 `dashboard/work/journal`을 넣고 `tasks.owns`에 prefix를 추가한다.** 이 경우에도 `owns` 추가는 필수다 — 어느 앵커도 소유하지 않는 경로는 `hub-nav.test.mjs`의 "모든 경로가 정확히 1개 앵커를 켠다" 단언에서 실패한다.

라우트: `dashboard/work/journal`. `NAV_TREE`(⌘K) 등록은 별도이며, 등록만으로는 사이드바 행이 생기지 않는다.

### 10.2 화면 (DESIGN.md 준수)

- `<h2>일지</h2>` 하나 (DESIGN §11 — 페이지당 h2 1개)
- **작성 박스**: 여러 줄 textarea + 날짜 필드(`occurred_at`, 기본 오늘) + 저장 버튼. Quick Capture와 달리 Enter는 줄바꿈이고 저장은 명시 버튼 — 본문이 길기 때문
- **타임라인**: 날짜 그룹 헤더 + 엔트리 행(`.hub-row`, JS hover 금지)
- 행 구성: `occurred_at`(`.mono`, ≥10.5px) · `ai_summary` 또는 `body` 첫 줄 · 태그 칩
- **태그 확정도**: `CertaintyBadge state="recommended"`(AI 태그 — dashed ◇ + `권장`) vs `state="confirmed"`(운영자 확정 — solid). DESIGN §5.3·§8.2 그대로. **AI 추천을 사실처럼 렌더하지 않는다**
- **기록 상태**: `TruthBadge`(live/preview/error). Hub read 봉투 계약(200 + `{status:'error'}`)을 읽어 분기 — `!r.ok`만 보면 read 실패가 "기록 없음"으로 위장된다
- **필터**: `SegmentedControl`(전체 / 정리 전 / 정리됨) + 태그 칩
- 행 클릭 → `EditDrawer`(본문·날짜·태그 편집, "정리 안 함" 토글, 프로젝트 연결). ESC·오버레이·닫기 3중
- `EmptyState` + 작성 CTA, `N` 단축키로 새 일지 (DESIGN §8.1)
- **색**: 새 색 없음. 태그는 중립 + 기하로 구분한다. 일지에 위급 개념이 없으므로 **`--danger`를 쓰지 않는다**. `--success`/`--warning`/`--info`로 태그를 칠하지 않는다(DESIGN §5.2)

---

## 11. 구현 순서

### P0 — AI 없이도 유용한 일지

1. `20260905_0024_journal_entries.sql` (+ `work_orders.source` 확장)
2. `apps/hub/lib/repositories/journal-ledger.js`
3. `GET /api/hub/journal` — **read 봉투 계약 준수**(200 + `{status}`), `apps/hub/lib/repositories/` 경유
4. `POST /api/hub/journal` — `hub-write-guard` → `server-write` → `@com-moon/supabase-rest`
5. `components/hub/pages/journal.jsx` + `PAGE_MAP` 등록 + `lazyPage`는 **`ssr:false` 필수**
6. `hub-nav.js` 앵커 + `hub-nav.test.mjs` 갱신 + `NAV_TREE` 등록
7. 붙여넣기·파일 임포트 (규칙 기반 분할 + `content_hash` 중복 차단 + 미리보기 게이트)

**P0 종료 조건: AI를 한 번도 부르지 않고도 흩어진 기록이 한 곳에 모인다.** 이게 운영자의 원래 문제다.

### P1 — Tier 1 AI

8. Engine `POST /api/ai/journal-digest` + Hub `POST /api/hub/journal/digest`
9. 상태 기계 · 배치 상한 · 재실행 안전 · 비용 표시
10. 태그 확정도 UI (`CertaintyBadge`) + 운영자 확정 write
11. 추출 산출물 → `work_orders` `proposed` (`source='journal'`, 근거 인용 포함)

### P2 — Tier 2 · MCP

12. MCP 도구 4종 (투영 적용)
13. 회고 프롬프트 정본 (`docs/superpowers/prompts/journal-retro.md`)
14. 야간 크론 — **선행 조건: 고장난 크론 2개의 Engine 계약 불일치 수리**

---

## 12. 미정 (운영자 결정 대기)

- **`memos` 테이블 삭제 여부** — 소비자 0건이지만 drop 마이그레이션은 별도 결정. 이 문서는 폐기 *표시*까지만 권장한다.
- **사이드바 9번째 앵커 승격 여부** (§10.1) — 권장안은 승격, 대안은 `내 작업` 자식.
- **야간 자동 정리 크론** — 비용과 선행 수리 두 조건이 걸려 있다.
- **회고 리포트 저장 위치** — 일지 엔트리 1건으로 두는 것을 권장하나, 기간 객체가 필요해지면 별도 테이블.
- **workspace/scope 분리** — 일지는 개인 정본이므로 스코프 1개로 시작하는 것을 권장. ClassIn 공식 기록과 섞지 않는다(운영자 프로필: 개인 상세 메모는 ClassIn으로 복제하지 않는다).
- **음성 입력** — 운영자 캡처 선호에 있으나("급하거나 손을 쓰기 귀찮을 때: 음성") P2 이후.
- **Obsidian export(역방향)** — `daily-operating-note-todo.md` P1-7. 이번 범위 밖.

---

## 13. 테스트 계약

루트 `npm test`(node `--test`) 글롭 안에 들어가야 한다.

- `apps/hub/lib/repositories/journal-ledger.test.mjs` — read 봉투(`live`/`preview`/`error`), 정렬 키가 `occurred_at`(≠`created_at`)
- `apps/hub/lib/journal-import.test.mjs` — 분할 규칙 5종, `occurred_at` 추론 우선순위, `content_hash` 재임포트 멱등
- `apps/hub/lib/journal-tags.test.mjs` — 고정 6키 미등재 드랍, **`tag_source='operator'` 행은 AI가 덮지 않음**
- `apps/hub/components/hub/hub-nav.test.mjs` — 앵커 개수·키 배열 갱신, 신규 경로가 정확히 1개 앵커를 켬
- `apps/hub/components/hub/state-usage.test.mjs` — 일지 페이지가 read 실패를 빈 상태로 위장하지 않음

Tier 1 다이제스트는 Gemini 호출을 스텁하고 **상태 전이와 상한만** 검증한다 — 모델 출력 품질은 테스트 대상이 아니다.
