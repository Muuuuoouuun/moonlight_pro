# Sales OS — AI 팀 운영 레이어 (v1.3) 설계

> Status: 사용자 승인(브레인스토밍 5문항 결정 완료) · 2026-06-18
> 운영자: 문준혁 (ClassIn B2B 세일즈, ownerId 3935704427463307)
> 선행: `docs/sales-daily-loop-playbook.md`(2팀 v1), `docs/sales-os-direction.md`(방향 SSOT)

## 1. 문제

세일즈 실제 업무(업무파악·오더 / 세일즈 / 마케팅 / 브랜딩 / 콘텐츠 / 제작 / 검수)를
AI 페르소나 팀으로 나눠 운영하고, 흩어진 자잘한 데이터를 결합해 페르소나가 쓰게 한다.
기존 `/morning` 2팀 루프와 정적 `agents.jsx` mock을, 실제 업무에 도움 되는 운영 레이어로 발전.

확정 사실(메모리/플레이북): 세일즈 모션 = 콘텐츠→인스타/스레드 DM→전화→방문→카톡(이메일 0).
최대 잡무 = 팔로업. 콘텐츠 병목 = 소재/아이디어 + 발행 꾸준함(초안·디자인 아님). LTV 보류, 신규 계약 집중.

## 2. 핵심 결정 (브레인스토밍)

| # | 질문 | 결정 |
|---|------|------|
| 1 | 페르소나 형태 | **지침 SSOT + Claude Code 오케스트레이션** (per-persona 키 없음, Codex 게이트) |
| 2 | 역할 맵 | 검수 = 내부 셀프리뷰 + Codex / 오더 = 지휘 페르소나 |
| 3 | 활성화 | **오더가 건별 선택 활성화** (매 건 전부 fan-out 금지) |
| 4 | 데이터 결합 | **루프마다 조립되는 360 컨텍스트 팩** (소스 제자리, 신규 저장소 0) |
| 5 | 팀 구성 | **5개 = 오더·세일즈·콘텐츠·제작·검수** (마케팅·브랜딩 흡수) |
| 6 | 첫 증분 범위 | 오케스트레이션(지침·스파인·커맨드) 먼저 커밋·푸시. Hub UI는 나중. 코드는 별도 빌드. |

## 3. 아키텍처

`team-operating-layer.md`의 다이어그램 참조. 3계층:

1. **소스(제자리):** Supabase 레저 · eeoCRM(MCP) · 시트 · 명함 · 소셜(수기) · classin_home(읽기) · classmoon 브랜드.
2. **360 스파인:** 오더가 루프마다 entity 기준으로 조각을 당겨 `operating_context`로 정규화. 실패 소스 = `missing[]`, 루프 계속. (`context-spine.md`)
3. **페르소나(지침 SSOT) + 지휘(Claude Code):** `/team`이 registry·personas·spine을 읽어 선택 활성화 fan-out → 검수/Codex 게이트 → 큐|needs_human.

### 페르소나 합성 계약
각 페르소나는 자기 슬라이스만 입력받고 타입드 블록을 출력 → 오더가 merge. 스키마는 `_contract.md` FROZEN.
- 오더 → `work_order[]`
- 세일즈 → `{ next_action, objection, followups[] }`
- 콘텐츠 → `{ ideas[], cadence_note, today_pick }`
- 제작 → `{ channel, format, skeleton, thread_split?, notes }`
- 검수 → `{ internal_review, gate, codex_verdict?, disposition, reasons[] }`

### 게이트 (품질 공식)
독립 모델(Codex) × 다중 렌즈(정확성·톤·컴플라이언스) × 사람 게이트(되돌릴 수 없는 행동만).
one-way door=사람 / 아웃바운드 카피=Codex / 내부=자동. 결과 = pass|fail|error|needs_human, 드롭 0.
Codex 타임아웃/에러 = needs_human 강등. 자동 발송 금지.

## 4. 격리·경계

- **오더**: 조립·트리아지·라우팅만. 생산 안 함.
- **세일즈/콘텐츠/제작**: 생산만, 발송 안 함.
- **검수**: 판정만, 발송 안 함.
- **실행(발송)**: 항상 사람. 코드/AI 경로에 없음.
각 페르소나는 `operating_context` 슬라이스라는 단일 인터페이스로만 소통 → 내부를 바꿔도 합성이 안 깨짐.

## 5. 산출물

- 지침·문서(이번 커밋): `docs/sales-os/**`(contract·personas·spine·overview·registry) + `.claude/commands/team.md`.
- 코드(별도 빌드, §6 플랜): 360 조립기 모듈, registry 로더, (나중) Hub `agents.jsx` 배선.

## 6. 범위 밖 / vNext

- 전용 광고/마케팅 작업(채널 광고비) — classin_home 읽기 통합은 vNext.
- 소셜 인게이지먼트 API 수집 — v1은 수기(The Assignment).
- Hub `agents.jsx` 실데이터 배선 + 오프팔레트 색상 수정 — Phase 3.
- 데일리 cron 자동 트리거 — 포화 증명 후(Phase 3).

## 7. 열린 질문

- `/team` 토큰 상한(상위 N 기본 3)이 실제 포화에서 충분한가 — 4주 운영 후 조정.
- 360 조립기를 moonlight 어느 레이어에 둘지(Hub repo vs Engine) — 빌드 시 결정.
