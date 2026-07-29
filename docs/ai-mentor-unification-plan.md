# AI 멘토 시스템 통합 기획 — Council · Guru · 지식 베이스

> 상태: DEFERRED FEATURE SPEC — Council·Guru 기존 자산은 유지하되 Phase 1B·1C보다 먼저 구현하지 않는다 (`docs/README.md` §3~4 기준).
> 성격: 통합 **개념/기획** 문서. 코드 변경 없음. 아래 제안은 전부 `권장` 또는 `미정`이며, 운영자 확정 전까지 새 구현의 근거로 쓰지 않는다(CLAUDE.md 원칙).
> 관계: [`sales-guru-mentor-agent-plan.md`](sales-guru-mentor-agent-plan.md)(Guru 개별 기획), [`agent-tab-mvp-ui-spec.md`](agent-tab-mvp-ui-spec.md)(Agent 탭 전체 UI 구조), [`sales-guru-knowledge-base.md`](sales-guru-knowledge-base.md) / [`marketing-branding-gurus.md`](marketing-branding-gurus.md) / [`sales-decision-styles.md`](sales-decision-styles.md)(지식 베이스 원본)을 하나의 개념 아래 묶는다. 위 문서들의 세부 내용은 재복제하지 않고 링크만 한다.

## 1. 문서 목적

Council(브랜드 멘토)과 Guru(세일즈 멘토)는 같은 시기, 같은 패턴("원장을 읽고 멘토 관점으로 코칭을 돌려준다")으로 태어났지만 서로 다른 문서·다른 세션에서 독립적으로 설계된 탓에, 오늘 코드에서는 **개념적으로는 쌍둥이인데 구현은 비대칭**이다. 이 문서는

1. 코드를 근거로 두 멘토의 현재 상태를 나란히 진단하고,
2. 이름·계약·동작이 갈라진 지점을 구체적으로 짚고,
3. "AI 멘토"라는 하나의 상위 개념으로 묶는 통합 모델을 제안하고,
4. 간극을 메우는 선택지를 운영자가 고를 수 있는 형태(확정 아님)로 정리한다.

## 2. 왜 지금 통합 문서가 필요한가

- `sales-guru-mentor-agent-plan.md`의 구현 체크리스트는 사실상 전부 완료(P0~P2)로 표시돼 있지만, `docs/README.md`는 여전히 이 기능을 "보류"로 분류한다 — 실행 코드는 앞서가는데 기획 문서는 그 상태를 반영하지 못하고 있다.
- `agent-tab-mvp-ui-spec.md`가 그린 `Agent` 탭(Overview·Roster·Orders·Threads·Council)의 `Council` 서브탭은 "여러 에이전트의 합의를 보는 레이어"로 정의돼 있는데, 실제 코드의 `Council`은 그 정의와 다른 두 가지 역할(로스터 현황판 + 브랜드 멘토 자문)을 동시에 맡고 있다. 스펙과 구현이 어긋난 채 둘 다 "Council"이라는 이름을 쓴다.
- Guru 쪽은 Chat에서 모드가 실제로 자동 실행되는데(`agents.jsx`의 `runGuru`), 같은 패턴을 흉내 낸 Council의 "Chat에서 이어가기" 버튼은 실제로는 빈 세션을 연다 — "두 멘토가 동일 계약을 따르는 인스턴스"라는 전제 자체가 코드에서 깨져 있다(§3.3).
- 지식 베이스는 이미 3종(세일즈 12인·구매자 7스타일·마케팅/브랜딩 3인)이 있고 모드별 인용 규칙(§14 매핑표, `sales-guru-mentor-agent-plan.md`)까지 설계돼 있다. 이 자산은 훌륭한데 Council 쪽에는 동등한 매핑표가 없다.

## 3. 현재 상태 진단 (코드 기준, 2026-07-20)

### 3.1 나란히 비교

| 항목 | Council (브랜드 멘토) | Guru (세일즈 멘토) |
|---|---|---|
| 대상 lane | 운영자 개인 브랜드/창업 준비(시나브로·고래·HolyFunCollector·22nomad 등) | ClassIn B2B 세일즈 |
| Engine route | `apps/engine/app/api/ai/brand-mentor/route.ts` | `apps/engine/app/api/ai/sales-mentor/route.ts` |
| Hub proxy | `apps/hub/app/api/hub/brand-mentor/route.js` | `apps/hub/app/api/hub/sales-mentor/route.js` |
| 컨텍스트 조립기 | `lib/sales-os/brand-context.js`(content+project ledger, agent_runs) | `lib/sales-os/context-assembler.js`(deals/leads/accounts/cases, outcomes, agent_runs) |
| 모드 수 | 6 — content-critique · brand-strategy · audience-analysis · meeting-synthesis · flow-review · content-draft | 5 — pipeline-triage · deal-review · proposal-critique · weekly-retro · followup-draft |
| 지식 베이스 매핑표 | 프롬프트 내 `frames` 필드로 프레임 직접 명시(표 없음) | `sales-guru-mentor-agent-plan.md` §14에 모드×지식베이스 매핑표 존재 |
| 클라이언트 헬퍼 | `council-client.js` | `guru-client.js` |
| 인터랙티브 호출 시 work_order 생성 | **매 모드 호출마다 자동 생성** — `createCouncilWorkOrder`(`brand-mentor/route.js:102-128`) | **생성 안 함** — `agent_runs` 로그 + `runId` 반환뿐(`sales-mentor/route.js:99-113`) |
| 초안 모드 자동화(cron) | `cron/content-flywheel` → `content-draft` → work_order(`kind: content-draft`) | `cron/followup-autopilot` → `followup-draft` → work_order(`kind: followup-draft`) — 이 경로는 서로 대칭 |
| Chat 딥링크 모드 자동실행 | **없음** — `agent=council&mode=...`는 처리되지 않고 빈 "Council session"만 뜸(§3.3) | **있음** — `agent=guru&mode=...&ref=...` 진입 시 `runGuru` 자동 실행(`agents.jsx:135-138`) |
| Chat 내 빠른 액션 칩 | 없음 | `파이프라인 분류` / `주간 회고` 칩(`agents.jsx:232-237`) |
| 타이핑 메시지 처리 | "페르소나 미연결" 안내만 표시 | `proposal-critique`로 자동 전환되어 실제 코칭 응답 |
| UI 진입점 | Agents→Council `CouncilCoachPanel`(brand-strategy 고정), Studio 에디터, Brand Projects 자문 패널(`council-client.js` 헤더 주석 기준) | Revenue→Overview `GuruCoachPanel`(`revenue.jsx:175`), Deals 카드 `Guru에게 진단 요청`, Accounts `Ask Guru`, Agents Chat |
| 기록 테이블 | `project_updates(source:council)` + `work_orders(persona:council)`(매번) | `project_updates(source:guru)` + `work_orders(persona:guru)`(cron 경로만) |

### 3.2 "Council"이라는 이름이 가리키는 두 가지

코드에서 `Council`은 사실 **서로 다른 두 개념**을 공유한다.

1. **팀 로스터 현황판** — `AgentsCouncil`(`agents.jsx:360-425`)이 렌더링하는 것은 `docs/sales-os/team-operating-layer.md`의 5-페르소나(오더·세일즈·콘텐츠·제작·검수, `persona-contract.js`)다. 이들은 아직 개별 채팅 실행 라우트가 없다 — `agents.jsx:13-15` 주석: "Persona-registry's 5 configured personas don't yet have individual chat endpoints." `Convene` 버튼(`?prompt=council`)을 눌러도 실제 AI 생성 없이 5개 로스터 상태를 텍스트로 종합만 한다.
2. **브랜드 멘토 자문** — `CouncilCoachPanel`이 호출하는 `requestCouncilAdvice`는 실제 Gemini 생성이다(§3.1). team-operating-layer의 5-페르소나와는 무관하며, Guru와 대칭 관계인 "브랜드 쪽 멘토"다.

같은 페이지, 같은 이름 아래 "아직 실행되지 않는 진짜 팀"과 "이미 실행되는 브랜드 멘토"가 섞여 있어, Council이 정확히 무엇을 하는 기능인지 한 화면 안에서 헷갈릴 여지가 있다. 참고로 `agents.jsx` 자체 주석은 예전 정적 6-페르소나 배열(strategist/analyst/writer/operator/coach/guru, "last output" 문구까지 있던)을 "실제 백엔드가 없던 fictional 로스터"로 명시하며 대체했다고 적어 두었다 — 지금의 5-페르소나 로스터가 그 자리를 정식으로 대신한다.

### 3.3 Council 자문 → Chat 연결 끊김 (구체적 간극)

`agents.jsx:341`의 "Chat에서 이어가기" 버튼은 `councilChatPath()`를 **인자 없이** 호출한다. `CouncilCoachPanel`이 방금 만든 `mode`/`text`가 전달되지 않으므로, 이동한 Chat에서는

- `agent=council`만 붙어 있어 `CHAT_PERSONAS.council`(Convene pseudo-persona)로 진입하고,
- `intro`가 정의돼 있지 않아 빈 스레드로 시작하며,
- Guru처럼 `mode` 자동실행 분기가 아예 없어(`agents.jsx:125-139`에 `a === 'council'` 케이스 없음) 방금 본 자문이 이어지지 않는다.

즉 "Chat에서 이어가기"는 현재 실질적으로 빈 세션을 여는 버튼이다. Guru는 동일 패턴(`guruChatPath({mode, ref})`)에서 실제로 이어진다 — 두 멘토가 "같은 계약을 따르는 두 인스턴스"라는 이 문서의 전제가 코드에서는 아직 사실이 아니라는 뜻이다.

## 4. 통합 개념 모델 (제안 — 권장)

두 멘토를 사후에 비교하는 대신, 앞으로는 **"AI 멘토" 공통 계약**의 두 인스턴스로 명시한다. 세 번째 멘토가 생기더라도(§6) 같은 계약을 채우기만 하면 되게 한다.

### 4.1 멘토 공통 계약 (제안)

| 필드 | 설명 | Council 현재 값 | Guru 현재 값 |
|---|---|---|---|
| `lane` | 어떤 원장/업무 영역을 보는가 | 브랜드/콘텐츠/프로젝트 | 세일즈(딜/리드/계정) |
| `modes[]` | 지원 모드 | 6종 | 5종 |
| `contextAssembler` | 원장→컨텍스트 조립 함수 | `assembleBrandContext` | `assembleSalesContext` |
| `knowledgeMap` | 모드×지식베이스 매핑표 | 없음 → 신설 여부는 §5.4에서 판단 | `sales-guru-mentor-agent-plan.md` §14 |
| `draftMode` | JSON 산출 초안 모드(승인 큐 직행) | `content-draft` | `followup-draft` |
| `workOrderPolicy` | 인터랙티브 호출을 work_order로 승격할지 | 매번 자동 | 안 함 — §5.1에서 정책 통일 제안 |
| `chatDeepLink` | Chat 자동실행 계약 | 미배선(§3.3) | 배선됨 |
| `voiceGuardrail` | 금지 표현/톤 가드레일 소스 | `context.brand`(브랜드별) | `context.brand`(classmoon 고정) |

### 4.2 유지할 차이 (통합 ≠ 동일화)

Council과 Guru를 하나의 계약으로 묶는다고 두 멘토의 인격·톤까지 같게 만들자는 뜻은 아니다. 오히려 아래는 의도적으로 다르게 유지한다.

- **어조**: Guru는 "코치"(직설·다음 한 수), Council은 "편집장+전략가"(Writer/Strategist/Analyst 렌즈 전환) — 이미 `SYSTEM_INSTRUCTION`에 구현된 차이이며 바꿀 이유 없음.
- **지식 베이스 풀**: 세일즈 구루 12인 vs 마케팅/브랜딩 3인은 분리 유지. `proposal-critique`(Guru)가 이미 마케팅 3인 프레임을 빌려 쓰듯(§14 매핑표) 필요한 모드에서만 크로스오버하는 지금 방식이 맞다.
- **lane 격리**: `brand-mentor` 시스템 인스트럭션이 "ClassIn 회사 영업 lane과 섞어 판단하지 않습니다"라고 명시한 경계는 유지 — 개인 브랜드와 회사 영업을 같은 멘토가 판단하면 안 된다는 전제는 CLAUDE.md의 Moonlight/ClassIn 정본 분리 원칙과 같은 선상이다.

## 5. 간극 해소 선택지 (미정 — 운영자 확인 필요)

아래는 결정이 아니라 선택지 제시다. 항목마다 트레이드오프를 병기한다.

### 5.1 work_order 자동 생성 정책

- **옵션 A. Guru도 Council처럼 매 호출 자동 승격.** 장점: 모든 자문이 실행 큐로 이어져 "조언하고 끝"이 안 됨. 단점: `pipeline-triage`처럼 하루 여러 번 눌러볼 수 있는 가벼운 모드까지 매번 승인 큐에 쌓이면 Orders가 노이즈로 찰 위험.
- **옵션 B. Council도 Guru처럼 절제 — draft 계열(`content-draft`/`followup-draft`)만 work_order, 나머지는 읽기 자문으로 유지.** 장점: 지금 Guru의 패턴이 오히려 맞고, Council 쪽을 낮추는 게 더 작은 변경. 단점: `brand-strategy` 같은 우선순위 판단이 실행으로 안 이어질 여지는 여전히 남음.
- **옵션 C. 모드별로 다르게(triage/review류는 읽기, 실행형만 큐).** 가장 정교하지만 규칙이 늘어남.

### 5.2 Council Chat 딥링크 배선

`agents.jsx` 효과 훅에 `a === 'council'` 자동실행 분기를 Guru와 대칭으로 추가하고, `CouncilCoachPanel`의 "Chat에서 이어가기"가 실제 `{mode, ref}`를 넘기게 고친다 — 이건 트레이드오프라기보다 **버그에 가까운 간극**이라, 통합 작업을 시작한다면 가장 먼저 정리할 후보로 제안한다(§7 Phase 1).

### 5.3 "Council" 이름 재정의

- **옵션 A.** 로스터 현황판을 "Team"으로 분리, "Council"은 브랜드 멘토 전용 이름으로 좁힌다 — Guru와 완전 대칭(lane마다 멘토 1개, 이름 1개). `agent-tab-mvp-ui-spec.md`가 그렸던 "Council = 여러 에이전트 합의" 정의는 폐기.
- **옵션 B.** 지금처럼 한 페이지에 유지하되 시각적으로 두 섹션을 명확히 라벨링만 분리("브랜드 멘토" / "팀 로스터"). 코드·라우팅 변경 없이 카피만 손댐.
- **옵션 C.** 현행 유지. 5-페르소나 팀이 언젠가 채팅 가능해지면(`team-operating-layer.md` Phase 3) 그때 "Council = 여러 에이전트가 실제로 토론하는 곳"이라는 원래 스펙 의미에 자연히 수렴할 수도 있음 — 지금 이름을 바꿨다가 그때 또 바꾸는 왕복 비용을 피함.

### 5.4 지식 베이스 매핑표 대칭화

Guru의 §14 매핑표와 대칭으로 Council용 매핑표를 새로 만들지 여부. 실익은 크지 않을 수 있음 — Council은 이미 모드별 `frames` 필드로 프레임을 직접 명시하고 있어(`brand-mentor/route.ts:19-64`) 표로 다시 뽑는 게 이중 작업일 수 있다. **권장: 새로 안 만들고, 이 문서 §3.1 표를 두 시스템의 공통 참조점으로 대신 쓴다.**

## 6. 확장 후보 — 세 번째 이후 멘토 (아이디어 단계, 미정)

§4.1의 공통 계약이 성립하면 새 lane마다 멘토를 추가하는 비용이 낮아진다. 순수 브레인스토밍이며 운영자 확인 전에는 후보일 뿐이다.

| 후보 lane | 참고 구루(예시) | 근거 원장 |
|---|---|---|
| 창업/운영 판단 | Paul Graham, Ben Horowitz, Collins(브랜드 전략 모드에서 이미 일부 인용 중) | 프로젝트 원장 + 결정 로그(`dashboard/work/decisions`) |
| 개인 생산성/리듬 | Cal Newport, David Allen | Today/Task 원장 |

이 표는 "언젠가 고려할 수 있는 방향"이지 로드맵이 아니다. Phase 1B·1C 완료 전에는 착수하지 않는다.

## 7. 단계적 적용 순서 (제안 — 착수 시점은 미정)

실제 착수는 Phase 1B·1C 완료 후 운영자 승인을 받아야 한다(`docs/README.md` §3). 순서만 미리 정리한다.

| Phase | 범위 | 비고 |
|---|---|---|
| **P1 — 간극만 수리** | §5.2 Council Chat 딥링크 배선 | 새 기능 아님, Guru 패턴을 Council에 복사하는 정도라 리스크 최소 |
| **P2 — 정책 통일** | §5.1 work_order 정책 확정 후 양쪽에 동일 적용 | 운영자가 A/B/C 중 선택 후 착수 |
| **P3 — 이름 정리** | §5.3 선택안 적용 | 사이드바·카피 영향 있으므로 DESIGN.md §8.1 인터랙션 계약 재확인 필요 |
| **P4 — 팀 로스터 실채팅화** | `team-operating-layer.md` Phase 3(5-페르소나를 registry.json 실데이터로 배선) 완료 후 재판단 | 이게 끝나야 §5.3 옵션 C의 전제가 성립 |
| **P5 — 신규 멘토 검토** | §6 후보 중 운영자가 원하는 것만 | 가장 마지막, 가장 불확실 |

## 8. 운영자 확인 필요 목록

- [ ] §5.1 work_order 자동 생성 정책 — A/B/C 중 선택
- [ ] §5.3 "Council" 이름 재정의 — A/B/C 중 선택 (또는 보류)
- [ ] §6 확장 멘토 lane 후보 — 관심 있는 lane이 있는지
- [ ] 이 문서를 Phase 1B·1C 완료 후 다시 꺼낼지, §5.2(버그성 배선 수리)만 먼저 처리할지

---

이 문서는 기존 세 문서(`sales-guru-mentor-agent-plan.md`, `agent-tab-mvp-ui-spec.md`, 지식 베이스 3종)의 내용을 재복제하지 않는다. 세부 프레임워크·프롬프트 설계는 원문을 참조한다.
