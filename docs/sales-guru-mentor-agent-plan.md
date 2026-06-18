# 세일즈 구루 멘토 에이전트 — 적용 기획

## 1. 문서 목적

이 문서는 Moonlight에 **세일즈 구루 멘토 에이전트(Sales Guru)** 를 도입하는 방법을
실제 제품/구현 수준으로 구체화한다. 새로운 별도 제품을 만드는 것이 아니라,
이미 존재하는 두 표면을 잇는다.

- `apps/hub` 의 **Agents** 레이어 (`components/hub/pages/agents.jsx`, `COUNCIL` 페르소나)
- `apps/hub` 의 **Revenue** 원장 (`pages/revenue.jsx` — leads / deals / cases / accounts)
- `apps/engine` 의 **AI brief** 패턴 (`app/api/ai/brief/route.ts` + `lib/gemini.ts`)

즉 "영업 데이터를 읽고, 멘토 관점으로 판단을 돌려주고, 그 판단을 원장에 다시 적는"
하나의 루프를 기존 자산 위에 얹는 것이 이 기획의 범위다.

## 2. 한 줄 제안

> 세일즈 구루는 **딜을 대신 굴리는 실행자가 아니라, 운영자(파운더)의 영업 판단을
> 옆에서 코칭하는 멘토 페르소나**다. Revenue 원장을 컨텍스트로 읽어
> "지금 무엇을 놓치고 있는지 · 다음에 무엇을 해야 하는지"를 멘토 어조로 돌려준다.

핵심 구분: Council의 기존 `Operator`/`Strategist`가 *작업을 실행/계획*한다면,
Guru는 *왜 이 딜이 막혔고, 어떻게 다르게 접근해야 하는지를 가르친다*. 출력은
지시(order)가 아니라 **코칭(coaching) + 다음 액션 제안**이다.

## 3. 왜 지금 필요한가

현재 Revenue 표면은 상태를 잘 **보여주지만**, 판단을 **돕지는** 않는다.

- `revenue.jsx`의 `buildRevenueAttention()`은 규칙 기반("10일 이상 정체",
  "신규 리드 N건")으로 주의 항목만 나열한다 — *왜* 막혔는지, *어떻게* 풀지는 없다.
- `Deals` 칸반은 stage를 드래그로 옮길 뿐, 각 딜의 다음 수가 무엇인지 코칭이 없다.
- `Accounts`의 `LogComposer`/노트는 기록은 쌓이지만 그 기록을 읽고 조언하는 주체가 없다.
- `COUNCIL`에는 `strategist · analyst · writer · operator · coach`는 있어도
  **영업 전담 멘토가 없다** (`coach`는 리듬·회고 담당이라 결이 다르다).

영업은 파운더가 가장 외롭게 판단하는 영역인데, Hub는 여기에 동료를 붙여주지 못하고 있다.
Guru는 이 공백을 메운다.

## 4. 페르소나 정의

| 항목 | 값 |
| --- | --- |
| key | `guru` |
| label | `Guru` |
| role | `영업 멘토 · 딜 코칭` |
| tone | `moon` (DESIGN 토큰 — 신규 색 도입 금지) |
| 성격 | 직설적·구체적·방향 제시형. 칭찬보다 "다음 한 수"에 집중 |
| 지식 베이스 | 3종(운영자 제공). ① `docs/sales-guru-knowledge-base.md` 12인 세일즈 구루 플레이북 ② `docs/sales-decision-styles.md` 구매자 의사결정 7스타일 ③ `docs/marketing-branding-gurus.md` 마케팅/브랜딩 3인(고딘·오길비·밀러) |
| 출력 형식 | (선택) 구매자 스타일 진단 → 진단 → 리스크 → 다음 액션 (brief route의 한국어 3단 구조 확장) |
| 모델 | Engine 기본 모델 (`gemini-3-flash-preview`), Chat 표기는 페르소나명만 노출 |

**멘토 보이스(Copy tone, DESIGN §10 준수)**

- Good: `클래스인 — 결정자 미접촉. 다음 미팅 전에 power sponsor부터 잡으세요.`
- Bad: `AI 기반 세일즈 인텔리전스로 파이프라인을 최적화하세요.`

## 5. Job-to-be-Done

사용자가 Guru에게 기대하는 것은 4가지다.

1. **파이프라인 분류(triage)** — "이번 주 무엇부터 손대야 하지?"
2. **딜 진단** — "이 딜이 왜 안 움직이지? 막힌 지점이 어디지?"
3. **제안/대응 코칭** — "프로포절/이메일/반론 대응을 어떻게 다듬지?"
4. **주간 영업 회고** — "지난 주 영업 활동에서 뭘 배워야 하지?"

각 JTBD는 아래 **멘토링 모드(mode)** 로 매핑된다.

| Mode | 입력 컨텍스트 | 출력 |
| --- | --- | --- |
| `pipeline-triage` | 전체 deals + leads + attention 신호 | 우선순위 3건 + 이유 |
| `deal-review` | 단일 deal + account activity/notes | 막힌 지점 진단 + 다음 액션 |
| `proposal-critique` | 사용자가 붙인 초안 텍스트 | 구조/설득력 피드백 3점 |
| `weekly-retro` | 최근 7일 deal 이동 + won/lost | 패턴 + 다음 주 1개 실험 |

### 5.1 구매자 의사결정 스타일 적응 (cross-cutting)

`docs/sales-decision-styles.md`의 7스타일(논리형·관계형·권위형·직관형·안정형·체면형·집단합의형)은
모든 모드에 걸치는 **번역 레이어**다. 핵심 원칙: *"사람을 바꾸려 하지 말고, 메시지를 그 사람의 언어로 번역하라."*

- **deal-review**에서 Guru는 account의 activity/notes(대화 신호)를 보고 **추정 스타일**을 먼저 제시하고,
  같은 다음 액션을 그 스타일의 언어로 변환한다 (예: 권위형 → "한 줄 결론+성과 수치", 안정형 → "레퍼런스+단계적 도입").
- 신호가 부족하면 단정하지 않고 **"스타일 미확인 — 다음 미팅에서 확인할 질문"** 으로 돌려준다.
- 스타일이 account 노트에 명시돼 있으면 그대로 인용, 없으면 추정임을 표기(사실성 가드).

## 6. 데이터 / 연동 매핑

Guru는 **새 데이터 소스를 만들지 않고** 기존 원장을 읽고 쓴다.

**읽기 (입력 컨텍스트)**
- `deals`, `leads`, `deal_stages` — `/api/hub/revenue` 가 노출하는 형태 그대로
- `accounts` + `ACCOUNT_DETAIL`(activity/notes) — deal-review 모드의 근거
- `cases` — 계정 건강도(health) 신호

**쓰기 (판단 기록)**
- Engine `brief` route가 `project_updates`에 쓰듯, Guru도
  `event_type: "ai.sales_mentor"`, `source: "guru"` 레코드로 코칭 결과를 적재한다.
- Supabase가 없는 환경은 CLAUDE.md 규칙대로 **mock과 섞지 않고** `preview`/empty 상태로 표기.

## 7. 아키텍처 적용

### 7.1 Engine — 멘토 라우트 신설

`apps/engine/app/api/ai/sales-mentor/route.ts` 를 `ai/brief/route.ts`를 템플릿으로 추가한다.

- 인증: 동일하게 `validateSharedWebhookRequest(req)` (공개 POST는 shared secret 검증).
- 컨텍스트 빌더: `buildWorkspaceContext` 대신 `buildSalesContext()` —
  `deals / leads / accounts / cases` 를 Supabase REST로 조회.
- `systemInstruction`: 멘토 페르소나 프롬프트(아래 §8).
- `mode` 파라미터로 §5 표의 4개 모드 분기.
- 성공 시 `insertSupabaseRecord("project_updates", { source:"guru", event_type:"ai.sales_mentor", ... })`.
- `insertIntegrationSyncRun({ provider: "guru" ... })`로 실행 로그 적재 → Automations/Runs에서 가시화.

> brief route의 인증·persistence·syncRun 구조를 그대로 재사용하므로 신규 인프라가 필요 없다.

### 7.2 Hub → Engine 호출

`apps/hub/app/api/hub/` 아래에 read-through proxy를 둔다 (Hub read API 규칙).
호출 시 `COM_MOON_SHARED_WEBHOOK_SECRET` 를 헤더로 전달(CLAUDE.md 규칙).

### 7.3 페르소나 등록

`apps/hub/components/hub/hub-data.js` `COUNCIL` 배열에 한 줄 추가:

```js
{ key: 'guru', label: 'Guru', role: '영업 멘토 · 딜 코칭', tone: 'moon', last: '클래스인 딜 진단' },
```

`agents.jsx`의 `OFFICE_AGENTS`에도 동일 페르소나를 추가해 VR Office에 자리 배치
(색은 기존 `a.color` 관례 따르되 DESIGN 안티패턴 색은 금지).

## 8. 멘토 프롬프트 설계

`brief/route.ts`의 `buildPrompt` 패턴을 확장. 한국어 3단 출력 골격을 유지한다.
멘토의 **판단 프레임**은 3종 지식 베이스에서 가져오며(§14 매핑표가 모드별 1차 근거를 정의),
**사실**(딜 상태·금액·접촉 이력)은 항상 원장에서만 인용하고 지식 베이스로 단정하지 않는다.
지식 베이스는 토큰이 크므로 전체를 매 호출에 넣지 않고, 모드별로 필요한 섹션 발췌만
systemInstruction에 주입한다(예: deal-review → Keenan 4층 + 의사결정 스타일표).

```
systemInstruction:
  "당신은 Moonlight 운영자의 영업 멘토입니다. 노련한 세일즈 코치처럼
   직설적이고 구체적으로, 한국어로 조언합니다. 칭찬·일반론은 금지하고
   항상 '다음 한 수'로 끝맺습니다. 데이터에 없는 사실은 단정하지 않습니다."

prompt(mode, context):
  - 모드별 질문 1줄
  - 출력 형식:
      1. 진단        (지금 무엇이 보이는가)
      2. 리스크      (놓치면 잃는 것)
      3. 다음 액션   (구체적 1~3개, 담당/기한 포함)
  - "Sales ledger snapshot:" + JSON.stringify(context)
```

모드별 질문 예시:
- `deal-review`: "이 딜의 정체 원인을 진단하고, 다음 미팅 전 해야 할 액션을 제시하라."
- `pipeline-triage`: "이번 주 가장 먼저 손대야 할 딜 3건과 이유를 우선순위로 제시하라."

## 9. UI 적용 지점

기존 primitives(`hub-primitives.jsx`)와 토큰만 사용. 새 컴포넌트는 필요할 때만.

1. **Agents → Council**: Guru 카드 자동 노출 (`COUNCIL` 추가만으로 렌더됨).
2. **Agents → Chat**: `?agent=guru` 진입 시 멘토 스레드. 입력창 하단 페르소나 표기 `Guru`.
3. **Revenue → Overview**: `Attention needed` 카드 옆/아래에 **"Guru 코칭"** 패널 1개.
   - 비어있을 때 EmptyState: "Guru에게 이번 주 파이프라인 분류를 요청하세요."
   - 버튼 → `pipeline-triage` 호출, 결과 3줄 표시 + "Chat에서 이어가기".
4. **Revenue → Deals**: 각 딜 카드의 더보기에 `Guru에게 진단 요청` 액션 → `deal-review`.
5. **Revenue → Accounts (DetailPanel)**: `QuickActions`에 `Ask Guru` 추가 →
   해당 account의 activity/notes를 컨텍스트로 `deal-review`.

모든 진입은 결국 `dashboard/agents/chat?agent=guru&mode=...&ref=...` 로 수렴(단일 멘토 스레드).

## 10. 단계적 적용 (Phase)

| Phase | 범위 | 산출물 |
| --- | --- | --- |
| **P0 — 페르소나** | `COUNCIL`/`OFFICE_AGENTS`에 guru 추가, Chat 진입 | UI에 멘토 등장 (mock 응답) |
| **P1 — Engine 루프** | `ai/sales-mentor` route + Hub proxy, `pipeline-triage` 1개 모드 | 실제 LLM 코칭 1종 |
| **P2 — 컨텍스트 심화** | `deal-review` / account 연동, project_updates 적재 | 딜 단위 진단 + 원장 기록 |
| **P3 — 회고/자동화** | `weekly-retro` 스케줄 오더, Runs 가시화 | 주간 자동 영업 회고 |

P0는 데이터 변경 없이 프론트만으로 가치 검증 가능 → 가장 먼저 착수.

## 11. 검증 지표

- 코칭 채택률: Guru 제안 → 실제 deal stage 이동/액션 기록으로 전환된 비율
- 정체 해소: `age > 10` 정체 딜이 Guru 진단 후 7일 내 움직인 비율
- 사용 빈도: 주간 `pipeline-triage` 호출 수, account별 `Ask Guru` 사용 수
- 신뢰: "데이터에 없는 단정" 0건 (멘토 출력 사실성 가드)

## 12. 디자인 / 안티패턴 가드레일 (DESIGN.md 준수)

- 색: `moon` 토큰만. 영업이라고 green/gold 같은 "성공색 강조" 도입 금지.
- 보더: `1px solid var(--line-soft)` 유지, 카드 배경 `var(--surface*)` — 흰 배경 금지.
- 멘토 패널은 카드 1개로 절제. Overview를 12카드로 채우는 안티패턴 회피.
- 코칭 텍스트는 운영자 보이스(짧고 구체적·방향형), 마케팅 카피 금지.
- 모든 상태(loading/empty/error)를 설계에 포함 — 특히 Supabase 부재 시 preview 표기.

## 13. 구현 체크리스트 (파일 기준)

- [x] `docs/sales-guru-knowledge-base.md` — 12인 세일즈 구루 플레이북 (운영자 제공 원본)
- [x] `docs/sales-decision-styles.md` — 구매자 의사결정 7스타일 (운영자 제공)
- [x] `docs/marketing-branding-gurus.md` — 마케팅/브랜딩 3인 (운영자 제공)
- [x] `apps/hub/components/hub/hub-data.js` — `COUNCIL`에 `guru` 추가
- [x] `apps/hub/components/hub/pages/agents.jsx` — `OFFICE_AGENTS`에 guru, Chat 페르소나 분기(`?agent=guru`)
- [x] `apps/engine/app/api/ai/sales-mentor/route.ts` — 신규 (brief route 템플릿, 4개 모드)
- [x] `apps/hub/app/api/hub/sales-mentor/route.js` — Engine proxy (원장 컨텍스트 + shared secret)
- [x] `apps/hub/components/hub/pages/revenue.jsx` — Overview "Guru 코칭" 패널(`pipeline-triage`)
- [ ] (다음) Deals 카드 `Guru에게 진단 요청` · Accounts `Ask Guru` 액션 (`deal-review`)
- [ ] (P3) Agents Orders에 `weekly-retro` 스케줄 오더 등록

## 14. 지식 베이스 → 모드 매핑

> 각 모드가 3종 지식 베이스에서 어떤 프레임을 1차 근거로 인용하는지 정의한다.
> systemInstruction 발췌 주입과 프롬프트 설계의 기준표. Guru는 코칭 시
> "어느 구루/스타일의 어떤 프레임"인지 1줄로 출처를 밝혀 신뢰를 만든다
> (예: *"Keenan 4층 기준, 지금 Layer 3(매출 영향)이 비어 있습니다"*).

| Guru 모드 | 세일즈 구루 플레이북 | 의사결정 스타일 | 마케팅/브랜딩 |
| --- | --- | --- | --- |
| `pipeline-triage` | Cardone 10X Contact·정체, Ross MEDDIC, Tracy 시간 우선순위 | 스타일별 정체 원인 추정 | — |
| `deal-review` | Keenan 4층 GAP, Voss 협상, Belfort 확신 온도, Ziglar 5장애물 | **핵심** — 추정 스타일 + 언어 번역 | — |
| `proposal-critique` | Rackham SPIN·Benefit, Keenan Change of State | 타깃 스타일에 맞춘 톤 | **핵심** — Miller SB7(고객=영웅), Ogilvy 카피, Godin SVM/포지셔닝 |
| `weekly-retro` | Girard 파일·팔로업, Lemkin churn·expansion, Hill 목표 | 스타일별 win/lost 패턴 | Godin 부족/허락(반복 고객) |

**적용 규칙**
- 지식 베이스는 **판단 프레임**으로만 쓰고, 사실은 항상 deals/accounts 원장에서 인용.
- 마케팅 3인은 주로 메시지/제안/콘텐츠 코칭(`proposal-critique`)에서 발동 —
  영업 클로징 모드에서는 세일즈 12인이 우선, 마케팅은 보조.
- 의사결정 스타일은 `deal-review`의 첫 단계(스타일 진단)로 항상 시도, 신호 부족 시 미확인 처리.

---

### 부록 A. 한눈에 보는 데이터 흐름

```
Revenue 원장 (deals/leads/accounts/cases)
        │  read
        ▼
Hub proxy  ──(shared secret)──►  Engine /api/ai/sales-mentor
        ▲                                  │ gemini (멘토 systemInstruction)
        │  코칭 결과                         ▼
   Agents Chat (guru) ◄── project_updates(source:guru) + sync run(Runs)
```
