# Report Insight Content Quality Implementation Plan

> For agentic workers: use subagent-driven-development with independent file ownership and verification-before-completion. This is a content-quality change to the existing connected flow.

**Goal:** 정확한 사실에서 독자의 판단·다음 행동으로 이어지는 보고서와 브랜드 인사이트를 생성하고 읽는다.
**Architecture:** 기존 Office 초안/검수와 research paid claim을 유지한다. 서버 주간 비교와 명시적인 지표 근거를 입력에 넣고, 브랜드 원문 대조 검수를 추가하며 기존 안전 Markdown 표시를 재사용한다.
**Tech Stack:** JS/TS, existing Next/Supabase RPC, Gemini, node test.

## 1. 서버 주간 근거 (root)
- [x] `office-workflow-context.test.mjs`에 동일 scope/timezone/직전7일, 비교 실패 시 현재 유지, hash에 이전 값 반영 테스트를 추가해 실패를 확인한다.
- [x] `weekly-report-analysis.js`에서 canonical labels/units, nullable comparison, 0 baseline/no ratio를 구현한다. `getOfficeWorkflowContext`에 이 helper와 직전 주 읽기를 연결한다.
- [x] 기존 scope/24KiB/sourceRef/hash 계약과 targeted tests를 통과시킨다.

## 2. 주간 보고서·읽기 (report agent)
- [x] 실제 오독/무근거 원인을 대상으로 Office prompt/review와 렌더·투영 회귀 테스트를 작성·확인한다.
- [x] 분리된 weekly writing policy와 필요한 bounded grounding check를 구현한다. Company/Personal의 판단 차이를 명시하고 기존 고객 답장/freeform에 영향이 없도록 한다.
- [x] Office 원본의 불확실성·이견·다음 행동·artifact kind를 보존하고 기존 안전 Markdown renderer를 재사용한다. 실제 원문 복사 유지·HTML/link 안전성·레거시 호환을 검증한다.

## 3. 연구 인사이트 (research agent)
- [x] source의 조건/분모/일정/제품 가용성/발표자 귀속을 보존하는 편집 prompt와 검수 단계의 회귀를 작성한다.
- [x] 승인 metadata whitelist와 브랜드별 독자 판단 기준, 한 논지의 원고 계약을 구현한다.
- [x] 원문 대조 편집 1회 후 인용 validator를 적용한다. 유료 자동 retry 없이 두 호출의 실제 usage 합산·실패 보존을 구현하고 시간 예산을 맞춘다.
- [x] claim 재발급 0·모델 불확실성 유지·원문 quote 범위와 원장 회귀를 검증한다.

## 4. 실제 대조·운영 (root/auditor)
- [x] 실제 3원문과 개인/회사 완료 주간 고정 packet으로 생성해 평가한다. 오래된 저장 결과를 덮어쓰지 않는다.
- [x] rubric에 원문 대조·판단 유용성·대안·행동·한국어 문장 기준을 두고 baseline과 candidate의 문장별 문제를 기록한다.
- [x] 전체 tests/typecheck/contracts/build/audit 및 필요한 DB check를 실행한다.
- [ ] 운영 배포·인증 API/실제 본문 읽기·main 통합을 검증하고 내용 중심 완료 기록을 전달한다.
