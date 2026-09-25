# 10시간 변경·통합 점검과 메모·프로젝트 정리 큐

> 점검 창: 2026-09-25 19:35:06–2026-09-26 05:35:06 KST. Git의 모든 로컬 참조와 등록된 워크트리를 읽었다. 이 기록은 실행 시점의 스냅샷이며 제품 결정이나 운영 DB 적용 지시가 아니다.
> 문서 우선순위: [문서 지도](../README.md) §1, [운영자 프로필](../operator-workflow-profile.md), 해당 주제의 최신 확정 스펙. `확정`·`권장`·`미정`을 구분한다.

## 변경 흐름

| 흐름 | 창 안의 근거 | 확인한 상태 |
| --- | --- | --- |
| DB·요청 최적화 | `d91e6beb`, `32ec1c37` | Daily Brief 조회 왕복 42→32, 넓은 select 축소, 중복 fetch 억제, 일일 리뷰 시간대 검사·DB 위생 변경이 `09.bigmac1.3`에 통합됐다. 왕복 횟수 개선은 운영 p95 개선 실측이 아니다. |
| Guru·Office·Agent | `66606c16`, `12f22b64`, `ac8cc3fc`, `2c5e9603`, `fb023335` | Guru 작업과 Office V4·클라이언트별 Agent 식별·거래 두 보기를 `09.bigmac1.5`에 합친 선행 병합이 있었다. Agent 동작은 [계층 방향](../superpowers/specs/2026-09-24-agent-layer-direction.md)의 자동 실행 금지를 따른다. |
| 펫·빠른 메모 | `630a313f`, `38f8885c`, `718b69e4` | 완료 유예·알림 읽음, 연결 세션·메모 충돌 복구, ⌘Return 저장을 순차 보강했다. [안정화 기록](../superpowers/plans/2026-09-26-pet-stability.md)과 [편의성 기록](../superpowers/plans/2026-09-26-pet-comfort.md)을 중복 작성하지 않는다. |
| 거래 화면 | `097fb4ea`, `851fa93c` | 돈 보기 시안 B를 기본 브랜치의 펫 후속 변경과 함께 합쳤다. |

## 브랜치·워크트리 처리

- `09.bigmac1.5`는 먼저 `fb023335`에서 당시의 `09.bigmac1.3`을 병합했다. 그 뒤 `09.bigmac1.3`에 생긴 커밋 5개를 격리 통합 브랜치에 병합했다. Git 충돌은 없었고 기본 워크트리의 미커밋 파일은 포함하지 않았다.
- 기본 워크트리의 목표·프로젝트 UI, `DESIGN.md`, `docs/README.md`, 모바일 동반 앱 기획 초안은 점검 시점에 미커밋이었다. 진행 중인 편집이므로 내용 통합이나 문서 정본 갱신에 끌어오지 않았다.
- `codex/guru-dual-experience`는 이미 `09.bigmac1.5`의 조상이다. `bigmac13-local`은 이 창의 새 커밋이 없다. `main`은 프로덕션 브랜치로 그대로 둔다.
- `codex/opportunity-loop`의 `948a3ff2`는 아직 통합되지 않았다. 그 브랜치의 `docs/superpowers/plans/2026-09-25-opportunity-loop.md` 마지막 항목도 통합 선택 대기다. 해당 브랜치의 `20260925_0050_office_business_candidates.sql`은 현재 계열의 `20260925_0050_daily_review_timezone_check.sql`과 번호가 겹친다. 통합 전 최신 번호를 재확인해 번호와 참조를 조정하고, 관련 DB·권한 테스트 및 운영 DB 적용 여부를 확인해야 한다.
- `merge/0925-product-lens`는 별도 미통합 계열이다. [제품·개발 프로젝트 스펙](../superpowers/specs/2026-09-24-product-dev-projects-draft.md) §13에 0–2단계 코드 구현과 운영 DB `0049` 미적용이 적혀 있다. 이후 [제품 운영실](../superpowers/specs/2026-09-25-product-operations-room-design.md) §0의 B안 화면은 확정됐지만 나머지는 권장·미정이다. 이 두 상태를 함께 검토한 뒤 통합한다.

## 메모·프로젝트·최적화 다음 할 일

| 우선 | 상태 | 할 일과 완료 기준 | 정본·근거 |
| --- | --- | --- | --- |
| 1 | 확인 필요 | 기회 루프의 중복 `0050` 마이그레이션 번호를 바로잡고, 실제 적용 이력과 충돌하지 않는지 확인한 뒤 통합 대상을 결정한다. 브랜치의 AI 후보를 자동으로 프로젝트나 외부 메시지로 승격하지 않는다. | `codex/opportunity-loop:docs/superpowers/plans/2026-09-25-opportunity-loop.md`, 루트 `AGENTS.md`의 마이그레이션 규칙 |
| 1 | 진행 중 | 기본 워크트리의 목표·프로젝트 UI 미커밋 변경을 소유 작업에서 먼저 마무리·검증한다. 이번 병합에 실리지 않은 상태를 완료로 기록하지 않는다. | `apps/hub/components/hub/pages/goals.jsx`, `project-portfolio-workspace.jsx`, `docs/README.md`의 작업 트리 상태 |
| 1 | 확정 범위의 운영 준비 | 제품 카탈로그 0–2단계의 통합 여부와 `0049` 운영 DB 적용을 분리해서 판단한다. DB 적용은 스펙에 적힌 대로 운영자가 직접 진행하며, 실행 시 현재 `db:migrate -- --expect-ref` 계약을 사용한다. | [제품·개발 프로젝트 스펙](../superpowers/specs/2026-09-24-product-dev-projects-draft.md) §12–13 |
| 2 | 문서 정리 | [메모 1차 설계](../superpowers/specs/2026-09-12-memo-writing-reuse-and-analysis-design.md) §0의 “본문·기간 검색은 후속” 설명을 [2A 검색 구현 스펙](../superpowers/specs/2026-09-13-memo-discovery-and-analysis-design.md)과 맞춘다. 2B 선택 분석·결과 피드백은 여전히 DRAFT라고 남긴다. | 두 메모 스펙의 상태 헤더·§0·§4 |
| 2 | 권장·미정 | 프로젝트 상태·완료는 [09-24 확정 스펙](../superpowers/specs/2026-09-24-project-state-and-completion-clarity.md)을 따른다. [09-23 경험 제안](../superpowers/specs/2026-09-23-project-operator-experience-and-write-trust-design.md)의 월 평가·보관·저장 멱등성은 별도 결정과 원장 검증이 필요하다. | 두 프로젝트 스펙의 상태·관계 헤더 |
| 2 | 최적화 제안 | 조회 왕복 감소와 사용자 체감 속도를 분리해 본다. 목표 조회의 페이지 경계·큰 관측 이력, AI 비용·검토 시간, 운영 p95를 실제 기록으로 측정한 뒤 다음 최적화를 정한다. | [개인 OS 최적화 제안](../superpowers/plans/2026-09-21-personal-os-optimization-and-experience.md) §다음 개발 순서 — 미확정 |

[콘텐츠·기존 고객 정리 큐](2026-09-24-content-customer-cleanup-queue.md)의 고객·콘텐츠 항목은 이 표에 다시 복제하지 않는다. 개인 메모 원문이나 고객 식별 정보는 이 점검 기록에 읽거나 옮기지 않았다.

## 검증 범위

- 선행 `09.bigmac1.5`와 통합 결과에서 각각 루트 `npm test`: 3377 tests, 3364 pass, 0 fail, 13 skip. 건너뛴 검사는 테스트 DB 연결 조건이 있는 항목이다.
- 통합 결과의 펫 SwiftPM `swift build` 성공. 병합 전 동일한 최신 펫 소스의 `test_pet_activity_store.sh`: 완료 8건, 활동·Council 14건 통과.
- 운영 DB 마이그레이션, 배포, 사용자 메모·프로젝트 데이터 쓰기는 실행하지 않았다.
