# Moonlight 문서 지도

> 상태: ACTIVE DOCUMENTATION INDEX
> 마지막 정리: 2026-07-16 (Phase 1C 상태 행만 2026-07-29 갱신)
> 목적: 같은 주제의 문서가 충돌할 때 무엇을 먼저 믿을지 고정한다.

## 1. 읽는 순서와 우선순위

문서가 충돌하면 아래 순서가 우선한다.

1. [`operator-workflow-profile.md`](operator-workflow-profile.md) — 운영자 인터뷰 Q1~Q115의 사실·권장·미정
2. [`2026-07-13-moonlight-personal-operator-os-deep-design.md`](superpowers/specs/2026-07-13-moonlight-personal-operator-os-deep-design.md) — 현재 제품 구조와 Phase 0~1C 설계
3. **주제별 최신 확정 스펙** — §4 "제품·운영 정본"의 스펙 목록에서 해당 주제의 가장 최근 문서를 확인한다(예: 사이드바·PMS는 `2026-07-15-sidebar-second-level-and-pms-taxonomy.md`). 스펙 상단의 "상위 정본"·"관계" 헤더가 이전 스펙 중 어떤 절이 대체됐는지 명시하므로 함께 읽는다.
4. [`../DESIGN.md`](../DESIGN.md) — UI 토큰·컴포넌트·인터랙션 계약
5. [`master-directive.md`](master-directive.md) — 바뀌지 않는 제품 경계와 원칙
6. [`master-roadmap.md`](master-roadmap.md) — 현재 단계와 다음 구현 순서
7. 도메인별 문서 — 위 문서와 충돌하지 않는 범위에서 참고
8. `HISTORICAL` 또는 `SUPERSEDED` 문서 — 결정 배경만 참고하고 새 구현의 근거로 사용하지 않음

코드 작업 지침은 루트의 [`AGENTS.md`](../AGENTS.md)와 [`CLAUDE.md`](../CLAUDE.md)를 따른다. 브랜치명이나 특정 커밋은 제품 정본이 아니며, 작업 시점의 Git 상태를 직접 확인한다.

## 2. 2026-07-13 통합 결정

오늘 인터뷰와 기획에서 확정된 핵심은 다음과 같다.

- Moonlight는 문준혁 본인만 쓰는 개인 운영체제이며 판매·다중 사용자 SaaS가 아니다.
- 성공 기준은 인지 에너지를 현재의 약 1/3로 줄이고, 고객 연락·프로젝트 후속 누락을 0건으로 만드는 것이다.
- 첫 화면은 할 일, 매출, 메시지, 기획, 콘텐츠 순서의 판단을 돕고 긴급 KA 1건과 집중 고객 3~5건을 우선한다.
- 고객은 사람을 기본 단위로 보고 조직·거래·활동·다음 행동을 연결한다. 새 문의·재문의는 원칙적으로 새 Opportunity다.
- 초기 이관은 ClassIn/Neo CRM에서 가져오되, 이후 Moonlight가 개인 업무 정본이 된다. ClassIn에는 공식 요약만 승인 경계를 거쳐 보낸다.
- 모든 상세 개인 메모를 ClassIn으로 옮기지 않는다. 공식 기록은 기록 여부·일자·유형·간략 요약 중심이다.
- 캘린더는 첫 화면의 핵심 문맥이고 모바일은 후순위다. 이메일보다 메시지·전화가 우선이다.
- 프로젝트는 활동량, 가격 논의, 방문/데모, 두 번째 미팅 같은 신호로 후보를 추천한다. 자동 생성은 후보 확인 UI를 거친다.
- 콘텐츠는 떠오른 아이디어나 참고 콘텐츠에서 시작해 원본 하나를 스레드·인스타그램·유튜브 쇼츠 등으로 재가공한다. 복잡한 성과 분석은 후순위다.
- 추가 인터뷰는 Q116부터 한 번에 5개씩 재개하되, Phase 1 실사용 데이터나 운영자의 요청 전에는 멈춘다.

상세 답변과 예외는 요약문에 재복제하지 않고 [`operator-workflow-profile.md`](operator-workflow-profile.md)를 단일 원본으로 유지한다.

## 3. 현재 실행 상태

| 단계 | 상태 | 근거 |
|---|---|---|
| 인터뷰 Q1~Q115 정리 | 완료 | [`operator-workflow-profile.md`](operator-workflow-profile.md) |
| 전제 1~7 및 접근안 B | 승인됨 | 구현 지시와 Phase 0 착수 |
| Phase 0 신뢰 기준선 | 완료·푸시 | `5c9ccc2`, `codex/moonlight-phase0-trust` |
| Phase 1A Durable Task Loop | 완료 | project/task durable create·update·status·reload, 홈 Quick Capture의 task/work-order 두 destination, 공통 receipt의 duplicate/conflict, task-only Today 완료·재조회를 live 검증 |
| Phase 1B Action Desk | 부분 작동 | Daily Brief 6개 ledger와 owner-verified 집중 고객 3건은 live. 정식 Attention adapter, Calendar agenda, source timeout/partial 계약은 남음 |
| Phase 1C Contact Outcome Loop | 부분 작동 | `record_contact_outcome_v1` 원자 RPC(마이그레이션 `20260716_0018`)와 고객 DB 컨택 완료 시트는 live. 고객 연락(followups) 인라인 폼은 여전히 비원자 `outreach_outcomes` 단건 insert 경로를 사용 — 두 경로 중 정본 화면은 미정(2026-07-29 운영자 확인) |
| ClassIn 전체 동기화·음성 AI·콘텐츠 직접 발행 | 보류 | 별도 하드 게이트 필요 |

Phase 0는 Content canonical contract, write 응답 분류, honest empty/error UI, 사용자 identity, Content 승인 원자화를 포함한다. 당시 검증 기준선은 Node test 50/50, contract check, typecheck, Hub/Engine build 통과다. 2026-07-15 현재 저장소 검증은 102/102이며 Phase 1A 완료를 뜻한다. Phase 1B·1C는 아직 남아 있으므로 Phase 1 전체 완료로 해석하지 않는다.

## 4. 현재 문서

### 제품·운영 정본

- [`operator-workflow-profile.md`](operator-workflow-profile.md) — 운영자 업무 사실과 인터뷰 원본
- [`superpowers/specs/2026-07-13-moonlight-personal-operator-os-deep-design.md`](superpowers/specs/2026-07-13-moonlight-personal-operator-os-deep-design.md) — 활성 제품 설계
- [`master-directive.md`](master-directive.md) — 제품 불변식
- [`master-roadmap.md`](master-roadmap.md) — 단계와 다음 순서
- [`../TODOS.md`](../TODOS.md) — 아직 하지 않을 일과 남은 기술 부채

**사이드바 IA · PMS 분류 (최신순, 확정 스펙만 정본)**

- [`superpowers/specs/2026-07-15-sidebar-second-level-and-pms-taxonomy.md`](superpowers/specs/2026-07-15-sidebar-second-level-and-pms-taxonomy.md) — **확정(2026-07-15)**. 사이드바 2레벨 아코디언 + PMS 분류 체계 정본. `2026-07-14` 8앵커 IA는 유지하되 하위 레벨 노출 방식을 이 문서가 규정한다.
- [`superpowers/specs/2026-07-15-personal-os-surface-restoration-design.md`](superpowers/specs/2026-07-15-personal-os-surface-restoration-design.md) — §3~4(5앵커+More 내비게이션 안)은 위 문서로 대체되어 **채택하지 않음**. §5(Personal 스코프 데이터 계약)·§6(구조적 화면 복구)는 별도로 유효.
- [`superpowers/specs/2026-07-14-sidebar-consolidation-design.md`](superpowers/specs/2026-07-14-sidebar-consolidation-design.md) — 8앵커 압축 + 스코프 셸. 하위 레벨이 통째로 사라진 부분은 위 07-15 분류 스펙 문서가 보완.

### 아키텍처·데이터 정본

- [`supabase-first-operating-ledger.md`](supabase-first-operating-ledger.md)
- [`supabase-db-strategy.md`](supabase-db-strategy.md)
- [`integration-inventory.md`](integration-inventory.md)
- [`projects-connection-inventory.md`](projects-connection-inventory.md)

### 도메인 참고

- Sales OS: [`sales-os-direction.md`](sales-os-direction.md), [`sales-os/`](sales-os/), [`sales-daily-loop-playbook.md`](sales-daily-loop-playbook.md)
- Content OS: [`content-os-deep-plan.md`](content-os-deep-plan.md)
- Hub/Engine 경계: [`engine-os-separation-ui-plan.md`](engine-os-separation-ui-plan.md)
- 실행 backlog: [`engine-priority-todo.md`](engine-priority-todo.md), [`hub-design-priority-todo.md`](hub-design-priority-todo.md)

도메인 문서가 개인 운영 OS 심화 설계와 충돌하면 심화 설계를 따른다. 특히 과거의 “ClassIn CRM을 읽기만 한다”는 전제는 오늘 확정한 “최초 이관 후 Moonlight 개인 정본 + 공식 요약 outbox” 경계로 대체한다.

### 보류된 기능 설계

- Agent/Council: [`agent-tab-mvp-ui-spec.md`](agent-tab-mvp-ui-spec.md)
- Daily note/Obsidian: [`daily-operating-note-todo.md`](daily-operating-note-todo.md)
- GitHub Work OS: [`github-workos-mvp-mockup.md`](github-workos-mvp-mockup.md)
- Sales Guru: [`sales-guru-mentor-agent-plan.md`](sales-guru-mentor-agent-plan.md)
- ClassIn CRM 결합: [`sales-os-crm-integration-plan.md`](sales-os-crm-integration-plan.md) — 문서 자체가 보류 상태이며 새 정본 경계를 먼저 적용
- AI Sales 팀 운영: [`sales-os/team-operating-layer.md`](sales-os/team-operating-layer.md), [`sales-os/personas/`](sales-os/personas/)

이 문서들은 폐기된 것은 아니지만 현재 Phase 1B·1C보다 먼저 구현하지 않는다.

### 지식·운영 참고

- 세일즈/마케팅 지식: [`sales-guru-knowledge-base.md`](sales-guru-knowledge-base.md), [`sales-decision-styles.md`](sales-decision-styles.md), [`marketing-branding-gurus.md`](marketing-branding-gurus.md)
- 도구 사용 가이드: [`claude-code-skills-guide.md`](claude-code-skills-guide.md)
- 생성 인벤토리: [`projects-connection-inventory.md`](projects-connection-inventory.md), [`projects-connection-payloads.json`](projects-connection-payloads.json)

## 5. 구현 기록

- `5c9ccc2` — Phase 0 신뢰 기준선 구현·검증·푸시
- `docs/superpowers/plans/2026-07-13-phase0-trust-repair.md` — Phase 0 구현 체크리스트(`codex/moonlight-phase0-trust` 브랜치에 존재)
- [`superpowers/plans/`](superpowers/plans/) — 특정 기능의 실행 기록
- [`superpowers/specs/`](superpowers/specs/) — 승인 당시의 상세 설계와 결정 배경

구현 기록은 당시 사실을 보존한다. 완료 후에는 현재 로드맵을 대신하지 않는다.

## 6. 과거 참고 문서

다음 문서는 삭제하지 않되 새 구현의 정본으로 사용하지 않는다.

| 문서 | 이유 | 현재 대체 문서 |
|---|---|---|
| [`master-plan.md`](master-plan.md) | 2026-05 autoplan 전체 검토 기록, 현재 상태·브랜치가 오래됨 | 심화 설계 + master roadmap |
| [`superpowers/specs/2026-07-13-claude-current-vs-operator-os-comparison.md`](superpowers/specs/2026-07-13-claude-current-vs-operator-os-comparison.md) | Phase 0 전 코드 감사 스냅샷 | Phase 0 커밋 + 심화 설계 |
| [`hub-tab-mvp-ui-spec.md`](hub-tab-mvp-ui-spec.md) | 과거 라우트 중심 UI 사양 | 심화 설계 + DESIGN.md |
| [`claude-notion-hybrid-ui-plan.md`](claude-notion-hybrid-ui-plan.md) | 폐기된 warm/green/public 시각 전제 포함 | DESIGN.md |
| [`frontend-execution-plan.md`](frontend-execution-plan.md) | public detach 전후의 과거 실행 계획 | master roadmap |
| [`design-guidelines.md`](design-guidelines.md) | light/white 중심의 구 디자인 토큰 | DESIGN.md |
| [`brand-efficiency-operating-model.md`](brand-efficiency-operating-model.md) | 2026-05 office-hours DRAFT | 운영자 프로필 + 심화 설계 |
| [`detail-tab-ui-overhaul-prep.md`](detail-tab-ui-overhaul-prep.md) | 특정 UI 개편 준비 기록 | DESIGN.md + 현재 Phase 설계 |

## 7. 정리 규칙

- 같은 답변을 새 문서에 반복하지 않는다. 운영자 사실은 프로필, 제품 계약은 심화 설계, 순서는 로드맵에만 적는다.
- 구현이 끝나면 설계 문서의 상태와 TODO를 함께 갱신한다.
- 과거 문서는 배경 근거가 있으면 보존하되 상단에 `HISTORICAL` 또는 `SUPERSEDED`를 표시한다.
- 현재 사실처럼 보이는 오래된 브랜치명, 승인 대기, 실패 테스트 수치는 제거하거나 날짜가 있는 스냅샷으로 바꾼다.
- 개인정보 원문과 개인 캘린더 URL은 저장소 문서에 복사하지 않는다.
