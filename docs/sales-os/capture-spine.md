# 캡처 스파인 — Sales OS (현장 데이터가 DB로 들어오는 길)

> 역할: 운영자가 현장(전화·방문 사이, 모바일)에서 만드는 **자잘한 데이터**가 어떻게 입력되고,
> AI가 어떻게 분류·정규화해서 **이미 있는 테이블**로 정리해 넣는지의 단일 계약서.
> 짝: [context-spine.md](context-spine.md)는 *읽기*(360 조립), 이 문서는 *쓰기*(캡처·인테이크).

운영자: 문준혁 (ClassIn B2B 세일즈, ownerId `3935704427463307`). 모션 = 콘텐츠→DM→전화→방문→카톡.

## 0. 핵심 원칙 — "새 DB를 설계하지 않는다"

레포엔 이미 세일즈 모션에 필요한 테이블이 거의 다 있다. 캡처 스파인이 하는 일은 **새 스키마를 만드는 게
아니라**, 현장에서 던진 **한 줄**을 받아 **올바른 기존 테이블로 라우팅**하는 것이다.

- 운영자는 **한 줄만 던진다**(자연어). 정규화·분류·DB 넣기는 **AI가** 한다.
- 패턴은 명함 인입과 동일: `캡처 → staging(normalized) → 분류·라우팅 → 레저 → outcome 학습`.
- 모든 쓰기는 **moonlight Supabase 내부**에만. 회사 CRM(eeoCRM) 쓰기·고객 발송은 **one-way door = 사람**(인박스 라우터가 절대 안 함).

## 1. 주 캡처 표면 — 구글시트 `Inbox` 탭

현장(폰)에서 구글시트 앱으로 한 줄 적는다. `/team`(또는 `/inbox`)이 데스크톱에서 비운다.

| 컬럼 | 누가 채움 | 내용 |
|------|-----------|------|
| `ts` | 자동/수기 | 캡처 시각 |
| `raw` | **운영자(유일 필수)** | 한 줄 자연어. 예: `대치수학 원장 통화, 가격 비싸다 함, 화요일 재방문 약속` |
| `hint` | 운영자(선택) | 빠른 태그: `리드/통화/방문/DM/아이디어/반응/메모` (없어도 AI가 추론) |
| `status` | AI | 빈칸→`routed`/`review`/`error` |
| `routed_to` | AI | 도착: `테이블:id` (예: `outreach_outcomes:uuid`) |
| `note` | AI | 분류 근거 또는 needs_human 사유 |

운영자가 항상 만지는 건 `raw`(+선택 `hint`) **둘 뿐**. 나머지는 AI가 채운다. 시트싱크가 이미 있어 **UI 빌드 0**.

## 2. 라우터 — 한 줄 → 올바른 기존 테이블

`/team` 시작(또는 `/inbox`)이 `Inbox`의 미처리(`status` 빈칸) 행을 읽어 분류·정규화·라우팅한다.
**모든 도착지는 이미 있는 테이블이다(신규 0, 단 engagement는 meta).**

| 분류 | 신호(예) | 도착 테이블 | 정규화 필드 |
|------|----------|-------------|-------------|
| **새 리드** | 명함·소개·신규 학원 | `lead_intake_raw`(source=`inbox`) → promote → `leads`+`contacts` | company, contact, phone, channel |
| **DM 인입** | 인스타/스레드 DM | `lead_intake_raw`(source=`inbox`, `normalized.channel="dm"`) → `leads` | handle, company, ask |
| **통화·방문 결과** | 통화/방문/만남 + 반응 + 다음약속 | `outreach_outcomes` + `leads/deals.next_action`·`last_touch_at` | lead/deal 매칭, channel(`phone`/`visit`/`kakao`), action, 다음 팔로업 |
| **콘텐츠 아이디어** | 아이디어·소재·앵글 | `content_items`(status=`idea`, source_type=`idea`) | title, angle, channel |
| **게시물 반응** | "이 글 반응 좋/나빴" | `content_items.meta.engagement` (winner/loser) | content ref, metric, verdict |
| **메모/기타** | 그 외 | `notes` | title, body |
| **모호** | 분류 불가 | **드롭 안 함** → `status=review` (needs_human) | 사유 |

**매칭:** `raw`의 회사명/이름을 `match_key`(회사명 정규화 — 명함·시트와 동일 키)로 `companies`/`leads`에
매칭. 매칭 실패 → 신규 `lead_intake_raw` staging(명함 패턴 재사용).

**멱등·안전:**
- 처리한 행은 `status`/`routed_to`를 써서 **재처리 방지**(status 가드).
- 라우터는 **순수 인테이크** — 자동 발송 없음, eeoCRM 쓰기 없음. 내부 정리이므로 게이트 없음(자동).
- **드롭 0:** 모호하면 `review`로 남기고 사유 첨부. 명함처럼 신뢰도 낮으면 promote 보류(`review`).

## 3. 하루 리듬

```
[현장/폰]  명함 → 명함 버튼(사진)            ─┐
           통화·방문 끝 → Inbox 한 줄         ─┤
           DM 옴 → Inbox 한 줄               ─┼─→  구글시트 Inbox 탭 (raw 한 줄들)
           아이디어 → Inbox 한 줄            ─┤
           게시물 반응 → Inbox 한 줄          ─┘
                                                      │ /team(또는 /inbox)이 비움
[데스크톱] 라우터: 분류 → 정규화 → 매칭 → 올바른 테이블 → status=routed
           ↓
           360 조립(context-spine) → 5 페르소나 루프 → 검수/Codex → 큐 → 실행=사람
           ↓
           outcome → outreach_outcomes → 내일 트리아지 학습
```

명함은 이미 즉시 자동(사진→promote). 인박스는 현장에서 못 찍는 *나머지 모든 순간*을 한 줄로 받는다.

## 4. DB 변경 (작다 — migration `0010`)

새 테이블 없음. 기존 스키마에 최소 추가:

1. **`lead_intake_raw.source`에 `inbox` 추가** — 현장 한 줄 캡처가 리드로 라우팅될 때의 소스.
   (0009의 `business_card` 유지하며 widen.)
2. **`agents.agent_type`에 `order`/`production`/`review` 추가** — `sales`/`content`는 이미 있음.
3. **5 페르소나를 `agents` 테이블에 시드** — `registry.json` → DB. config jsonb에 `{persona_id, file, emits, gate, activation}`. → 이걸로 `agents.jsx`(현재 mock)가 나중에 실데이터로 읽고, `COUNCIL` 상수를 대체.
4. **게시물 반응(engagement)** — DDL 없음. `content_items.meta.engagement = {likes, saves, comments, reach, verdict:"winner|loser", captured_at}`. 양 많아지면 `content_engagement` 테이블로 졸업.

> 적용은 별도(코드 빌드 환경). prod 마이그레이션은 `SUPABASE_ACCESS_TOKEN` PAT로 `db:migrate` 또는
> 대시보드 SQL 에디터(0009와 동일 경로). 이 문서·migration은 *설계*이고 자동 적용하지 않는다.

## 5. 왜 이 설계인가 (운영자 현실에 맞춤)

- **최대 잡무 = 팔로업** → 통화·방문 결과를 한 줄로 던지면 `outreach_outcomes` + `next_action`이 자동 정리 → 팔로업이 새지 않음.
- **모바일·빠름** → 시트 앱 한 줄, UI 빌드 0, 폰에서 즉시.
- **이메일 0 / DM 인입** → DM도 한 줄로 인박스 → 리드화.
- **콘텐츠 병목(소재·꾸준함)** → 아이디어·반응을 한 줄로 → `content_items`/engagement → 콘텐츠 ranker 실데이터화.
