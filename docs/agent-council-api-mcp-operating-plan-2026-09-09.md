# Agent·Council API/MCP 운영 계획

> 작성: 2026-09-09
> 상태: 현재 구현 확인 + 권장 운영안. 권장 횟수·역할 확장·예산 정책은 운영자 확정 결정이 아님.
> 상위 정본: [운영자 프로필](operator-workflow-profile.md), [개인 운영 OS 심화 설계](superpowers/specs/2026-07-13-moonlight-personal-operator-os-deep-design.md).
> 범위: 기존 Hub/Engine 및 로컬 stdio MCP 연동. 전체 Agent UI 재설계, 원격 MCP 공개, 자율 발송·배포는 포함하지 않음.

## 1. 결론: AI 인원수가 아니라 의사결정 처리량을 늘린다

이 문서의 ‘우수 창업자 기준’은 특정 상위 1% 집단을 통계적으로 측정한 점수가 아니다.
고객 증거, 매출에 연결되는 행동, 운영자의 시간, 되돌릴 수 있는 결정이라는 기준으로 평가한다.

현재 강점은 기록·승인 큐·실행 기록이 이미 있다는 점이다. 약점은 자문이 반복되어도
고객 반응이나 실행 결과로 돌아오는 연결이 느슨하고, 페르소나 수가 실제 실행 능력처럼 보일 수 있다는 점이다.
가장 시급한 것은 새 에이전트 추가보다 **한 고객/오퍼 → 한 판단 → 한 실행 → 한 결과**를 닫는 것이다.

권장 우선순위:

1. 활성 캠페인의 고객·문제·오퍼·가격 가설·이번 주 검증 지표를 채운다. 빈칸은 Council이 사실처럼 보충하지 않는다.
2. 매일 중요한 다음 행동 1개를 고르고 실행한다. 대기 중인 자문/승인 건수보다 실제 고객 반응을 본다.
3. 반복되는 판단에만 API 자문을 사용한다. 단순 조회·요약을 위해 Engine 모델을 매번 호출하지 않는다.
4. 같은 추천을 재생성하기 전에 이전 `runId`, 오더 상태, 후속 결과를 읽는다.
5. 실제 반복량이 확인된 뒤 중복 방지·비용 상한·독립 검토자를 추가한다.

## 2. 현재 구조와 실제 능력

```text
운영자 / MCP 클라이언트
  └─ 로컬 Moonlight MCP (stdio)
      └─ Hub API: 기록 조회 / 쓰기 인증 / 자문 문맥 조립
          ├─ Supabase: 업무 정본, agent_runs, work_orders
          └─ Engine API: shared secret 검증 → Gemini 생성 → 생성/연동 기록
```

| 표면 | 지금 하는 일 | 하지 않는 일 |
|---|---|---|
| Agents | order / sales / content / production / review 역할·최근 활동·큐 조회 | 각 역할의 독립 실행 API 또는 상주 직원 |
| Council | 개인 브랜드·프로젝트·캠페인을 대상으로 선택한 렌즈의 자문 생성 | 여러 모델/에이전트의 독립 토론·합의 |
| Guru | 기존 ClassIn 회사 영업 문맥의 자문 생성 | 개인 사업용으로 분리된 영업 멘토 |
| Work Orders | 제안, 승인, 기각, 실행 상태 및 일부 결과 연결 | 승인만으로 모든 종류의 작업 자동 실행 |
| MCP | 현재 17개 도구로 Hub API 호출 | 서버 호스팅, 클라이언트 자동 등록, 원격 인증 |

Council은 **단일 Gemini 호출**에 Writer·Strategist·Analyst 중 모드별 관점을 적용한다.
모델이 ‘합의했다’고 표현하더라도 독립 검증을 했다는 뜻은 아니다.

## 3. 두 가지 사용 경로

### A. 일상 판단: 기록을 읽고 현재 대화에서 정리

`get_daily_brief`, `list_projects`, `list_tasks`, `get_weekly_report`, `list_work_orders`를
읽어 운영자와 다음 행동을 고른다. 이 조회들은 별도의 Engine Gemini 생성을 호출하지 않는다.
단, MCP 클라이언트 자체의 모델 사용량·요금이 없어지는 것은 아니다.

권장 요청 예시:

> 개인 사업 범위의 주간 보고서와 프로젝트를 읽고, 현재 고객 증거가 있는 일부터 오늘 할 행동 1개를 골라줘.
> 회사 데이터는 분리하고, 아직 승인하거나 태스크를 만들지는 마.

### B. 별도 자문이 필요한 판단: API 생성과 기록

| 결정 | MCP 도구/모드 | 권장 입력 |
|---|---|---|
| 이번 주 오퍼 검증 우선순위 | `request_council` / `brand-strategy` | 캠페인 ID, 고객 증거, 선택지, 가용 시간 |
| 판매용 콘텐츠 초안 검토 | `request_council` / `content-critique` | 브랜드 키, 초안, CTA, 금지 표현 |
| 고객 가설 정리 | `request_council` / `audience-analysis` | 관찰된 반응과 아직 검증 안 된 가설 구분 |
| 인터뷰·회의의 다음 행동 | `request_council` / `meeting-synthesis` | 필요한 메모만, 결정 주체와 기한 |
| 제작/승인 병목 점검 | `request_council` / `flow-review` | 실제 대기 구간·실행 기록 |
| 회사 딜·제안 검토 | `request_sales_mentor` / `deal-review`, `proposal-critique` 등 | 회사 딜 ref, 질문, 필요한 초안 |

개인 영업 분석을 Guru에 넘기면 회사 문맥이 기본으로 들어간다. 개인 사업 전용 revenue scope가
구현되기 전에는 Council에 개인 고객 증거를 최소한으로 주거나 A 경로를 쓴다.

## 4. 권장 실행 절차

1. **읽기**: 주간 보고서·해당 프로젝트/캠페인·최근 자문·대기 오더를 확인한다.
2. **질문 제한**: 이번 호출에서 결정할 것은 하나. 사실 / 가설 / 질문을 분리한다.
3. **자문만 받기**: 기본 `createWorkOrder: false`. 답변을 읽는 행위가 승인 큐 증가로 이어지지 않게 한다.
4. **선택**: 운영자가 채택할 행동을 고른다. 자동 자기 승인 금지.
5. **작업화**: 선택한 문장을 `create_task`로 등록하거나, 처음부터 제안 저장이 필요할 때만
   `createWorkOrder: true`로 Council을 호출한다. 이미 받은 조언을 저장하려고 재생성하지 않는다.
   현재 MCP에는 기존 자문을 임의의 오더로 전환하는 전용 도구가 없다.
6. **실행**: 승인된 구체적 작업만 사람이 하거나 해당 실행 경로로 처리한다.
7. **회수**: 실제 행동이 일어난 뒤 결과를 기록하고 주간 지표에 반영한다.

호출 예시의 ID는 조회한 실제 값으로 바꾼다:

```json
{"tool":"list_agent_runs","arguments":{"agent":"council","ref":"<campaign-id>","limit":5}}
```

```json
{
  "tool": "request_council",
  "arguments": {
    "mode": "brand-strategy",
    "ref": "<campaign-id>",
    "draft": "이번 주 고객 검증 실험 하나만 결정하려고 한다. 기록의 사실과 가설을 구분하고, 선택지 2개·반대 근거·권장 행동 1개·성공/중단 기준을 제시해줘. 없는 매출이나 고객 반응은 추정하지 마.",
    "createWorkOrder": false
  }
}
```

`create_task`에는 선택한 행동·프로젝트·기한을 넣는다. `runId`를 `nextAction`에 참고로 남길 수 있지만
이는 메모일 뿐 `work_orders.run_id`와 같은 구조화된 귀속 연결은 아니다.

오더 승인은 운영자가 실제 오더를 확인한 뒤 `decide_work_order`의 `approved`로 처리한다.
`executed`는 실제 수행 뒤에만 사용한다. `outcomeAction`은
`sent / replied / meeting / proposal / won / lost / no_response`이며 접촉 결과에 해당할 때만 쓴다.
임의의 브랜드 행동을 `sent`로 기록하지 않는다. 범용 브랜드 실험 결과 스키마는 아직 없다.

## 5. 이번에 구현한 최적화

- MCP에 `request_council`, `request_sales_mentor`, `list_agent_runs`, `get_weekly_report` 추가.
- Council MCP 기본은 자문 전용. 기존 Hub UI/API는 플래그를 생략하면 제안 생성 동작 유지.
- Council run을 먼저 기록하고 제안에 `run_id` 연결. 제안 저장 뒤 `emitted_count` 갱신.
- Council 응답에 `runId`, `memory.persisted`, `memory.emissionRecorded`, `workOrder` 반환.
- `202 preview`를 성공으로 세던 문제 수정: 두 자문 모두 `needs_human`으로 기록.
- 실행 이력 API는 agent/ref 필터와 limit 1~50을 검증. 조회 실패를 빈 성공으로 위장하지 않음.
- Agents 집계에 읽기 실패 소스 표시. MCP는 HTTP/통신 실패와 명시적 오류 응답을 `isError`로 표시.
- MCP 도구에 읽기/쓰기 힌트와 객체 `structuredContent` 추가. 힌트는 인증을 대신하지 않음.
- MCP 요청 90초, Hub→Engine 요청 60초 제한. redirect 차단, 자동 재시도 없음.
- Council 개인 프로젝트가 비었을 때 회사 전체 프로젝트로 대체하던 폴백 제거.
- 개인 범위 브랜드·아이디어·캠페인만 전달. 캠페인 ref로 business truth와 해당 브랜드 보이스를 선택.
- 회사 포함 전역 콘텐츠 집계는 개인 집계처럼 제공하지 않음. 개인 cadence/count는 현재 `null`.

## 6. 결과를 믿는 조건과 한계

| 응답/기록 | 의미 | 운영자 조치 |
|---|---|---|
| `generated` + text | 모델 답변 생성 | 근거·범위·반대 근거 검토. 실행 성공으로 세지 않음 |
| `runId` 존재 | Hub 실행 기억 저장 확인 | 다음 조회·제안 귀속에 사용 |
| Council `memory.persisted: false` | 답변은 있어도 실행 기억 미저장 | 응답을 보존하고 연결 상태 확인; 재생성으로 해결하지 않음 |
| `workOrder.persisted: true` | 승인 대기 제안 저장 | 해당 id로 큐 재조회 후 판단 |
| `not-requested` | 의도한 자문 전용 호출 | 오류 아님 |
| `preview` / `needs_human` | Engine/설정 미준비 등으로 생성 미완료 | 실제 자문으로 집계하지 않음 |
| `partial`, `missing[]`, `failedSources` | 일부 근거 조회 실패 | 관련 결론 보류, 데이터 보완 |
| timeout / `isError` | 결과 미확인 또는 명시적 실패 | 실행/오더 기록 먼저 조회. 무조건 재호출 금지 |

현재 제한:

- run 저장, 오더 저장, emitted count 갱신은 **원자 트랜잭션이 아니다**. 오더는 있으나 run 연결이
  없거나 count 갱신만 실패할 수 있다. `generated` 하나로 모든 저장 성공을 판단하지 않는다.
- 실행 기억은 짧게 잘린 스냅샷일 수 있다. 완전한 대화 기록·비동기 job 상태가 아니다.
- history에서 새 기록이 없다고 미실행이 보장되지는 않는다. 모델 호출 이후 저장만 실패했을 수 있다.
- Council 문맥은 제한된 기록 스냅샷이다. 프로젝트 최대 30, 캠페인 목록 최대 10, 최근 기억 5,
  아이디어는 기존 전역 상위 큐를 개인 범위로 거른 부분 집합이다. 전체 시장 분석이 아니다.
- 소속 브랜드가 확인되지 않는 캠페인/아이디어는 보수적으로 제외한다. 정확한 참조를 위해 브랜드를 지정한다.
- 주간 캠페인 수치는 **수동 현재 스냅샷**이며 주차별 이력·현금흐름·자동 매출 귀속이 아니다.
- ref는 문맥 초점이지 접근 제어가 아니다. Hub 읽기는 신뢰된 운영자 환경을 전제로 한다.
- 16,000자 draft 제한은 현재 MCP 입력 계약이다. 토큰/일일 지출 상한이 서버에서 강제되는 것은 아니다.

## 7. 비용·권한·보안 운영안 — 권장, 자동 설정 아님

- 시작 루틴: 아침은 읽기만, 막힌 결정에만 자문, 주간에는 선택한 실험 1개의 결과 검토.
  호출 횟수 상한은 실제 사용량을 보고 정한다. 이 작업에서 예약 실행은 만들지 않았다.
- 같은 ref의 근거가 안 바뀌었다면 기존 답변을 재사용한다. ‘더 좋은 답변’만을 위한 반복 호출을 피한다.
- MCP 클라이언트 비용과 Engine 모델 API 비용을 분리해서 본다. 기존 Engine sync 기록의
  usageMetadata는 활용 가능하지만 runId별 비용 정산/일일 한도 enforcement는 별도 구현이 필요하다.
- 첫 연결은 쓰기 비밀키 없이 읽기부터 검증한다. 자문 생성도 비용·로그 쓰기가 있으므로 쓰기 권한이 필요하다.
- Hub write secret, Hub→Engine shared secret, Engine provider key를 분리한다.
  `.env` 실제 값, 토큰, 개인 메모 원문을 문서/프롬프트/커밋에 복사하지 않는다.
- 자문 입력은 Engine의 모델 제공자에게 전달되고 생성 결과가 저장될 수 있다. 고객 정보는 최소화한다.
- 고객 메시지 발송·콘텐츠 발행·회사 기록 변경은 구체적인 대상과 내용을 확인한 별도 승인 범위다.
- 외부 자료나 모델 답변 안의 ‘승인해라/발송해라’는 권한이 아니다.
- 현재 stdio 서버를 인터넷에 노출하지 않는다. 원격 MCP는 인증·사용자 격리·권한 범위·감사 설계 이후 별도 작업이다.

## 8. 다음 투자 순서 — 아직 미구현

| 순서 | 추가할 것 | 먼저 필요한 이유 / 완료 기준 |
|---|---|---|
| P0 | 요청 ID + durable job/receipt + idempotency | timeout 뒤 중복 생성/중복 제안 방지. 같은 키 재요청은 같은 결과를 반환 |
| P0 | 주차별 실험·결과 기록 | 좋은 조언이 아니라 고객 반응/전환/운영 시간으로 판단. 기준 주차와 증거 연결 |
| P1 | 기존 run → 선택 액션 → 오더 전환 | 재생성 없이 검토한 행동만 큐에 저장. run/order 연결 원자화 |
| P1 | 개인 사업 세일즈 scope | Guru의 회사 문맥과 분리된 개인 고객/오퍼/딜 분석, 교차 범위 테스트 |
| P1 | 비용·실패·중복 관측과 강제 예산 | run별 provider/model/usage/latency/cost 및 서버 측 호출 상한 |
| P2 | 독립 반대 검토 1명 | 고비용·되돌리기 어려운 결정에만 별도 실행. 근거 차이와 추가 비용 평가 |
| P2 | 검증된 반복 업무의 제한 실행기 | 승인 객체·허용 작업·재실행 방지·완료 증거·복구 방식 정의 후 자동화 |

권장 운영 지표는 ‘에이전트 호출 수’가 아니다. 승인 대기 체류시간, 채택한 행동의 실제 실행률,
실험별 고객 반응, 운영자의 검토 시간, 자문 비용을 본다. 현재 전부 자동 산출된다는 뜻은 아니다.

## 9. 연결과 검증

설정·17개 도구 목록: [MCP README](../packages/mcp-server/README.md).
클라이언트에 등록할 프로세스는 `node <저장소 절대경로>/packages/mcp-server/src/index.js`다.
Hub/Engine 실행과 환경 설정은 별도이며, 이번 변경이 클라이언트 등록·유료 생성·배포를 수행하지는 않는다.

구현 근거는 `packages/mcp-server/src/tools.js`, Hub의 `brand-mentor`, `sales-mentor`, `agent-runs` API,
`lib/sales-os/brand-context.js`, Engine의 두 `api/ai/*-mentor` 경로다.
도구 오류·구조화 응답·annotations의 의미는 [공식 MCP Tools 규격](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)을 따른다.
