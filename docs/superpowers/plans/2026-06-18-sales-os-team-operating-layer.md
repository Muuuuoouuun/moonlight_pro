# 구현 플랜 — Sales OS AI 팀 운영 레이어 (v1.3)

> 스펙: `docs/superpowers/specs/2026-06-18-sales-os-team-operating-layer-design.md`
> 지침 SSOT: `docs/sales-os/**`, 커맨드: `.claude/commands/team.md`
> 이 플랜의 코드 작업은 **별도 환경에서 빌드**. 지침·문서는 이미 커밋됨.

## 원칙
- 지침(`docs/sales-os/**`)이 SSOT. 코드는 그것을 **읽어 실행**할 뿐, 로직을 중복 정의하지 않는다.
- 소스는 옮기지 않는다. 360은 **루프마다 조립**(영속 저장소 신규 0). outcome만 기존 `outreach_outcomes`에 남긴다.
- 기존 패턴 따름: Hub read는 `apps/hub/lib/repositories/`, Google은 raw fetch REST, eeoCRM은 MCP.

---

## Phase A — 오케스트레이션만 (코드 0, 지금 가능)
`/team` 커맨드 + 지침 파일만으로 수동 운영 가능. **이미 완료(이번 커밋).**
- [x] `docs/sales-os/**` 지침·스파인·레지스트리·오버뷰
- [x] `.claude/commands/team.md`
- [ ] 첫 실행: `/team 1` 정체 딜 1건 끝-to-끝 + The Assignment(반응 글 3+2)

---

## Phase B — 360 조립기 + 레지스트리 로더 (코드, 별도 빌드)

### Task B1 — registry 로더
- `apps/hub/lib/sales-os/persona-registry.js`: `personas/registry.json` 로드 → `{personas, gates, activation}` 노출.
- 검증: 5 페르소나 id·file 경로 존재, 게이트 규칙 파싱. `check:registry` 셀프테스트.

### Task B2 — 360 컨텍스트 조립기 (핵심)
- `apps/hub/lib/sales-os/context-assembler.js`: `assembleContext(item) -> operating_context`.
  - `_contract.md`의 FROZEN 스키마 필드명 그대로 반환.
  - 소스별 fetch + `missing[]` 처리(소스 실패 = 스킵+사유, throw 금지):
    - Supabase: 기존 `repositories/`(leads·deals·contacts·content·outcomes) 재사용. 조인 키 = lead_id/contact_id/company.
    - eeoCRM: MCP `crm_account_360`/`crm_soql_query`(ownerId 필터). MCP 미연결 → `crm_facts=null` + missing.
    - 시트/명함: `repositories/sheets-sync.js`·`card-intake.js`, match_key.
    - 소셜: 수기 입력(v1) → `social_signals.manual_note`.
    - 브랜드: classmoon 규칙 정적 주입.
- 검증: 각 소스 mock으로 `check:context` — 조립 결과가 FROZEN 스키마 통과, 한 소스 실패 시 missing에 기록되고 나머지 정상.

### Task B3 — outcome sink 연결
- 기존 `repositories/outcomes-ledger.js`·`/api/integrations/outcomes/record` 재사용.
- `/team` 마감 단계가 `{lead_id, play, asset_id, action, at, note}`를 기록하도록 문서/커맨드 정합 확인(코드 변경 최소).

---

## Phase C — Hub 표시 (코드, 나중)

### Task C1 — agents.jsx 실데이터 배선
- 정적 mock 교체: `persona-registry`에서 5 페르소나 + 최근 `/team` 루프 결과(큐/needs_human 카운트) 표시.
- **DESIGN.md 준수:** 오프팔레트 색상 위반 수정(문스톤 토큰만). 보더 1px. 흰 배경 금지.
- `hub-data.js`의 `COUNCIL` 상수를 registry 기반으로 재정의(또는 deprecate).
- 검증: typecheck/build + preview 라이브(에러 0, 빈 상태 처리).

---

## Phase D — 졸업 (4주 후)
- 측정 성과(계약·발행) 낸 플레이만 Engine/Hub 코드로 졸업. cron 자동 트리거(서버 실행 검증 후).

## 리스크
- 360 조립기 토큰 비용: 상위 N=3 상한 유지. 소스 병렬 fetch.
- eeoCRM MCP 세션 만료(~2h): 미연결 graceful skip(이미 설계됨).
- classin_home은 읽기 전용 별도 레포 — 동기화 시도 금지(참고만).
