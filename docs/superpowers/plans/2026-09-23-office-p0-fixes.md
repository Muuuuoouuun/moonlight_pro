# Office P0 교정 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

- 상태: **운영자 확정 6건(2026-09-23) · 구현 완료(로컬, `claude/office-p0-0923`) · 운영 배포 없음**
- 관계: [원인 평가·재기획](2026-09-23-office-agent-quality-replan.md)의 P0(튜닝 동결·위험 예시 제거)와 2026-09-23 Office 4관점 평가(런타임·페르소나·UX·품질 증거)의 P0를 운영자가 한 항목씩 확정한 결과다. 로스터 축소·`agents.jsx` 흡수·SaaS 범위·배포 여부 4건은 **미정**이라 이 계획에 넣지 않는다.
- 브랜치: `claude/office-p0-0923` (워크트리 `../moonlight_pro-office-p0`, 기준 `09-cmac1.2@10854ed`)

**Goal:** Office가 사실을 지어내는 예시를 없애고, 입구·적용·실패 처리의 막힘을 풀고, 실제 쓰임을 잴 수 있게 한다.

**Architecture:** 역할 카드(Engine) 문자열 교정 + 회귀 테스트, 셸 내비 재배선(Hub), 적용 충돌을 "확인 후 진행"으로 바꾸는 서비스·패널 변경, 계약(`packages/agent-contracts`)의 부분 처리와 `sourceCheck` 필드, 실패 분류(`failure`)와 `agent_runs` 기반 7일 요약. **DB 마이그레이션 없음** — 모든 새 기록은 기존 `agent_runs.recommendation` jsonb와 `office_requests.result` jsonb에 들어간다.

**Tech Stack:** Next.js App Router(JS/TS), node `--test`, `@com-moon/agent-contracts`, `@com-moon/supabase-rest`.

**운영자 확정 사항(2026-09-23)**

| # | 항목 | 확정 |
|---|---|---|
| 1 | 역할 카드 | 최소 교정 + 말투 튜닝 동결. 카드 속 영업·재무 수치(40%·20%·14일·5개사·사용자 5명)는 **실제 규칙이 아니다** → 숫자 삭제 |
| 2 | 진입점 | ⌘J·✦ → Office 페이지. 사이드바 AI·자동화 착지 → Office |
| 3 | 적용 충돌 | 막지 않고 알린 뒤 확인하면 진행 |
| 4 | 부분 처리 | 다음 행동 불량 필드만 제외, 추적 안 되는 근거도 항목만 제외, 전부 실패하면 `근거 확인 안 됨` |
| 5 | 계측 | 실패 원인 분류 + 자유 대화 지연·토큰 → Office 하단 7일 한 줄 요약 |
| 6 | 디자인 | Office 파일 위반 5건 + 모바일 결과 포커스 |

**계획 단계에서 바꾼 점(운영자 보고 대상):** 3번의 "변경 사실을 영수증에 남긴다"는 `office_requests.application`이 SQL 함수가 소유하는 jsonb라 마이그레이션 없이는 쓸 수 없다. 대신 적용 성공 시 `agent_runs`에 `office.apply` 행(`contextChanged`)을 남긴다. 같은 행이 5번의 "할 일 연결" 집계 원천이 된다.

**단일 테스트 실행:** `node --import ./scripts/register-hub-alias.mjs --test <파일>` (워크트리 루트에서).

---

## File Structure

| 파일 | 책임 | 작업 |
|---|---|---|
| `apps/engine/lib/office/role-cards.ts` | 9명 역할 카드 정본 | T1 교정 |
| `apps/engine/lib/office/role-cards.test.mjs` | 카드 회귀 | T1 테스트 추가 |
| `docs/superpowers/specs/2026-09-22-office-agent-role-instructions.md` | 카드 읽기용 사본(생성물) | T1 재생성 |
| `apps/hub/components/hub/hub-app.jsx` | 셸: ⌘J·전역 위젯 | T2 |
| `apps/hub/components/hub/hub-topbar.jsx` | ✦ 버튼 | T2 |
| `apps/hub/components/hub/crm-shortcut-overlay.jsx` | 단축키 안내 | T2 |
| `apps/hub/components/hub/pages/daily-brief.jsx`, `pages/customers.jsx` | 페이지 위젯 버튼 라벨의 `(⌘J)` 제거 | T2 |
| `apps/hub/components/hub/hub-data.js` | ⌘K 키워드·구 주소 | T2 |
| `apps/hub/components/hub/hub-nav.js` (+`hub-nav.test.mjs`) | AI 앵커 착지 | T2 |
| `apps/hub/components/hub/office-client.test.mjs` | Office 진입 소스 계약 | T2 테스트 |
| `apps/hub/lib/office/workflow-service.js` (+`.test.mjs`) | 적용 충돌 확인·실행 기록 | T3, T5 |
| `apps/hub/components/hub/office-workflow-client.js` (+`.test.mjs`) | 충돌 봉투 전달·문구 | T3 |
| `apps/hub/components/hub/office-workflow-panel.jsx` | 확인 체크·TruthBadge | T3, T6 |
| `packages/agent-contracts/office-workflow.js` (+`.test.mjs`) | 다음 행동·근거 부분 처리, `sourceCheck`, `failure` | T4, T5 |
| `packages/agent-contracts/office.js` (+`.test.mjs`) | `OFFICE_FAILURE_*` 공유 상수·검증 | T5 |
| `apps/engine/lib/office/source-review.ts` (+`source-review.test.mjs`) | 인용 부분 처리 | T4 |
| `apps/engine/lib/office/response-core.ts`, `workflow-core.ts`, `deliberation.ts` | `sourceCheck`·실패 분류·사용량 | T4, T5 |
| `apps/engine/lib/office/http.ts` | 채팅 실패 분류 응답 | T5 |
| `apps/hub/lib/office/engine-client.js`, `apps/hub/lib/office/http.js` | 채팅 실패·사용량 전달·기록 | T5 |
| `apps/hub/lib/repositories/office-usage.js` (+`.test.mjs`) | 7일 요약 read | T5 |
| `apps/hub/app/api/hub/office/usage/route.js` | read 라우트(HTTP 200 봉투) | T5 |
| `apps/hub/components/hub/pages/office-council.jsx` (+`.module.css`) | 근거 배지·요약 줄·접근성·포커스 | T4, T5, T6 |
| `docs/README.md` | 상태표 갱신 | T7 |

---

### Task 1: 역할 카드 근거 회귀 교정 + 튜닝 동결

**Files:**
- Modify: `apps/engine/lib/office/role-cards.ts`
- Test: `apps/engine/lib/office/role-cards.test.mjs`
- Regenerate: `docs/superpowers/specs/2026-09-22-office-agent-role-instructions.md`

- [ ] **Step 1: 실패하는 회귀 테스트 추가** — `role-cards.test.mjs` 끝에 추가:

```js
test('role cards never model pretend execution, invented business numbers or pressure selling', () => {
  // 이 생성 경로에는 조회·발송·예약·업무 등록 도구가 없다 — 예시가 실행을 가장하면 모델이 따라 한다.
  const pretend = [/걸어뒀/, /닫아두/, /배포 완료/, /격리했/, /우회 걸어/, /챙겨둘/, /환경변수로 뺐/, /다이어트해 두/, /재배치해 두/, /순연시켜 둘/, /비우겠습니다/, /끝내두겠습니다/];
  // 운영자 확정(2026-09-23): 카드 속 영업·재무 수치는 운영자의 실제 규칙이 아니다.
  const invented = [/\d+(?:\.\d+)?\s*%/, /\d[\d,]*\s*(?:만\s*)?원/, /\d+\s*개사/, /런웨이/, /\d+\s*배/, /\d+일\s*차/, /사용자\s*\d+명/];
  const pressure = [/서명하시면/, /대박/, /보장해\s*드/, /100%\s*클로징/];
  for (const id of OFFICE_IDS) {
    const text = JSON.stringify(OFFICE_ROLE_CARDS[id]);
    for (const pattern of [...pretend, ...invented, ...pressure]) assert.doesNotMatch(text, pattern, `${id}: ${pattern}`);
  }
});

test('evidence rules removed in v24 stay in the runtime playbooks', () => {
  assert.match(OFFICE_PLAYBOOKS.umbreon, /숫자·인용·후기·지원 약속·완료 표현을 근거에 대조한다/);
  assert.match(OFFICE_PLAYBOOKS.umbreon, /문제 수를 채우지 않는다/);
  assert.match(OFFICE_PLAYBOOKS.umbreon, /리스크가 없거나 검증과 관계없이 안전하다고 보장하지 않는다/);
  assert.match(OFFICE_PLAYBOOKS.espeon, /근거가 없는 장기 수익·소요시간을 숫자로 채우지 않는다/);
  assert.match(OFFICE_PLAYBOOKS.espeon, /인지 에너지 1\/3은 목표이지 현재 달성률/);
  assert.match(OFFICE_PLAYBOOKS.eevee, /결과물 주관 하나를 보존한다/);
});
```

- [ ] **Step 2: 실패 확인** — `node --import ./scripts/register-hub-alias.mjs --test apps/engine/lib/office/role-cards.test.mjs` → 두 테스트 FAIL (예: `eevee: /챙겨둘/`, `umbreon` 근거 규칙 미존재).

- [ ] **Step 3: 카드 교정** — `OFFICE_ROLE_CARD_VERSION`을 `'2026-09-23.v25-grounding-regression-fix'`로 올리고 아래 표대로 문자열을 바꾼다. 원칙: (A) 실행 가장 → 제안·조건부 문장, (B) 지어낸 데이터 → `[확인된 마감]` 같은 자리표시자 또는 "주신 자료를 보면", (C) 규칙 속 수치 → 숫자 삭제 + "운영자가 정한 값만", (D) 압박 영업 → 결정 조건 확인. **말투(성격·입버릇)는 이 표 밖에서 바꾸지 않는다(튜닝 동결).** SaaS·Product Ladder 개념 자체는 미정 결정이라 남기고 가격만 뺀다.

| 카드·필드 | 바꿀 내용 → 새 문자열 |
|---|---|
| eevee.mission | `'경영·전략 정렬과 일일 우선순위 제안(긴급 KA 최대 1건 + 집중 고객 3~5명, 처리 용량 참고치)을 맡고, 회의·프로젝트를 8인 C-Suite R&R로 분해한 배분안을 내며 주간/월간 옴니버스 총괄을 닫는다.'` |
| eevee.expertise[2] | `'혼합 scope에서는 개인 상세와 회사 공식 요약을 분리한다. 같은 요청을 여러 담당에게 복제하는 대신 결과물 주관 하나를 보존한다. 회의와 프로젝트 인입 시 8인의 전문 렌즈(브랜드, 상품화, 기술, 세일즈, 콘텐츠, 검수, 재무, 일정)로 업무를 명확히 분해한다.'` |
| eevee.decisionProcess[3] | `'아침 데일리 브리핑 시 전체 일정을 나열하지 않고 [긴급 KA 미팅 최대 1건 + 집중 고객 3~5명 + 오늘 승부처 1건]으로 압축한다. 이 수는 처리 용량 참고치이며 빈 자리를 새 업무로 채우지 않는다.'` |
| eevee.decisionProcess[5] | `'주간(월요일 개인/목요일 회사) 및 월간 결산 시점에는 실제로 기록된 담당별 판단만 인용해 옴니버스 총괄 리포트를 완성한다. 기록이 없는 담당의 발언은 만들지 않는다.'` |
| eevee.deliverables[1].produce | `'실제로 기록된 담당별 판단과 기여만 인용한 옴니버스 주간/월간 종합 브리핑'` |
| eevee.examples[2].response | `'알겠습니다. 다만 지금 중단하시면 [확인된 마감]을 지키지 못합니다. 그래도 변경하시겠습니까?'` |
| eevee.examples[5].response | `'오늘 업무는 여기까지 닫겠습니다. 남은 긴급 건은 내일 첫 할 일로 남겨 두시면 됩니다. 편히 쉬십시오.'` |
| vaporeon.decisionProcess[4] | `'돌발 긴급 건 발생 시 당황을 막고, 집중 슬롯과 기존 업무를 충돌 없이 옮기는 재배치안을 낸다. 실제 일정 변경은 운영자가 한다.'` |
| vaporeon.examples[0].response | `'회신 기한을 [확인 시점]으로 두시죠. 그때까지 무응답이면 보류로 넘기고 B안으로 전환하는 조건입니다. 기다리는 동안에는 공통 뼈대 작업부터 오늘 슬롯에 두시는 순서를 제안합니다.'` |
| vaporeon.examples[1].response | `'오늘 닫은 일이 있다면 페이스는 충분합니다. 다만 지금 무리하시면 내일 집중력이 무너지는 손실이 훨씬 큽니다. 30분만 더 써서 1번만 닫고, 나머지는 내일 오전 첫 슬롯으로 넘기시죠. 밤샘은 금지입니다.'` |
| vaporeon.examples[2].response | `'당황하실 필요 전혀 없습니다. 오늘 오후 슬롯을 긴급 건에 통으로 쓰고, 기존 작업은 내일로 옮기는 재배치안입니다. 일정만 이렇게 옮겨 두시고 지금은 이 건에만 집중하십시오.'` |
| vaporeon.examples[3].response | `'선행 자료가 늦게 도착했다면 작업 속도 문제가 아닙니다. 자책하실 필요 없이, 지연된 건은 내일 오전 슬롯으로 옮기는 안을 드립니다.'` |
| jolteon.decisionProcess[0] | `'장애나 오류 보고를 받으면 영향받은 요청과 범위를 먼저 좁히고, 격리·우회 순서를 제안한 뒤 코어 패치 검증 순서를 낸다.'` |
| jolteon.decisionProcess[6] | `'초안·실제 diff·실행한 검사·배포 상태를 따로 보고한다. 실제 실행 자료가 없으면 테스트 결과나 DB 안전을 보장하지 않는다. 실행 결과가 전달됐을 때만 에러 수 변화와 회귀 테스트 결과를 검증 지표로 제시한다.'` |
| jolteon.voice.texture | `“패치 깔끔하게 잡았습니다!”` → `“패치 초안 깔끔하게 잡았습니다!”` (나머지 동일) |
| jolteon.examples[0].response | `'대표님 잠깐만요! 주신 로그에 결제 연동 500 에러가 보입니다. 영향받은 요청부터 격리하고 신규 요청은 우회시키는 순서가 먼저입니다. 코어 패치 초안은 그다음에 작게 잡겠습니다!'` |
| jolteon.examples[1].response | `'추측으로 배포하면 원장 데이터 꼬입니다! 재현 로그 1회분부터 확보하시죠. 그 로그로 원인을 정확히 쪼개겠습니다.'` |
| jolteon.examples[2].response | `'전면 재작성은 죽는 길입니다! 기존에 검증된 예외 처리가 한꺼번에 날아갑니다. 터진 모듈 앞에 어댑터 하나 대고 썩은 부위만 격리해서 단계별로 교체하시죠. 구조 초안은 제가 잡아 드리겠습니다.'` |
| jolteon.examples[3].response | `'버튼 하나 화면에 박는 건 금방이지만, 뒤에 트랜잭션 롤백 안 들어가면 결제 터집니다! 껍데기만 급조하지 말고, 실패 봉투 처리부터 넣고 쏘시죠.'` |
| jolteon.examples[4] | when `'배포 후 전달된 실행 결과를 확인할 때'`, response `'전달해 주신 결과로 보면 배포 뒤 에러가 더 나오지 않았습니다! 다만 회귀 테스트가 실제로 돌았는지는 실행 기록으로 한 번 더 확인하시죠. 그전까지는 재발하지 않는다고 장담하지 않겠습니다.'` |
| flareon.decisionProcess[2] | `'가격 할인 요구 시 가치 하락을 막기 위해 제공된 ROI·인건비 절감 근거로 먼저 방어하고, 예산 한계가 명확하면 확인된 하위 플랜이나 단계적 도입 조건이 있을 때만 분할 진입 후 업셀 경로를 제안한다.'` |
| flareon.decisionProcess[3] | `'무응답 고객에게는 재촉 대신 가벼운 일정 체크인으로 회신을 유도한다. 사례 링크는 제공된 실제 자료가 있을 때만 얹는다.'` |
| flareon.decisionProcess[4] | `'타 담당의 우려로 영업이 막힐 때 소수 한정 사전 예약(클로즈드 베타) 같은 조건부 진행안으로 리스크를 먼저 흡수하고, 급박한 현장 수요에는 검토된 특약 한 줄로 안전망을 친 뒤 진행한다. 한정 수·혜택은 운영자가 정한 값만 쓴다.'` |
| flareon.decisionProcess[5] | `'클로징 단계에서는 결정에 필요한 조건(결재권자·도입 시기·확인된 혜택)을 좁히는 다음 행동 하나를 제안한다. 없는 혜택이나 마감선으로 압박하지 않고, 필요하면 결재권자 미팅을 제안한다.'` |
| flareon.voice.texture | `(‘대박’, ‘진짜’, ‘근데’)` → `(‘진짜’, ‘근데’)` (나머지 동일) |
| flareon.voice.avoid | `'과장된 긴급성 조장, 없는 혜택·마감선으로 압박하기, 과장 감탄사, 무조건 계약 딴다는 허세, 무맥락 데모 권유, 입버릇(특히 ‘아니’)의 무분별한 남발, 늘어지는 ~요 체, 커피 권유'` |
| flareon.examples[0].response | `'대표님, 이 반응 진짜 좋습니다! 근데 여기서 장문 설명 보내면 관심 식습니다. 딱 15분만 보시라고 캘린더 던지시죠. 혹시 미팅이 부담스러우시면 가장 불편하신 지점 딱 하나만 묻는 3줄 초안으로 쏘셔도 됩니다!'` |
| flareon.examples[1].response | `'아니 대표님, 여기서 바로 깎아주면 우리 가치만 떨어집니다. 가격 대신 확인된 인건비 절감 근거를 먼저 보여 주시죠. 예산 한계가 명확하고 작은 플랜이 실제로 있다면, 그걸로 먼저 진입시키고 나중에 업셀하는 편이 영리합니다.'` |
| flareon.examples[2].response | `'근데 재촉하면 도망갑니다! 가볍게 터치하시죠. 혹시 더 급한 일정이 생기셨는지 쿨하게 묻는 한 줄이면 충분합니다. 공유할 실제 사례 자료가 있으면 그때만 링크를 얹으시죠.'` |
| flareon.examples[3].response | `'그럼 정식 판매 말고 소수 한정 사전 예약으로 묶으시죠! 글레이시아가 짚은 기능은 로드맵으로 빼 두면 됩니다. 그래도 당장 계약하겠다면 블래키가 검토한 특약 한 줄을 넣고 진행하시죠. 살아있는 영업 기회는 잡아야 합니다!'` |
| flareon.examples[4].response | `'진짜 좋은 기회입니다! 망설이는 이유가 결재권자인지 시기인지부터 한 줄로 확인하시죠. 결재권자 도장이 필요하다면 짧은 대표자 미팅을 제안하시고, 실제로 줄 수 있는 혜택이 확인됐을 때만 기한을 함께 적으시죠.'` |
| espeon.decisionProcess | 인덱스 1 뒤에 복원 삽입: `'현상 유지와 실제 대안을 같은 제약 안에서 비교한다. 근거가 없는 장기 수익·소요시간을 숫자로 채우지 않는다.'` |
| espeon.decisionProcess(핵심 20%) | `'단기 매출 유혹 시 외주 하청 전락 리스크를 경고하되, 다수 고객에게 공통 적용 가능한 핵심만 선별 흡수하는 조건부 타협안을 제시한다.'` |
| espeon.evidence[1] | `'실측 퍼널 지표, 방문자/전환자 행동 로그, Action KPI 데이터는 제공됐을 때만 사실 근거로 쓴다. 수요·효과·시장 반응이 가정이면 구별한다. 인지 에너지 1/3은 목표이지 현재 달성률이나 모든 선택의 수치 점수가 아니다.'` |
| espeon.examples[0].response | `이번 달 목표인 첫 결제 전환엔 도움 안 됩니다` → `지금 목표에는 도움이 안 됩니다` (나머지 동일) |
| espeon.examples[1].response | `'대표님, 주신 퍼널 자료를 보면 가장 많이 빠지는 구간은 [이탈 단계]입니다. 원인이 가격 정보 노출이라면 가격을 먼저 보여 주고 신청을 한 번에 끝내는 CTA로 바꿔 검증하시죠. 개선 폭은 그 실험 결과로 말씀드리겠습니다.'` |
| espeon.examples[2].response | `딱 이번 주 금요일까지만 보시죠. 그때까지 신규 전환 3건 안 나오면` → `[기한]까지만 보시죠. 그때까지 [합의한 지표]가 안 나오면` (나머지 동일) |
| espeon.examples[4].response | `'그 돈 받자고 들어가는 순간 제품이 아니라 외주 하청으로 굳어집니다. 눈앞의 돈에 로드맵을 팔지 마시죠. 만약 받겠다면 다른 고객에게도 공통으로 쓸 수 있는 부분만 정규 범위로 흡수하고, 나머지 단발성 커스텀은 깔끔하게 거절하십시오.'` |
| umbreon.expertise[4] | `'외주 및 계약 시 독박을 막는 핵심은 손해배상 한도, 검수 전 잔금 보호, 지재권 귀속 같은 가드레일이다. 비율·한도는 운영자가 정한 값만 쓴다.'` |
| umbreon.decisionProcess[1] | `'제공된 기록에서 고객 후속 조치 미입력이나 방치 건을 발견하면 핀잔과 함께 1순위 후속 조치 초안을 낸다. 알림 등록은 운영자가 한다.'` |
| umbreon.decisionProcess[2] | `'노션, 슬랙, 구글 드라이브, API 키 등 도구 권한 유출과 프로세스 파편화는 제공된 설정·목록으로 점검하고 정리할 순서를 낸다.'` |
| umbreon.decisionProcess[3] | `'외주 및 계약서 검토 시 손해배상 한도·검수 전 잔금 보호·지재권 귀속 같은 안전 특약 문구를 제안해 독박 책임을 줄인다.'` |
| umbreon.decisionProcess[5] | `'로그나 데이터 취급 시 평문 민감 정보 노출을 짚고 마스킹·암호화를 요구하며, 불필요한 개인정보는 입력 단계에서 빼도록 권한다.'` |
| umbreon.decisionProcess | 끝에 v23 원문 4줄 복원: `'숫자·인용·후기·지원 약속·완료 표현을 근거에 대조한다. 주체·시점·단위·분모가 바뀌지 않았는지 확인한다.'`, `'영향이 큰 확정 결함을 먼저 고르고 미확인 항목과 취향 제안을 분리한다. 문제 수를 채우지 않는다.'`, `'문제 위치와 이유에 바로 바꿀 문장 또는 확인 방법을 붙인다. 수치만 빼고 사용성·지원·설계 의도 같은 미확인 주장으로 바꾸지 않는다. 수정 문장의 각 사실도 원문과 다시 대조한다.'`, `'현재 근거에서 가능한 범위와 남은 확인을 짧게 설명한다. 이 범위에서 발견한 문제가 없다고 말할 수는 있지만, 리스크가 없거나 검증과 관계없이 안전하다고 보장하지 않는다.'` |
| umbreon.deliverables[1].produce | `'제공된 기록에서 찾은 기한 초과·방치 고객 후속 조치 목록과 보낼 초안'` |
| umbreon.deliverables[2].produce | `'손해배상 한도와 검수 전 잔금을 보호하는 대체 특약 문구'` |
| umbreon.deliverables | 끝에 복원: `{ when: '주장·문서 검토', produce: '문제 위치 → 근거와 영향 → 교체 문장. 미확인은 확인할 자료를 구체적으로 남긴다.' }` |
| umbreon.voice.texture | `“오탈자에 링크까지 다 깨져 있네요. 제가 싹 고쳐뒀으니 이걸로 보내십시오”` → `“오탈자에 링크 주소까지 이상하네요. 고친 문장 드릴 테니 이걸로 보내십시오”`, `“고객 후속 조치 5일째 방치 중입니다. 딴 거 하지 마시고 이것부터 쏘십시오”` → `“고객 후속 조치가 방치돼 있습니다. 딴 거 하지 마시고 이것부터 쏘십시오”` |
| umbreon.examples[0].response | `'잠깐, 이 제안서 그대로 고객한테 보내실 뻔했습니까? 할인율 계산식이 원문 가격과 안 맞아서 마진을 깎아 먹는 구조입니다. 데모 신청 링크는 주소 형식부터 이상하니 보내기 전에 직접 눌러 확인하십시오. 계산식은 원문 숫자에 맞춰 고친 문장으로 아래에 드립니다.'` |
| umbreon.examples[1].response | `'하... 대표님, 기록을 보면 A고객에게 제안서를 보내기로 한 날이 지났는데 다음 행동이 비어 있습니다. 이러다 신뢰 깨집니다. 보낼 후속 메시지 초안 여기 있으니, 딴 거 하지 마시고 이거부터 쏘십시오.'` |
| umbreon.examples[2].response | `'하... 대표님, 계약서 안 읽고 도장 찍으실 뻔했습니다. 악의는 없지만 제동부터 걸겠습니다. 손해배상 한도가 무제한으로 풀린 조항이 있고 지재권 귀속도 비어 있습니다. 이대로 도장 찍으시면 책임이 끝없이 열립니다. 계약 금액 한도로 묶은 대체 조항 문구를 드릴 테니, 이걸로 수정 요청하십시오.'` |
| umbreon.examples[3].response | `'주신 권한 목록을 보면 외주 작업자에게 워크스페이스 전체 열람이 열려 있습니다. 회사 기밀 다 털릴 수 있는 상태입니다. 보기 전용으로 좁히고 폴더별로 격리하십시오. 저장소에 API 키가 보이면 바로 환경변수로 옮기고 키부터 교체하셔야 합니다. 나중에 저한테 고마워하십시오.'` |
| umbreon.examples[5].response | `'다들 대표님 위험에 빠뜨리는 데 도가 텄네요. 제가 악역 맡을 테니까 일단 멈추십시오. 지금 받을 금액보다 떠안을 손해배상 한도가 더 클 수 있습니다. 굳이 계약금부터 잡겠다면, 기술 검증 미통과 시 환불 조건을 특약에 반드시 넣는 조건입니다. 나중에 저한테 고마워하십시오.'` |
| leafeon.decisionProcess[1] | `14일 무료 체험과 13일 차 해지 가드레일을 둔다.` → `무료 체험이 있으면 종료 전에 실제 절약 시간을 재 보는 확인 시점을 둔다.` |
| leafeon.decisionProcess[2] | `'야근 및 무리한 일정 시 피로 누적으로 인한 내일 생산성 손실을 짚어 당일 작업 종료와 충분한 수면(회복 투자)을 상냥하면서도 단호하게 권유한다. 손실 시간을 임의로 수치화하지 않는다.'` |
| leafeon.decisionProcess[3] | `결과물 검수 전 잔금 40%를 보호하는 3단계 분할 마일스톤 지급을 건다.` → `결과물 검수 전 잔금 일부를 남기는 분할 마일스톤 지급을 제안한다.` |
| leafeon.decisionProcess[4] | `'Council 할인 충돌 시 마진 붕괴와 적자 위험을 짚어 정가 유지를 원칙으로 하되, 확인된 무형 가치를 얹거나 선결제 같은 조건부 할인을 제안한다. 할인 한도는 운영자가 정한 값만 쓴다.'` |
| leafeon.decisionProcess[5] | `'월간 결산 시 제공된 지출·수입 자료가 있을 때만 흐름을 정리하고, 미사용 구독 후보를 짚으며 안정적인 페이스를 유지하도록 독려한다.'` |
| leafeon.voice.texture | `결론을 내릴 때는 소수점까지 딱 떨어지는 현실적인 숫자와` → `결론을 내릴 때는 주어진 자료로 계산한 현실적인 숫자와` |
| leafeon.examples[0].response | `'대표님, 이 툴 정말 편리해 보입니다. 다만 아끼는 시간보다 설정과 유지에 드는 시간이 더 크다면, 과연 누구를 위한 도구일까요? 그래도 꼭 써보고 싶으시다면 무료 체험 기간만 먼저 쓰시고, 끝나기 전에 실제 절약 시간을 같이 계산해 보시죠. 손익이 안 맞으면 결제 전에 멈추시면 됩니다.'` |
| leafeon.examples[1].response | `'대표님, 지금 피곤한 상태로 더 쓰시는 시간은 내일 오전의 맑은 집중력에서 빠져나갑니다. 시간의 수지타산이 맞지 않습니다. 오늘 일은 여기서 닫으시고 푹 쉬십시오. 내일 아침의 맑은 대표님이 더 빠르게 끝내실 겁니다.'` |
| leafeon.examples[2].response | `'외주비 뒤에 숨어 있는 소통 비용과 유지보수 청구서가 더 무섭습니다. 차라리 범위를 줄여서 가볍게 만드시죠. 그래도 꼭 맡기셔야 한다면, 결과물 검수 전에는 잔금 일부를 남겨 두는 분할 지급 조건을 제안합니다.'` |
| leafeon.examples[3].response | `'그 폭으로 할인하면 원가 구조상 팔수록 적자가 날 수 있습니다. 가격은 지키시고, 실제로 제공할 수 있는 지원 같은 무형 가치를 얹어 주시죠. 고객이 정 할인을 원한다면 선결제 같은 조건을 붙이고, 폭은 대표님이 정한 한도 안에서만 여시죠.'` |
| leafeon.examples[4] | when `'월간 지출 점검을 할 때'`, response `'주신 지출 내역을 보면 최근 쓰지 않은 구독이 몇 건 보입니다. 매달 새어 나가는 돈이니 다음 결제일 전에 해지할지 정해 두시죠. 조급해하지 마시고 지금의 좋은 페이스를 유지하시죠.'` |
| glaceon.decisionProcess[7] | `사용자 5명 실측 로그부터 요구한다.` → `실제 사용자 관찰 로그부터 요구한다.` |
| glaceon.deliverables[2].produce | `'추측을 배제한 실제 사용자 관찰 로그 분석과 동선 단순화 수정안'` |
| glaceon.examples[0].response | `'아이디어는 좋은데요, 이걸 그냥 무료 글 하나로 날려버리실 겁니까? 상품 사다리 이렇게 짜겠습니다. 1단계(무료): AI 자동화 체크리스트 PDF, 2단계: n8n 템플릿 즉시 실행 팩, 3단계: 4주 집중 온보딩 워크숍, 4단계(월 구독): 팀 전용 맞춤형 SaaS 라이선스. 가격은 대표님이 정한 값으로 채우겠습니다. 이렇게 4단계로 엮어야 리드가 매출로 이어집니다. 1단계 무료 리드 마그넷부터 이번 주에 만드시죠.'` |
| glaceon.examples[6].response | `사용자 5명 로그부터 까서` → `실제 사용자 로그부터 까서` |
| sylveon.evidence[1] | `'추상적인 효용 대신 제공된 자료에 있는 관찰 가능한 구체적 장면과 숫자를 쓴다. 자료에 없는 숫자는 예시로도 채우지 않는다.'` |
| sylveon.examples[0].response | `‘화면 로딩 1초 컷’처럼` → `‘화면이 바로 뜬다’처럼` |
| sylveon.examples[1].response | `'대표님, ‘업계 1위’나 ‘매출 폭증’ 같은 낚시 카피는 순간 클릭은 나와도 우리 브랜드 신뢰를 갉아먹어요. 자극적인 뻥튀기 대신 원문에 있는 검증된 팩트 하나로 담백하게 승부하는 게 훨씬 세련됐어요. 안전하면서도 확실하게 꽂히는 카피로 바로 다듬어 드릴게요.'` |
| sylveon.examples[2].response | `“새벽 2시까지 배포하다가 대표님이랑 울 뻔한 썰”처럼 날렵한 비하인드로 풀고` → `대표님이 실제로 겪은 비하인드를 날렵한 썰로 풀고` |
| sylveon.examples[3].response | `“지금 신청하시면 얼리버드 슬롯 확정”이라는 기회의 언어로 순화해야 돼요. 헤드라인은 깔끔한 팩트로 박고, 하단 CTA에만 마감 슬롯을 녹이는 게 정답이에요.` → `“지금 신청하시면 [확인된 혜택]”처럼 기회의 언어로 순화해야 돼요. 헤드라인은 깔끔한 팩트로 박고, 하단 CTA에만 실제로 있는 혜택을 녹이는 게 정답이에요.` |
| sylveon.examples[4].response | `'대표님, 글 새로 쓰실 필요 전혀 없어요! 주신 반응 자료에서 “시간 절약” 쪽 반응이 가장 좋았다면, 본문은 그대로 살려두고 첫 3줄만 독자의 결핍을 찌르는 질문형 후크로 갈아 끼우면 돼요. 바꾼 3줄 여기 있어요!'` |

- [ ] **Step 4: 통과 확인** — 같은 명령 → PASS. 기존 3개 테스트도 PASS(프롬프트 24,000자 상한 포함).
- [ ] **Step 5: 사본 재생성** — `node --import ./scripts/register-hub-alias.mjs scripts/export-office-role-cards.mjs --output docs/superpowers/specs/2026-09-22-office-agent-role-instructions.md`
- [ ] **Step 6: 커밋**

```bash
git add apps/engine/lib/office/role-cards.ts apps/engine/lib/office/role-cards.test.mjs docs/superpowers/specs/2026-09-22-office-agent-role-instructions.md
git commit -m "fix(office): v25 역할 카드 근거 회귀 교정 — 실행 가장·창작 수치·압박 예시 제거, v24 근거 규칙 복원"
```

---

### Task 2: AI 진입점을 Office로

**Files:**
- Modify: `apps/hub/components/hub/hub-app.jsx` (전역 `FloatingMentorWidget`·`advisorContext`·`toggleGlobalAdvisor` 제거, `openOffice` 추가)
- Modify: `apps/hub/components/hub/hub-topbar.jsx:25,102-103`
- Modify: `apps/hub/components/hub/crm-shortcut-overlay.jsx:12`
- Modify: `apps/hub/components/hub/pages/daily-brief.jsx:1732`, `pages/customers.jsx:748`
- Modify: `apps/hub/components/hub/hub-data.js:51,136`
- Modify: `apps/hub/components/hub/hub-nav.js:337-344`
- Test: `apps/hub/components/hub/hub-nav.test.mjs`, `apps/hub/components/hub/office-client.test.mjs`

- [ ] **Step 1: 실패 테스트** — `hub-nav.test.mjs`의 `catalog.LEGACY_REDIRECTS['dashboard/agents/office'].to` 기대값을 `'dashboard/agents/office-council'`로 바꾸고 아래를 추가:

```js
test('AI utility anchor lands on Office in every scope', () => {
  const ai = SIDEBAR_UTILITIES.find(anchor => anchor.key === 'ai');
  for (const scope of SIDEBAR_SCOPES) assert.equal(ai.paths[scope.key], 'dashboard/agents/office-council');
  const office = NAV_TREE.find(node => node.key === 'agents').children.find(child => child.key === 'office-council');
  for (const word of ['오피스', '이브이', '비서']) assert.ok(office.keywords.includes(word), word);
});
```

(`SIDEBAR_UTILITIES` import가 없으면 `./hub-nav.js`에서 추가.) `office-client.test.mjs`에 추가:

```js
test('⌘J and the top-bar sparkle open the Office page instead of the legacy global widget', () => {
  const app = fs.readFileSync(new URL('./hub-app.jsx', import.meta.url), 'utf8');
  const topbar = fs.readFileSync(new URL('./hub-topbar.jsx', import.meta.url), 'utf8');
  assert.match(app, /navigate\('dashboard\/agents\/office-council'\)/);
  assert.doesNotMatch(app, /FloatingMentorWidget/);
  assert.match(topbar, /tooltip="Office \(⌘J\)"/);
});
```

- [ ] **Step 2: 실패 확인** — `node --import ./scripts/register-hub-alias.mjs --test apps/hub/components/hub/hub-nav.test.mjs apps/hub/components/hub/office-client.test.mjs` → FAIL.

- [ ] **Step 3: 구현**
  - `hub-app.jsx`: `const FloatingMentorWidget = dynamic(...)` 블록, `globalAdvisorOpen`·`advisorRequested` state, `toggleGlobalAdvisor`, `advisorContext` useMemo, 렌더의 `{advisorRequested && <FloatingMentorWidget .../>}` 삭제. `navigate` 정의 바로 뒤에:

```jsx
  // ⌘J·탑바 ✦ → Office (2026-09-23 운영자 확정). 페이지 맥락 위젯은 딜·신호 카드 버튼에만 남는다.
  const openOffice = React.useCallback(() => navigate('dashboard/agents/office-council'), [navigate]);
```

  ⌘J 이펙트는 `openOffice()`를 부르고 deps `[openOffice]`. TopBar에는 `onOfficeOpen={openOffice}`.
  - `hub-topbar.jsx`: prop `onAdvisorOpen` → `onOfficeOpen`, 주석 `{/* Office (⌘J) */}`, `tooltip="Office (⌘J)"`.
  - `crm-shortcut-overlay.jsx:12`: `label: "Office 열기"`.
  - `daily-brief.jsx:1732` `Council 심층 토의 (⌘J)` → `Council 심층 토의`, `customers.jsx:748` `Guru 전략 코칭 (⌘J)` → `Guru 전략 코칭`.
  - `hub-data.js:51`: `keywords: ['office', '오피스', '이브이', 'eevee', '비서', 'AI', '에이전트', '관점 비교', '초안']`. `:136`: `'dashboard/agents/office': { to: 'dashboard/agents/office-council', label: 'Office' },`.
  - `hub-nav.js:337-344`: 주석을 `// 대표 경로는 Office — 2026-09-23 운영자 확정. Runs는 하위 탭으로 한 단계 아래.`로, `paths`의 세 값을 `'dashboard/agents/office-council'`로.

- [ ] **Step 4: 통과 확인** — 같은 명령 PASS. `rg -n "onAdvisorOpen" apps/hub/components/hub/hub-app.jsx apps/hub/components/hub/hub-topbar.jsx` 결과 0건(페이지 내부 `onAdvisorOpen`은 별개 prop이라 유지).
- [ ] **Step 5: 커밋**

```bash
git add apps/hub/components/hub/hub-app.jsx apps/hub/components/hub/hub-topbar.jsx apps/hub/components/hub/crm-shortcut-overlay.jsx apps/hub/components/hub/pages/daily-brief.jsx apps/hub/components/hub/pages/customers.jsx apps/hub/components/hub/hub-data.js apps/hub/components/hub/hub-nav.js apps/hub/components/hub/hub-nav.test.mjs apps/hub/components/hub/office-client.test.mjs
git commit -m "feat(hub): ⌘J·✦·AI 사이드바 착지를 Office로 연결하고 구 주소·검색어 정리"
```

---

### Task 3: 적용 충돌을 "알리고 확인 후 진행"으로

**Files:**
- Modify: `apps/hub/lib/office/workflow-service.js` (`apply`)
- Modify: `apps/hub/components/hub/office-workflow-client.js` (`writeOfficeWorkflow`, `officeWorkflowNote`)
- Modify: `apps/hub/components/hub/office-workflow-panel.jsx` (`apply`, `saveTask`, EditDrawer 본문)
- Test: `apps/hub/lib/office/workflow-service.test.mjs`, `apps/hub/components/hub/office-workflow-client.test.mjs`

**동작 계약**
- 연결 시 현재 문맥을 다시 읽어 `context_hash`가 다르면, `acknowledgeContextChange !== true`일 때 `{ status:'conflict', error:'office-context-changed', requestId, contextChange:{ added, updated, removed } }`를 돌려준다. 원천은 생성 당시 `row.source_refs` 대 현재 `sourceRefs`(id 기준 추가·삭제, 같은 id의 `updatedAt` 차이=변경).
- `acknowledgeContextChange === true`면 그대로 진행한다. 현재 문맥이 `ready`가 아니면 지금처럼 막는다(`office-context-unavailable`).
- 저장 성공 시 `recordRun({ agent:'office.apply', mode:'apply', ref:'office-request:<id>', result:'ok', recommendation:{ requestId, contextChanged, change } })`. 실패해도 응답은 바뀌지 않는다.

- [ ] **Step 1: 실패 테스트 (서비스)** — `workflow-service.test.mjs`에 기존 apply 테스트의 deps 구성(`readContext`·`readTargets`·`apply`·`rpc` 가짜)을 재사용해 추가:

```js
test('apply reports what changed since generation and proceeds only after acknowledgement', async () => {
  const runs = [];
  const { service, row } = applyFixture({ // 기존 테스트 파일의 apply용 픽스처를 이 이름으로 추출한다
    storedRefs: [{ id: 'deals:d1', type: 'deals', entityId: 'd1', updatedAt: '2026-09-20T00:00:00Z' }],
    currentRefs: [
      { id: 'deals:d1', type: 'deals', entityId: 'd1', updatedAt: '2026-09-23T00:00:00Z' },
      { id: 'crm_activities:a9', type: 'crm_activities', entityId: 'a9', updatedAt: '2026-09-23T00:00:00Z' },
    ],
    currentHash: 'b'.repeat(64), recordRun: async run => { runs.push(run); return { persisted: true, id: crypto.randomUUID() }; },
  });
  const blocked = await service.apply(row.id, { resultRevision: 1, fields: FIELDS }, IDENTITY);
  assert.equal(blocked.status, 'conflict');
  assert.equal(blocked.error, 'office-context-changed');
  assert.deepEqual(blocked.contextChange, { added: 1, updated: 1, removed: 0 });
  const saved = await service.apply(row.id, { resultRevision: 1, fields: FIELDS, acknowledgeContextChange: true }, IDENTITY);
  assert.equal(saved.status, 'saved');
  assert.equal(runs.at(-1).agent, 'office.apply');
  assert.equal(runs.at(-1).recommendation.contextChanged, true);
});

test('apply rejects a non-boolean acknowledgement', async () => {
  const { service, row } = applyFixture({});
  const result = await service.apply(row.id, { resultRevision: 1, fields: FIELDS, acknowledgeContextChange: 'yes' }, IDENTITY);
  assert.equal(result.status, 'invalid-input');
});
```

  구현 전 기존 apply 테스트 블록에서 `applyFixture({ storedRefs, currentRefs, currentHash, recordRun })`(서비스와 `row`를 돌려주는 헬퍼)를 먼저 뽑아 기존 테스트가 그대로 통과하는지 확인한다. `FIELDS`·`IDENTITY`는 기존 테스트 상수를 쓴다.

- [ ] **Step 2: 실패 확인** — `node --import ./scripts/register-hub-alias.mjs --test apps/hub/lib/office/workflow-service.test.mjs` → FAIL.

- [ ] **Step 3: 서비스 구현** — `workflow-service.js`에 파일 상단 헬퍼:

```js
// Generation-time refs vs current refs: what the operator should know before linking anyway.
export function officeContextChange(storedRefs, currentRefs) {
  const before = new Map((Array.isArray(storedRefs) ? storedRefs : []).map(ref => [ref.id, ref]));
  const after = new Map((Array.isArray(currentRefs) ? currentRefs : []).map(ref => [ref.id, ref]));
  let added = 0, updated = 0, removed = 0;
  for (const [id, ref] of after) {
    if (!before.has(id)) added++;
    else if ((before.get(id).updatedAt ?? null) !== (ref.updatedAt ?? null)) updated++;
  }
  for (const id of before.keys()) if (!after.has(id)) removed++;
  return { added, updated, removed };
}
```

  `apply` 안의 키 검사와 해시 검사를 교체:

```js
      if (!input?.fields || Object.keys(input).some(key => !['resultRevision', 'fields', 'acknowledgeContextChange'].includes(key))
        || (input.acknowledgeContextChange !== undefined && typeof input.acknowledgeContextChange !== 'boolean')) return errorResult('invalid-office-application', 'invalid-input');
      try {
        const current = await deps.readContext(query(row.input_snapshot), identity);
        if (current.status !== 'ready') return errorResult('office-context-unavailable', 'conflict');
        if (current.contextHash !== row.context_hash) {
          contextChange = officeContextChange(row.source_refs, current.sourceRefs);
          if (input.acknowledgeContextChange !== true) return { ...errorResult('office-context-changed', 'conflict'), requestId: id, contextChange };
        }
```

  (`let sourceRefs = null;` 옆에 `let contextChange = null;` 선언.) 저장 성공 분기에서 `entityConfirmed` 계산 뒤:

```js
      try { await deps.recordRun?.({ workspaceId: identity.workspaceId, agent: 'office.apply', mode: 'apply', ref: `office-request:${id}`, inputSummary: `intent=${row.intent} scope=${row.scope}`, recommendation: { requestId: id, contextChanged: Boolean(contextChange), ...(contextChange ? { change: contextChange } : {}) }, result: 'ok' }); } catch { /* 적용 영수증이 정본이다. */ }
```

- [ ] **Step 4: 서비스 테스트 통과 확인.**

- [ ] **Step 5: 실패 테스트 (클라이언트)** — `office-workflow-client.test.mjs`:

```js
test('a 409 context change keeps the change summary for the confirmation step', async () => {
  const fetcher = async () => new Response(JSON.stringify({ status: 'conflict', error: 'office-context-changed', requestId: RID, contextChange: { added: 1, updated: 0, removed: 0 } }), { status: 409 });
  const data = await writeOfficeWorkflow(`requests/${RID}/apply`, {}, { fetcher, requestId: RID, scope: 'personal' });
  assert.equal(data.error, 'office-context-changed');
  assert.deepEqual(data.contextChange, { added: 1, updated: 0, removed: 0 });
  assert.match(officeWorkflowNote(data), /새 기록 1건/);
});
```

  (`RID`는 테스트 파일의 기존 UUID 상수 또는 `crypto.randomUUID()`.)

- [ ] **Step 6: 클라이언트 구현** — `writeOfficeWorkflow`의 `!response.ok` 줄:

```js
    if (!response.ok) return {status:data?.status==='conflict'?'conflict':'error',requestId,error:data?.error,...(data?.contextChange?{contextChange:data.contextChange}:{})};
```

  `officeWorkflowNote` 앞부분에:

```js
  if (receipt?.error==='office-context-changed' && receipt.contextChange) {
    const {added=0,updated=0,removed=0}=receipt.contextChange;
    const parts=[added&&`새 기록 ${added}건`,updated&&`바뀐 기록 ${updated}건`,removed&&`빠진 기록 ${removed}건`].filter(Boolean);
    return `AI 결과를 만든 뒤 ${parts.length?parts.join(' · '):'기록 내용'}이 생겼습니다. 확인한 뒤 그대로 연결할 수 있습니다.`;
  }
```

- [ ] **Step 7: 패널 구현** — `office-workflow-panel.jsx`:
  - `apply(fields, acknowledge=false)`: body에 `...(acknowledge?{acknowledgeContextChange:true}:{})`. 결과가 `data.error==='office-context-changed'`면 `patch({pending:false,contextChange:data.contextChange||{},acknowledgeChange:false,note:officeWorkflowNote(data)})` 후 `return {ok:false,status:'conflict',message:officeWorkflowNote(data)}` — `inspect()`를 부르지 않고 `taskFields`를 유지한다.
  - `saveTask`: `return apply(payload, store.get(sessionKey).acknowledgeChange===true);`
  - `openTask`에서 `contextChange:null,acknowledgeChange:false`로 초기화.
  - EditDrawer 자식에 추가(기존 안내 문단 위):

```jsx
      {state.contextChange&&<div className={styles.changeNotice} role="status"><p>{officeWorkflowNote({error:'office-context-changed',contextChange:state.contextChange})}</p>
        <CheckboxRow text="바뀐 기록을 확인했고 이 내용 그대로 연결합니다" checked={state.acknowledgeChange===true} onChange={()=>patch(current=>({acknowledgeChange:!current.acknowledgeChange}))} /></div>}
```

  - `office-workflow-panel.module.css`: `.changeNotice { display:grid; gap:8px; padding:12px; border:1px solid var(--line); border-radius:var(--r-sm); }`
- [ ] **Step 8: 테스트 통과 확인** — 서비스·클라이언트 두 파일 PASS.
- [ ] **Step 9: 커밋**

```bash
git add apps/hub/lib/office/workflow-service.js apps/hub/lib/office/workflow-service.test.mjs apps/hub/components/hub/office-workflow-client.js apps/hub/components/hub/office-workflow-client.test.mjs apps/hub/components/hub/office-workflow-panel.jsx apps/hub/components/hub/office-workflow-panel.module.css
git commit -m "feat(office): 생성 뒤 기록이 바뀐 결과도 확인 후 할 일로 연결"
```

---

### Task 4: 다음 행동·근거 부분 처리와 `근거 확인 안 됨`

**Files:**
- Modify: `packages/agent-contracts/office-workflow.js` (`nextStep`, `parseOfficeWorkflowAnswer`, `parseOfficeWorkflowResult`)
- Modify: `apps/engine/lib/office/source-review.ts` (`readSourceReviewedOutput` 반환형)
- Modify: `apps/engine/lib/office/workflow-core.ts`, `response-core.ts`, `deliberation.ts` (호출부)
- Modify: `apps/engine/lib/office/workflow-response-schema.ts`, `workflow-prompt.ts` (`projectId` 제거)
- Modify: `apps/hub/lib/office/engine-client.js` (`sourceCheck` 전달)
- Modify: `apps/hub/components/hub/pages/office-council.jsx`, `apps/hub/components/hub/office-workflow-panel.jsx` (배지)
- Test: `packages/agent-contracts/office-workflow.test.mjs`, `apps/engine/lib/office/source-review.test.mjs`

**계약**
- `sourceCheck ∈ {'traced','none','untraced'}` — `traced`: 고른 인용 중 1개 이상 추적됨, `none`: 인용을 고르지 않음, `untraced`: 인용을 골랐지만 하나도 추적되지 않음 **또는** 워크플로 근거(`evidence`)를 냈지만 전부 참고 자료 밖. `untraced`만 화면에 `CertaintyBadge state="unknown" label="근거 확인 안 됨"`.
- 형식 자체가 깨진 경우(객체 아님, `sourceQuotes` 존재, `sourceIndexes`가 배열 아님, `corrections` 불량)는 지금처럼 실패다.
- 다음 행동: 제목·라벨·kind가 불량이면 제안 전체를 `null`로, `dueAt`·`priority`·`dealId`·`description`·`nextAction`·모르는 키는 그 필드만 뺀다. `projectId`는 받지 않는다(운영자가 연결 단계에서 고른다). 뺀 사실은 `uncertainties`에 한 줄로 남긴다(12개 상한 유지).

- [ ] **Step 1: 실패 테스트 (계약)** — `office-workflow.test.mjs`에 기존 픽스처(`request`, `context`, 유효 answer)를 써서:

```js
test('an invalid next-step field is dropped without discarding the reviewed body', () => {
  const answer = { ...VALID_ANSWER, nextStep: { kind: 'create_task', label: '답장 보내기', fields: { title: '답장', dueAt: '내일', priority: 'urgent', projectId: crypto.randomUUID(), extra: 1 } } };
  const parsed = parseOfficeWorkflowAnswer(answer, REQUEST, CONTEXT);
  assert.equal(parsed.artifact.body, VALID_ANSWER.artifact.body);
  assert.deepEqual(parsed.nextStep.fields, { title: '답장' });
  assert.ok(parsed.uncertainties.some(line => /다음 행동 제안의 일부 항목/.test(line)));
});

test('an invalid next-step title drops only the proposal', () => {
  const parsed = parseOfficeWorkflowAnswer({ ...VALID_ANSWER, nextStep: { kind: 'create_task', label: '', fields: { title: '' } } }, REQUEST, CONTEXT);
  assert.equal(parsed.nextStep, null);
  assert.ok(parsed.uncertainties.some(line => /다음 행동 제안을 확인하지 못해/.test(line)));
});

test('evidence outside the sent sources is dropped and all-dropped evidence marks the result untraced', () => {
  const some = parseOfficeWorkflowAnswer({ ...VALID_ANSWER, evidence: [{ sourceRefId: CONTEXT.sourceRefs[0].id, explanation: '확인' }, { sourceRefId: 'nope', explanation: '없음' }] }, REQUEST, CONTEXT);
  assert.equal(some.evidence.length, 1);
  assert.equal(some.sourceCheck, undefined);
  const none = parseOfficeWorkflowAnswer({ ...VALID_ANSWER, evidence: [{ sourceRefId: 'nope', explanation: '없음' }] }, REQUEST, CONTEXT);
  assert.equal(none.evidence.length, 0);
  assert.equal(none.sourceCheck, 'untraced');
});

test('parseOfficeWorkflowResult keeps a valid sourceCheck and rejects an unknown one', () => {
  assert.equal(parseOfficeWorkflowResult({ ...VALID_RESULT, sourceCheck: 'none' }, REQUEST, CONTEXT).sourceCheck, 'none');
  assert.throws(() => parseOfficeWorkflowResult({ ...VALID_RESULT, sourceCheck: 'maybe' }, REQUEST, CONTEXT));
});
```

  (`VALID_ANSWER`·`VALID_RESULT`·`REQUEST`·`CONTEXT`는 테스트 파일의 기존 픽스처 이름에 맞춘다. 없으면 파일 상단에 기존 생성 테스트에서 쓰는 값으로 정의한다.)

- [ ] **Step 2: 실패 확인** — `node --import ./scripts/register-hub-alias.mjs --test packages/agent-contracts/office-workflow.test.mjs` → FAIL.

- [ ] **Step 3: 계약 구현** — `office-workflow.js`:

```js
export const OFFICE_SOURCE_CHECKS = Object.freeze(['traced', 'none', 'untraced']);
const NOTE_NEXT_STEP_DROPPED = '다음 행동 제안을 확인하지 못해 제외했습니다. 필요하면 할 일을 직접 만들어 주세요.';
const NOTE_NEXT_STEP_TRIMMED = '다음 행동 제안의 일부 항목(기한·우선순위 등)을 확인하지 못해 뺐습니다.';
const tryParse = fn => { try { return fn(); } catch { return undefined; } };

// Model output: a bad optional field must not discard a reviewed body (2026-09-23 운영자 확정).
function nextStep(value, context, notes) {
  if (value === null || value === undefined) return null;
  const valid = plain(value) && value.kind === 'create_task' && plain(value.fields);
  const title = valid ? tryParse(() => text(value.fields.title, 300)) : undefined;
  const label = valid ? tryParse(() => text(value.label, 160)) : undefined;
  if (!title || !label) { notes.push(NOTE_NEXT_STEP_DROPPED); return null; }
  const fields = { title };
  let trimmed = Object.keys(value.fields).some(key => !['title', 'description', 'nextAction', 'dueAt', 'dealId', 'priority'].includes(key));
  const keep = (key, parse) => {
    if (value.fields[key] === undefined || value.fields[key] === null) return;
    const parsed = tryParse(parse);
    if (parsed === undefined) trimmed = true; else fields[key] = parsed;
  };
  keep('description', () => text(value.fields.description, 4000));
  keep('nextAction', () => text(value.fields.nextAction, 1000));
  keep('dueAt', () => /^\d{4}-\d{2}-\d{2}$/.test(value.fields.dueAt) ? date(value.fields.dueAt) : timestamp(value.fields.dueAt));
  keep('dealId', () => { const id = uuid(value.fields.dealId); check(context.sourceRefs.some(ref => ['deal', 'deals'].includes(ref.type) && ref.entityId === id), 'deal'); return id; });
  keep('priority', () => { check(['low', 'medium', 'high', 'critical'].includes(value.fields.priority), 'priority'); return value.fields.priority; });
  if (trimmed) notes.push(NOTE_NEXT_STEP_TRIMMED);
  return { kind: 'create_task', label, fields };
}
```

  `parseOfficeWorkflowAnswer`:
  - `keys(value, [...,'nextStep'])` 목록에 `'sourceCheck'` 추가.
  - 근거 파싱을 다음으로 교체:

```js
  const claimed = value.evidence.length;
  const evidence = value.evidence.flatMap(ref => {
    const parsed = tryParse(() => { keys(ref, ['sourceRefId', 'explanation']); check(context.sourceRefs.some(source => source.id === ref.sourceRefId), 'ref'); return { sourceRefId: ref.sourceRefId, explanation: text(ref.explanation, 1000) }; });
    return parsed ? [parsed] : [];
  });
  const notes = [];
  if (evidence.length < claimed) notes.push(`근거 ${claimed - evidence.length}건은 전달된 자료에서 찾지 못해 제외했습니다.`);
  const step = nextStep(value.nextStep, context, notes);
  const modelNotes = strings(value.uncertainties);
  const uncertainties = [...modelNotes.slice(0, Math.max(0, 12 - notes.length)), ...notes];
  check(value.sourceCheck === undefined || OFFICE_SOURCE_CHECKS.includes(value.sourceCheck), '근거 확인 상태가 올바르지 않습니다.');
  const sourceCheck = claimed > 0 && evidence.length === 0 ? 'untraced' : value.sourceCheck;
  const result = { summary: text(value.summary, 1800), artifact: { kind: value.artifact.kind, body: text(value.artifact.body, 24000) }, evidence, uncertainties, dissent: strings(value.dissent, 8), nextStep: step, ...(sourceCheck ? { sourceCheck } : {}) };
```

  - 멱등성: 이미 정리된 결과를 다시 파싱해도 같아야 한다. 정리된 `uncertainties`의 안내 문구는 모델 문구와 같은 배열에 있으므로 재파싱 시 `notes`가 비어 그대로 유지된다.
  - `parseOfficeWorkflowResult`: `answerKeys`에 `'sourceCheck'` 추가.
  - 이전 `nextStep` 함수와 그 안의 `projectId` 검사는 삭제한다.

- [ ] **Step 4: 계약 테스트 통과 확인** — 기존 테스트 중 "다음 행동의 대상은 참고 자료에 있어야" 류 실패 기대가 있으면 새 계약(필드 제외 + 안내)으로 기대값을 바꾼다.

- [ ] **Step 5: 실패 테스트 (출처 검수)** — `apps/engine/lib/office/source-review.test.mjs`:

```js
test('source review keeps traceable indexes and reports the check state', () => {
  const request = { message: '마감은 금요일입니다.' };
  const catalog = buildOfficeSourceCatalog(request, {});
  const ok = readSourceReviewedOutput({ sourceIndexes: [0], corrections: [], answer: 'a' }, request, {}, catalog);
  assert.equal(ok.sourceCheck, 'traced');
  assert.equal(ok.answer.answer, 'a');
  const mixed = readSourceReviewedOutput({ sourceIndexes: [0, 99], corrections: [], answer: 'a' }, request, {}, catalog);
  assert.equal(mixed.sourceCheck, 'traced');
  const bad = readSourceReviewedOutput({ sourceIndexes: [99], corrections: [], answer: 'a' }, request, {}, catalog);
  assert.equal(bad.sourceCheck, 'untraced');
  const none = readSourceReviewedOutput({ sourceIndexes: [], corrections: [], answer: 'a' }, request, {}, catalog);
  assert.equal(none.sourceCheck, 'none');
  assert.throws(() => readSourceReviewedOutput({ sourceIndexes: 'x', corrections: [], answer: 'a' }, request, {}, catalog), /invalid-source-review/);
  assert.throws(() => readSourceReviewedOutput({ sourceQuotes: [], sourceIndexes: [], corrections: [] }, request, {}, catalog), /invalid-source-review/);
});
```

- [ ] **Step 6: 출처 검수 구현** — `source-review.ts`의 `readSourceReviewedOutput`가 `{ answer, sourceCheck }`를 반환:

```ts
export type OfficeSourceCheck = 'traced' | 'none' | 'untraced';
export function readSourceReviewedOutput(raw: unknown, request: SourceReviewRequest, context: unknown, catalog: OfficeSourceCatalog): { answer: Record<string, unknown>; sourceCheck: OfficeSourceCheck } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('invalid-source-review');
  if (Object.hasOwn(raw, 'sourceQuotes') || Object.hasOwn(raw, 'sourceCatalog')) throw new Error('invalid-source-review');
  const { sourceIndexes, corrections, ...answer } = raw as Record<string, unknown>;
  const validStrings = (value: unknown, max: number): value is string[] => Array.isArray(value) && value.length <= 5 && value.every(item => typeof item === 'string' && item.trim() && item.length <= max && !item.includes('\0'));
  if (!Array.isArray(sourceIndexes) || sourceIndexes.length > 5 || !validStrings(corrections, 350)) throw new Error('invalid-source-review');
  if (!sourceIndexes.length) return { answer, sourceCheck: 'none' };
  // 형식은 유지하되, 추적되지 않는 인용은 그 항목만 버린다(2026-09-23 운영자 확정).
  const source = sourceTexts(request, context);
  const traced = sourceIndexes.filter(index => Number.isSafeInteger(index) && index >= 0 && index < catalog.length && catalog[index].index === index
    && typeof catalog[index].quote === 'string' && source.some(text => text.includes(catalog[index].quote)));
  return { answer, sourceCheck: traced.length ? 'traced' : 'untraced' };
}
```

  호출부 3곳:
  - `workflow-core.ts` `parseReviewed`: `const reviewedOut = readSourceReviewedOutput(...); return parseOfficeWorkflowAnswer({ ...reviewedOut.answer, sourceCheck: reviewedOut.sourceCheck }, request, context);` — 계약이 근거 전부 탈락 시 `untraced`로 덮는다.
  - `response-core.ts` `parseReviewed`: `const reviewed = read(phase,'source-review',()=>readSourceReviewedOutput(raw, request, context, sourceCatalog)); const answer = read(phase,'contract',()=>parseOfficeAnswer(reviewed.answer, request.mode)); return { ...answer, sourceCheck: reviewed.sourceCheck };` — 반환 객체 두 곳(`...answer`)은 그대로 `sourceCheck`를 싣는다.
  - `deliberation.ts:123`: `const raw = read('source-review', () => readSourceReviewedOutput(parsed, request, context, sourceCatalog).answer);`
  - `workflow-response-schema.ts:12`의 nextStep fields 스키마와 `workflow-prompt.ts:14`의 안내에서 `projectId` 제거.

- [ ] **Step 7: Hub 전달** — `apps/hub/lib/office/engine-client.js` 성공 반환 객체에 `...(['traced','none','untraced'].includes(data.sourceCheck)?{sourceCheck:data.sourceCheck}:{})` 추가.

- [ ] **Step 8: 배지** — `office-council.jsx` `ResultTurn` 헤더의 `<CertaintyBadge state="recommended" />` 뒤:

```jsx
      {result.sourceCheck === 'untraced' ? <CertaintyBadge state="unknown" label="근거 확인 안 됨" /> : null}
```

  `office-workflow-panel.jsx` 결과 헤더의 TruthBadge 뒤에 같은 줄(`result.sourceCheck`), `CertaintyBadge` import 추가.

- [ ] **Step 9: 관련 테스트 전부** — `node --import ./scripts/register-hub-alias.mjs --test packages/agent-contracts/office-workflow.test.mjs apps/engine/lib/office/source-review.test.mjs apps/engine/lib/office/workflow.test.mjs apps/engine/lib/office/office.test.mjs apps/engine/lib/office/quality.test.mjs apps/hub/lib/office/office.test.mjs apps/hub/components/hub/office-client.test.mjs` → PASS. `readSourceReviewedOutput` 반환형 변경으로 깨지는 기존 기대는 `.answer`로 옮긴다.
- [ ] **Step 10: 커밋**

```bash
git add packages/agent-contracts/office-workflow.js packages/agent-contracts/office-workflow.test.mjs apps/engine/lib/office/source-review.ts apps/engine/lib/office/source-review.test.mjs apps/engine/lib/office/workflow-core.ts apps/engine/lib/office/response-core.ts apps/engine/lib/office/deliberation.ts apps/engine/lib/office/workflow-response-schema.ts apps/engine/lib/office/workflow-prompt.ts apps/hub/lib/office/engine-client.js apps/hub/components/hub/pages/office-council.jsx apps/hub/components/hub/office-workflow-panel.jsx
git commit -m "feat(office): 불량 다음 행동·근거는 항목만 제외하고 전부 실패 시 '근거 확인 안 됨' 표시"
```

---

### Task 5: 실패 원인 분류·자유 대화 사용량·7일 요약

**Files:**
- Modify: `packages/agent-contracts/office.js` (+`office.test.mjs`) — 공유 상수
- Modify: `packages/agent-contracts/office-workflow.js` — 비생성 결과의 `failure`
- Modify: `apps/engine/lib/office/response-core.ts`, `http.ts`, `workflow-core.ts`
- Modify: `apps/hub/lib/office/engine-client.js`, `apps/hub/lib/office/http.js`, `apps/hub/lib/office/workflow-service.js`
- Create: `apps/hub/lib/repositories/office-usage.js`, `apps/hub/lib/repositories/office-usage.test.mjs`
- Create: `apps/hub/app/api/hub/office/usage/route.js`
- Modify: `apps/hub/components/hub/pages/office-council.jsx` (+`.module.css`)

**계약**
- `failure = { phase, category }`, `phase ∈ draft|review|position|response|synthesis`, `category ∈ provider|json|source-review|contract|deadline|model-mismatch`. 모델 본문·예외 메시지는 싣지 않는다.
- 채팅 성공 응답에 `generation = { elapsedMs, modelCalls, usage }`(usage는 `null` 또는 `{promptTokens,outputTokens,totalTokens}`).
- `agent_runs` 기록(본문 없음):
  - 채팅: 성공 `result:'ok'`, `recommendation:{ status:'generated', elapsedMs, modelCalls, usage }`, 실패 `result:'error'`, `recommendation:{ status:'error', failure, elapsedMs }`.
  - 워크플로: 기존 성공 기록에 `elapsedMs`·`usage` 추가, 실패 시 `result:'error'` 행 추가.
  - 적용: Task 3의 `office.apply`.
- 요약 `GET /api/hub/office/usage` → `{ status:'live'|'preview'|'error', windowDays:7, requests, applied, failed, failureCategories:{[category]:n}, averageElapsedMs|null }` — **항상 HTTP 200**, 실패는 `status:'error', source:'error'`.

- [ ] **Step 1: 공유 상수 + 테스트** — `office.js` 끝에:

```js
export const OFFICE_FAILURE_PHASES = Object.freeze(['draft', 'review', 'position', 'response', 'synthesis']);
export const OFFICE_FAILURE_CATEGORIES = Object.freeze(['provider', 'json', 'source-review', 'contract', 'deadline', 'model-mismatch']);
export const OFFICE_FAILURE_LABELS = Object.freeze({ provider: '제공자 오류', json: '형식 오류', 'source-review': '근거 검수', contract: '계약 위반', deadline: '시간 초과', 'model-mismatch': '모델 불일치', unknown: '원인 미상' });
const FAILURE_MESSAGES = {
  provider: 'AI 제공자가 응답하지 않았습니다. 잠시 후 다시 시도해 주세요. 입력은 보존됩니다.',
  deadline: '응답이 제한 시간을 넘었습니다. 관점 수를 줄이거나 요청을 나눠 다시 시도해 주세요. 입력은 보존됩니다.',
  'source-review': '근거 검수 단계에서 응답 형식을 확인하지 못했습니다. 다시 시도해 주세요. 입력은 보존됩니다.',
};
export function parseOfficeFailure(value) {
  return plain(value) && OFFICE_FAILURE_PHASES.includes(value.phase) && OFFICE_FAILURE_CATEGORIES.includes(value.category) ? { phase: value.phase, category: value.category } : null;
}
export function officeFailureMessage(failure) {
  return FAILURE_MESSAGES[failure?.category] || 'AI 응답 형식이 맞지 않아 결과를 버렸습니다. 같은 요청을 한 번 더 보내 주세요. 입력은 보존됩니다.';
}
```

  (`plain`은 파일 안 기존 헬퍼. 없으면 `office-workflow.js`와 같은 정의를 둔다.) `office.test.mjs`:

```js
test('office failures are an allow-listed phase/category pair with an operator message', () => {
  assert.deepEqual(parseOfficeFailure({ phase: 'review', category: 'deadline', raw: 'x' }), { phase: 'review', category: 'deadline' });
  assert.equal(parseOfficeFailure({ phase: 'review', category: 'boom' }), null);
  assert.match(officeFailureMessage({ category: 'deadline' }), /제한 시간/);
  assert.match(officeFailureMessage(null), /다시 보내/);
});
```

  `office-workflow.js` `parseOfficeWorkflowResult`: `keys(value, [...metadata, ...answerKeys, 'error', 'failure'])`, 비생성 분기 `return { ...base, error: text(value.error, 1000), ...(parseOfficeFailure(value.failure) ? { failure: parseOfficeFailure(value.failure) } : {}) };`, 생성 분기에는 `check(value.failure === undefined, ...)`.

- [ ] **Step 2: Engine 채팅** — `response-core.ts`:
  - `const startedAt = Date.now(); const calls: { usageMetadata?: unknown }[] = [];` — `call()` 성공 결과를 `calls.push(result)`, 토론은 `roles.results`를 합친다.
  - 사용량 헬퍼는 `workflow-core.ts`의 `usageFor`를 `export`하고 import해서 쓴다.
  - 성공 반환 두 곳에 `generation: { elapsedMs: Date.now() - startedAt, modelCalls: <호출 수>, usage: usageFor(<결과 배열>) }`.
  - `http.ts`: 첫 진단만 붙잡아 응답에 싣는다.

```ts
   let failure: { phase: string; category: string } | null = null;
   const result = await generate(request, context, undefined, event => { failure ??= { phase: event.phase, category: event.category }; });
   const body = result.status === 'error' && failure ? { ...result, failure, error: officeFailureMessage(failure) } : result;
   return Response.json(body, { status: result.status === 'error' ? 502 : result.status === 'preview' ? 202 : 200 });
```

  (`generate` 타입을 `(request, context, provider?, onDiagnostic?) => ...`로 넓히고 `officeFailureMessage` import.) `apps/engine/lib/office/office.test.mjs`에 핸들러 테스트 추가: 가짜 `generate`가 onDiagnostic으로 `{phase:'review',category:'deadline'}`을 보내고 `{status:'error',error:'x'}`를 반환하면 응답 JSON의 `failure`와 문구가 시간 초과로 바뀌는지 확인.

- [ ] **Step 3: Engine 워크플로** — `workflow-core.ts`:
  - `let first: OfficeDiagnosticEvent | null = null; const onDiagnostic = (event) => { first ??= event; }; let phase: OfficeDiagnosticEvent['phase'] = request.mode === 'council' ? 'position' : 'draft';`
  - 토론 호출에 `onDiagnostic` 전달(`runOfficeDiscussion(request, source, signal, generate, onDiagnostic)`), 검수·종합 직전 `phase = 'review'`/`'synthesis'`.
  - 제공자 실패 분기(`!result.ok`, `!reviewed.ok`)는 `failure('error', ...)` 대신 `failed(phase, signal.aborted ? 'deadline' : 'provider')`.
  - `catch`:

```ts
    const category: OfficeDiagnosticEvent['category'] = signal.aborted ? 'deadline' : first?.category
      ?? (error instanceof SyntaxError ? 'json' : /source-review/.test(String((error as Error)?.message)) ? 'source-review' : 'contract');
    return failed(first?.phase ?? phase, category);
```

  - `const failed = (p, category) => ({ ...meta, status: 'error' as const, error: officeFailureMessage({ category }), failure: { phase: p, category } });`
  - `apps/engine/lib/office/workflow.test.mjs`에 가짜 제공자로 (a) 초안 JSON 깨짐 → `failure.category==='json'`, (b) 검수 제공자 실패 → `'provider'`, (c) 중단 신호 → `'deadline'` 3건 추가.

- [ ] **Step 4: Hub 채팅 전달·기록** — `engine-client.js`:
  - 엔진 실패 응답이 `data.status==='error'`이고 `parseOfficeFailure(data.failure)`가 유효하면 `{status:'error', error: officeFailureMessage(failure), failure}` 반환(던지지 않음).
  - 성공 반환에 `generation`을 검증해 싣는다: `elapsedMs`·`modelCalls`는 0 이상 정수, `usage`는 `null` 또는 3개 0 이상 정수. 어긋나면 `generation`을 빼고 성공은 유지.
  - `http.js`: `const startedAt = Date.now();` 후 엔진 호출. 성공 기록 `recommendation`에 `{ status:'generated', elapsedMs: result.generation?.elapsedMs ?? Date.now()-startedAt, modelCalls: result.generation?.modelCalls ?? null, usage: result.generation?.usage ?? null }`. `result.status==='error'`면 `recordRun({ agent: request.mode==='council'?'office.council':`office.${request.ownerId}`, mode: request.mode, ref:`office:${request.scope}`, inputSummary: <성공과 같은 요약>, recommendation:{ status:'error', failure: result.failure ?? null, elapsedMs: Date.now()-startedAt }, result:'error' })`를 best-effort로 남기고 기존처럼 502를 돌려준다(응답에 `failure` 포함).
  - `apps/hub/lib/office/office.test.mjs`에 두 테스트: (a) 가짜 엔진 실패(`failure: deadline`) → 핸들러 응답 `error`가 시간 초과 문구이고 `recordRun`이 `result:'error'`로 불림, (b) 성공 → `recordRun.recommendation.elapsedMs`가 숫자.

- [ ] **Step 5: Hub 워크플로 기록** — `workflow-service.js` `execute`:
  - `else if (result.status !== 'unknown') result = { status:'error', error: result.error || 'office-generation-failed', ...(parseOfficeFailure(result.failure) ? { failure: parseOfficeFailure(result.failure) } : {}) };`
  - 성공 `recordRun`의 `recommendation`에 `elapsedMs: result.generation?.elapsedMs ?? null, usage: result.generation?.usage ?? null` 추가.
  - `finish` 뒤 `result.status==='error'`면 best-effort로 `recordRun({ workspaceId, agent:`office.${request.ownerId}`, mode: request.mode, ref:`office-request:${request.requestId}`, inputSummary:`intent=${request.intent} scope=${request.scope}`, recommendation:{ requestId, status:'error', failure: result.failure ?? null }, result:'error' })`.
  - `workflow-service.test.mjs`에 "엔진이 `failure`를 준 실패는 `result:'error'` 실행 기록을 남긴다" 추가.

- [ ] **Step 6: 요약 저장소 (TDD)** — `office-usage.test.mjs`:

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { summarizeOfficeRuns, readOfficeUsage } from './office-usage.js';

test('summarizes office runs into requests, links, failures and average latency', () => {
  const rows = [
    { agent: 'office.eevee', mode: 'chat', result: 'ok', recommendation: { elapsedMs: 10000 } },
    { agent: 'office.council', mode: 'council', result: 'error', recommendation: { failure: { phase: 'synthesis', category: 'deadline' }, elapsedMs: 48000 } },
    { agent: 'office.flareon', mode: 'draft', result: 'ok', recommendation: { elapsedMs: 20000 } },
    { agent: 'office.apply', mode: 'apply', result: 'ok', recommendation: { contextChanged: true } },
  ];
  assert.deepEqual(summarizeOfficeRuns(rows), { requests: 3, applied: 1, failed: 1, failureCategories: { deadline: 1 }, averageElapsedMs: 15000 });
});

test('reads preview without Supabase and an error envelope on read failure', async () => {
  assert.equal((await readOfficeUsage({ fetchRows: async () => ({ rows: null, configured: false }) })).status, 'preview');
  const failed = await readOfficeUsage({ fetchRows: async () => ({ rows: null, configured: true, error: 'x' }) });
  assert.equal(failed.status, 'error');
  assert.equal(failed.source, 'error');
});
```

  평균 지연은 **성공한 요청만** 대상으로 한다(시간 초과 48초가 평균을 왜곡하지 않게). `office-usage.js`:

```js
// Office 사용 요약 — agent_runs의 office.* 행만 읽는다(본문 없음). 2026-09-23 운영자 확정: 하단 한 줄 요약.
import { fetchSupabaseRowsDetailed, withWorkspaceFilter } from '@/lib/server-read';

const DAY = 24 * 60 * 60 * 1000;

export function summarizeOfficeRuns(rows) {
  const requests = rows.filter(row => row.mode !== 'apply');
  const failures = requests.filter(row => row.result === 'error');
  const failureCategories = {};
  for (const row of failures) {
    const category = row.recommendation?.failure?.category || 'unknown';
    failureCategories[category] = (failureCategories[category] || 0) + 1;
  }
  const elapsed = requests.filter(row => row.result === 'ok').map(row => row.recommendation?.elapsedMs).filter(ms => Number.isFinite(ms) && ms >= 0);
  return {
    requests: requests.length,
    applied: rows.filter(row => row.mode === 'apply' && row.result === 'ok').length,
    failed: failures.length,
    failureCategories,
    averageElapsedMs: elapsed.length ? Math.round(elapsed.reduce((sum, ms) => sum + ms, 0) / elapsed.length) : null,
  };
}

export async function readOfficeUsage({ days = 7, now = Date.now(), fetchRows = fetchSupabaseRowsDetailed } = {}) {
  const since = new Date(now - days * DAY).toISOString();
  const answer = await fetchRows('agent_runs', {
    select: 'agent,mode,result,recommendation,ran_at',
    filters: withWorkspaceFilter([['agent', 'like.office.*'], ['ran_at', `gte.${since}`]]),
    order: 'ran_at.desc', limit: 1000,
  });
  if (answer?.configured === false) return { status: 'preview', windowDays: days };
  if (!Array.isArray(answer?.rows)) return { status: 'error', source: 'error', error: 'office-usage-read-failed', windowDays: days };
  return { status: 'live', windowDays: days, ...summarizeOfficeRuns(answer.rows) };
}
```

- [ ] **Step 7: 라우트** — `apps/hub/app/api/hub/office/usage/route.js`:

```js
import { readOfficeUsage } from '@/lib/repositories/office-usage.js';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Hub read 봉투: 실패도 HTTP 200 + status:'error' (CLAUDE.md 2026-09-01).
export async function GET() {
  try { return Response.json(await readOfficeUsage(), { headers: { 'cache-control': 'no-store' } }); }
  catch { return Response.json({ status: 'error', source: 'error', error: 'office-usage-read-failed' }, { headers: { 'cache-control': 'no-store' } }); }
}
```

  미들웨어 기본값이 "막힘"이라 `route-access.js` 변경은 없다.

- [ ] **Step 8: 요약 줄 UI** — `office-council.jsx`에 컴포넌트 추가하고 `sessionNote` 아래에 `<OfficeUsageLine refreshKey={session.turns.length} />`:

```jsx
function OfficeUsageLine({ refreshKey }) {
  const [usage, setUsage] = React.useState(null);
  const load = React.useCallback(() => {
    setUsage(null);
    fetch('/api/hub/office/usage', { cache: 'no-store' }).then(res => res.json()).then(setUsage).catch(() => setUsage({ status: 'error' }));
  }, []);
  React.useEffect(() => { load(); }, [load, refreshKey]);
  if (!usage) return <div className={styles.usage}><Skeleton lines={1} label="최근 7일 사용 기록 확인 중" /></div>;
  if (usage.status === 'preview') return <p className={styles.usage}><TruthBadge state="preview" /> 사용 기록은 저장 연결 후 표시됩니다.</p>;
  if (usage.status !== 'live') return <p className={styles.usage}><TruthBadge state="error" /> 사용 기록을 읽지 못했습니다. <Button size="xs" variant="ghost" onClick={load}>다시 확인</Button></p>;
  const failures = Object.entries(usage.failureCategories || {}).map(([key, n]) => `${OFFICE_FAILURE_LABELS[key] || key} ${n}`).join(' · ');
  return <p className={styles.usage}>최근 <span className="mono">{usage.windowDays}</span>일 · 요청 <span className="mono">{usage.requests}</span> · 할 일 연결 <span className="mono">{usage.applied}</span>
    {usage.averageElapsedMs != null ? <> · 평균 <span className="mono">{Math.round(usage.averageElapsedMs / 1000)}</span>초</> : null}
    {' · '}실패 <span className="mono">{usage.failed}</span>{failures ? `(${failures})` : ''}</p>;
}
```

  `OFFICE_FAILURE_LABELS`는 `@com-moon/agent-contracts/office`에서 import. CSS: `.usage { display:flex; align-items:center; flex-wrap:wrap; gap:8px; margin-top:8px; font-size:12px; color:var(--fg-muted); line-height:1.7; }`.

- [ ] **Step 9: 테스트** — 이번 Task에서 건드린 테스트 파일 전부 PASS.
- [ ] **Step 10: 커밋**

```bash
git add packages/agent-contracts/office.js packages/agent-contracts/office.test.mjs packages/agent-contracts/office-workflow.js apps/engine/lib/office/response-core.ts apps/engine/lib/office/http.ts apps/engine/lib/office/workflow-core.ts apps/engine/lib/office/office.test.mjs apps/engine/lib/office/workflow.test.mjs apps/hub/lib/office/engine-client.js apps/hub/lib/office/http.js apps/hub/lib/office/office.test.mjs apps/hub/lib/office/workflow-service.js apps/hub/lib/office/workflow-service.test.mjs apps/hub/lib/repositories/office-usage.js apps/hub/lib/repositories/office-usage.test.mjs apps/hub/app/api/hub/office/usage/route.js apps/hub/components/hub/pages/office-council.jsx apps/hub/components/hub/pages/office-council.module.css
git commit -m "feat(office): 실패 원인 분류·자유 대화 사용량 기록과 최근 7일 요약 줄"
```

---

### Task 6: Office 화면 DESIGN.md 교정 + 모바일 결과 포커스

**Files:**
- Modify: `apps/hub/components/hub/office-workflow-panel.jsx:133,177`
- Modify: `apps/hub/components/hub/pages/office-council.jsx:128,134,149-152`
- Modify: `apps/hub/components/hub/pages/office-council.module.css:42`
- Test: `apps/hub/components/hub/office-client.test.mjs`

- [ ] **Step 1: 실패 테스트** — `office-client.test.mjs`:

```js
test('Office surfaces follow the truth, selection and announcement contracts', () => {
  const page = fs.readFileSync(new URL('./pages/office-council.jsx', import.meta.url), 'utf8');
  const css = fs.readFileSync(new URL('./pages/office-council.module.css', import.meta.url), 'utf8');
  const panel = fs.readFileSync(new URL('./office-workflow-panel.jsx', import.meta.url), 'utf8');
  assert.match(page, /role=\{session\.error\.status === 'error' \? 'alert' : 'status'\}/);
  assert.match(page, /aria-live="polite" aria-label="Office 요청 결과"/);
  assert.match(css, /\.member\[aria-pressed="true"\][^}]*--accent-line/);
  assert.doesNotMatch(panel, /<EmptyState icon="sparkle" title="업무 연결 확인 필요"/);
  assert.match(panel, /className=\{`mono \$\{styles\.historyTime\}`\}/);
});
```

- [ ] **Step 2: 실패 확인.**
- [ ] **Step 3: 구현**
  - 패널 `:133` 비준비 분기를 다음으로 교체(§5.3 truth + 원인 + 재시도):

```jsx
      {state.loading?<Skeleton lines={2} label="Office 자료와 이전 결과 확인 중" />:state.context?.status!=='ready'?<div className={styles.truth} role={state.context?.status==='preview'?'status':'alert'}>
        <TruthBadge state={state.context?.status==='preview'?'preview':'error'} /><p className={styles.note}>{officeWorkflowNote(state.context)||'자료를 확인할 수 없습니다.'}</p><Button size="xs" onClick={load}>다시 확인</Button></div>:null}
```

  (`EmptyState` import가 더는 쓰이지 않으면 제거.) CSS `.truth { display:flex; align-items:center; flex-wrap:wrap; gap:8px; }`.
  - 패널 `:177` 요청 기록 버튼 내용: `<span className={`mono ${styles.historyTime}`}>{new Date(item.createdAt).toLocaleString('ko-KR')}</span> · {상태}`. CSS `.historyTime { font-size:12px; }`.
  - 페이지 `:128`: `role={session.error.status === 'error' ? 'alert' : 'status'}`.
  - 페이지 스레드: `<div className={styles.thread} aria-live="polite" aria-label="Office 요청 결과" ref={threadRef} tabIndex={-1}>`, `const threadRef = React.useRef(null);` 그리고 `submit` 안에서 `store.complete(...)` 뒤:

```jsx
    setComparisonOpen(false);
    requestAnimationFrame(() => { threadRef.current?.focus({ preventScroll: true }); threadRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }); });
```

  `submit` 시작부(보내기 직전)에도 `setComparisonOpen(false);` — 전송하면 설정을 접는다. `scrollIntoView`의 smooth는 reduced-motion에서 허브 안전망이 전이를 끈다(§9). 포커스 링: `.thread:focus-visible { outline:1px solid var(--moon-300); outline-offset:-2px; }` (§15 2026-09-15 full-bleed 규칙).
  - CSS `:42`: `.member[aria-pressed="true"] { background:var(--surface-2); border-color:var(--accent-line); box-shadow:inset 1px 0 0 var(--accent); }` — 선택=Moonstone(§5.3 우선순위 1).
- [ ] **Step 4: 통과 확인** — `office-client.test.mjs` + `node --import ./scripts/register-hub-alias.mjs --test apps/hub/components/hub/motion.test.mjs apps/hub/components/hub/palette.test.mjs apps/hub/components/hub/focus-ring.test.mjs apps/hub/components/hub/state-usage.test.mjs` PASS.
- [ ] **Step 5: 커밋**

```bash
git add apps/hub/components/hub/office-workflow-panel.jsx apps/hub/components/hub/office-workflow-panel.module.css apps/hub/components/hub/pages/office-council.jsx apps/hub/components/hub/pages/office-council.module.css apps/hub/components/hub/office-client.test.mjs
git commit -m "fix(office): truth 상태·선택 색·결과 알림 교정과 전송 후 결과로 포커스 이동"
```

---

### Task 7: 전체 검증·문서

- [ ] **Step 1:** 워크트리 루트에서 `npm test` → 실패 0 (기준선 2442 tests · pass 2431 · skip 11에서 새 테스트만큼 증가).
- [ ] **Step 2:** 브라우저 확인(`.claude/launch.json`의 허브 dev 서버, 워크트리 포트): ⌘J → Office 이동, 사이드바 AI → Office 착지, Office 하단 요약 줄(연결 없는 환경이면 `Preview` 배지), 390px에서 전송 후 결과로 스크롤·포커스.
- [ ] **Step 3:** `docs/README.md` §3 Office 두 행에 이번 변경(역할 카드 v25·근거 교정, 진입점, 부분 처리, 실패 분류·요약)과 "의미 품질 인증 대기" 유지를 반영하고, 이 계획 문서를 §4 목록에 링크한다.
- [ ] **Step 4:** 커밋 후 `git show --stat`으로 규모 확인. 로컬 머지만 하고 푸시하지 않는다(운영자 확인 후 수동).

---

## 구현 결과 (2026-09-23)

- 커밋: T1 역할 카드 → T2 진입점 → T3 적용 확인 → T4 부분 처리 → T5 실패 분류·요약 → T6 디자인·포커스 → T7 문서.
- `npm test`: **2471 tests · 통과 2460 · 실패 0 · skip 11** (기준선 2442 / 2431에서 +29).
- 브라우저(워크트리 허브 `localhost:3140`, 운영 DB 읽기 전용): ⌘J → `/dashboard/agents/office-council`, 사이드바 AI·자동화 → Office, ✦ 접근 가능한 이름 `Office (⌘J)`, ⌘K "이브이" → Office, 구 주소 `dashboard/agents/office`는 LEGACY 안내 카드가 Office로 안내, 390px 가로 스크롤 없음, 콘솔 오류 없음. 요약 줄 `최근 7일 · 요청 0 · 할 일 연결 0 · 실패 0`.
- **실측**: 운영 DB `agent_runs`에 `office.*` 행이 한 번도 없다(전체 에이전트 최근 실행 2026-07-12). 요약의 0은 필터 문제가 아니라 실제 사용 기록이 없다는 뜻이다.
- 계획과 달라진 점:
  - T3 영수증 기록 → `agent_runs`의 `office.apply` 행(위 "계획 단계에서 바꾼 점"). 이미 저장 확인된 적용의 재확인은 새 행을 만들지 않는다.
  - T5 채팅 성공 기록은 **기존대로 답변 본문을 `recommendation`에 저장**한다(이번 범위에서 동작을 바꾸지 않음). 새로 더한 지연·토큰·실패 기록에는 본문이 없다.
  - T4 출처 검수는 형식 위반(비배열·비정수·옛 `sourceQuotes`)을 계속 실패로 두고, 범위 밖 인덱스·원문에 없는 인용만 버린다.
  - 전송 후 결과 포커스(T6)는 소스 계약 테스트로만 확인했다 — 실제 요청은 Gemini 비용과 운영 DB 쓰기가 생겨 보내지 않았다.

