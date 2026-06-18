# 페르소나 지침 계약 (Persona Contract)

> 역할: 모든 페르소나 지침 파일(`00`~`04`)이 따르는 공통 형식 + 합성 규칙의 SSOT.

이 디렉터리의 각 페르소나 파일은 **하나의 역할**을 가지며, **잘 정의된 입출력**으로만 소통하고,
독립적으로 이해·테스트된다. Claude Code 지휘자(`/team`)가 이 파일들을 읽어 서브에이전트에 역할을 주입한다.

## 8섹션 형식 (모든 페르소나 파일 필수)

| # | 섹션 | 내용 |
|---|------|------|
| 1 | **역할** | 한 줄 정체성. 파일 맨 위 `> 역할: …` |
| 2 | **입력** | `operating_context`에서 읽는 슬라이스 (필드명 명시) |
| 3 | **출력** | 정확한 JSON 스키마 (```json 코드블록). 오더가 merge 가능해야 함 |
| 4 | **도구** | 허용 MCP/도구 (예: eeoCRM 읽기, supabase repo) |
| 5 | **톤·가드레일** | classmoon 브랜드 규칙 + 금지 패턴 |
| 6 | **게이트** | 출력이 검수/Codex를 거치는지 (아웃바운드=예, 내부=아니오) |
| 7 | **활성화 트리거** | 오더가 언제 이 페르소나를 부르나 |
| 8 | **실패 처리** | 데이터 없을 때 반환값 — 항목 **드롭 0** |

## FROZEN: operating_context (360 팩) 스키마

오더가 **건별로** 조립한다. 각 페르소나는 자기 슬라이스만 받는다. 필드명은 토씨 그대로 고정:

```json
{
  "item_id": "string",
  "item_type": "deal | lead | content_slot",
  "entity":   { "company": null, "contact": null, "lead_id": null, "deal_id": null, "stage": null, "amount": null, "owner_id": "3935704427463307" },
  "crm_facts": null,
  "ledger":   { "recent_outcomes": [], "last_touch": null, "score": null, "next_action_hint": null },
  "content":  { "cadence_status": null, "idea_queue_top": [], "recent_published": [] },
  "social_signals": { "winners": [], "losers": [] },
  "brand":    { "voice": "classmoon", "rules": [], "forbidden": [] },
  "missing":  []
}
```

- `crm_facts` = eeoCRM 사실 객체 또는 `null`(이면 `missing[]`에 `{source, reason}`).
- `social_signals` = `{winners[], losers[]}` 또는 `{manual_note}`(수기 v1).
- `missing` = 실패한 소스 목록. **루프는 멈추지 않는다.**

## FROZEN: 게이트 규칙

| 행동 | 게이트 |
|------|--------|
| 고객 발송 / 회사 CRM 쓰기 / 대량 행동 (one-way door) | **사람(문준혁) 최종 승인** |
| 고객에게 나가는 아웃바운드 초안 (팔로업 메시지·게시물·제안) | **Codex 적대검증** 후 큐 |
| 내부 메모·드래프팅 | 자동 (게이트 없음) |

- 항목 결과 = `pass | fail | error | needs_human`.
- **fail** → 피드백 1회 자동 재생성 → 그래도 fail이면 `needs_human`.
- **error**(MCP 실패·JSON 깨짐·Codex 타임아웃) → 항목 격리 + 사유, 루프 전체는 계속.
- 어떤 경로든 항목은 사라지지 않는다: 통과(큐) 아니면 운영자(사유).
- **Codex 타임아웃/에러 = 게이트 스킵 ❌ → `needs_human` 강등. 자동 발송 절대 금지.**

## FROZEN: 데일리 루프 (team)

```
수집 → 오더 트리아지(상위 N, 최근 outcome 30) → 건별 360 조립 → 오더 선택 활성화
→ 선택 페르소나 병렬 생산 → 검수(내부 셀프리뷰) → Codex 게이트(아웃바운드만)
→ 큐(통과) | needs_human(사유) → 실행=사람(전화·방문·카톡·DM) → outcome sink
```

`outcome sink` = `outreach_outcomes` (`{lead_id, play, asset_id, action, at, note}`) → 내일 트리아지가 읽음.

## FROZEN: classmoon 브랜드 가드레일

- 사례·가치 우선, 과장 금지, 교육현장 존중, 정직한 경계(CRM은 API 연결 사실대로).
- **forbidden:** 과장된 성과·보장·단정, 제품홍보만, 현장 없는 조언, default SaaS 과장 톤(혁신적·차세대·시너지 등).

## 선택 활성화 원칙

오더는 **매 건 5명 전부 부르지 않는다.** 건 성격에 맞는 최소 집합만 `activate`:

| 건 성격 | 활성 페르소나 |
|---------|---------------|
| 정체/활성 딜 | 세일즈 (+ 아웃바운드면 검수) |
| 콘텐츠 슬롯 (오늘 발행) | 콘텐츠 → (발행 확정) 제작 → 검수 |
| 반론 깨는 자료 필요 | 세일즈 + 콘텐츠 + 제작 + 검수 |
| 내부 정리만 | 해당 1명, 게이트 없음 |
