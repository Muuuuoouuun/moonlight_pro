# 세일즈 데일리 루프 플레이북 (AI 팀 오케스트레이션 v1)

> 운영자: 문준혁 (ClassIn B2B 세일즈, CRM ownerId `3935704427463307`)
> 설계 출처: office-hours 승인 문서 `clmagi-codex-moonlight-p0-hardening-design-20260618-000940.md`
> 실행 커맨드: `.claude/commands/morning.md` → Claude Code에서 `/morning` (개인 설정, 재시작 후 활성)

## 운영 모델 한 장

세 도구 = 역할 분리:
- **Claude Code** — 지휘자 + 빌더. 서브에이전트로 팀 오케스트레이션, MCP로 CRM·시트 접근.
- **Codex** — 독립 적대검증자(다른 모델 = 진짜 2nd opinion). 고객에게 나가는 카피의 품질 게이트.
- **claude.ai routine / RemoteTrigger** — (검증 후) 핸즈오프 스케줄. 로컬 `/schedule`·CronCreate은
  앱이 열려 있어야 실행되므로 핸즈오프 아님.

**퀄리티 공식:** 독립 모델(Codex) × 다중 렌즈(정확성·톤·컴플라이언스) × 사람 게이트(되돌릴 수
없는 행동만). 같은 모델의 자기검사는 에코챔버 → 품질이 안 오른다.

## v1 범위 (의도적으로 작게)

- **2팀:** 세일즈(next-action·반론) + 콘텐츠(반론 깨는 1장 자료).
- **온디맨드:** 아침에 `/morning` 1회 수동. (매일 cron 자동화는 포화 증명 후.)
- **상위 3~5건만** 처리(토큰·시간 상한).
- 마케팅·브랜딩·윤리 팀, 5팀 매일 fan-out = 2팀이 포화되면 확장.

## 데일리 루프 (8단계)

```
수집 → 트리아지(상위 N) → 생산(2팀 병렬) → 게이트 → 큐 → 실행(사람) → 학습
```

1. **수집:** CRM 델타(eeoCRM ownerId) · 시트 변경 · 메일. 소스 실패 시 스킵+사유(루프 안 멈춤).
2. **트리아지:** 정체·단계·금액으로 상위 N건. 최근 outcome 30건 참고.
3. **생산:** 건별 세일즈+콘텐츠 서브에이전트 병렬.
4. **게이트:** 아래 규칙.
5. **큐:** 통과분 Hub 큐 / 시트 Outreach Log.
6. **실행:** 전화·방문·카톡 = 사람만.
7. **학습:** 결과를 `outreach_outcomes`에 로그 → 내일 트리아지가 읽음.

## 게이트 규칙 (하나로 통일)

| 행동 | 게이트 |
|------|--------|
| 고객 발송 / 회사 CRM 쓰기 / 대량 행동 (one-way door) | **사람(문준혁) 최종 승인** |
| 고객에게 나가는 *아웃바운드 초안* (카피·제안서) | **Codex 적대검증** 후 큐 |
| 내부 메모·드래프팅 | 자동 (게이트 없음) |

**자동 발송 금지.** Codex 타임아웃/에러 = 게이트 스킵 ❌ → 해당 항목 `needs_human` 강등.

## 실패/리젝트 경로 (항목 절대 드롭 금지)

각 항목 결과 = `pass | fail | error | needs_human`.
- 게이트 **fail** → 피드백 주입해 **1회 자동 재생성** → 그래도 fail이면 운영자 큐(`needs_human`).
- **error**(MCP 실패·JSON 깨짐·Codex 타임아웃) → 항목 격리, 사유 첨부해 운영자에게. 루프 전체는 계속.
- 어떤 경로든 항목은 사라지지 않는다: 통과(큐) 아니면 운영자(사유).

## 학습 sink

- **sink:** Supabase `outreach_outcomes` 테이블 또는 시트 `Outcomes` 탭 —
  `{lead_id, play, asset_id, action(sent/replied/meeting/won/lost), at, note}`.
- **read:** 트리아지가 "이 세그먼트 최근 30건 outcome" 참고 → 루프를 닫는다.

## 롤아웃

1. **Phase 1 (지금):** `/morning` 2팀 온디맨드. 수동 실행. ← *현재 단계*
2. **Phase 2:** 항목·팀 늘면 Workflow 스크립트(옵트인). 다중 렌즈 게이트.
3. **Phase 3:** claude.ai routine/RemoteTrigger로 자동 트리거(서버 실행 검증 후).
4. **Phase 4:** 4주 안정 + 측정 성과 낸 플레이만 moonlight Engine/Hub 코드로 "졸업"
   (코드화하면 주간 수정성을 잃는 트레이드오프).

## 첫 실행 (Assignment)

내일 아침 **딱 1건**으로 손으로: 정체 딜 1개 → 세일즈 next-action+반론 → 콘텐츠 1장 자료 →
Codex 카피 검증 → 시트/큐 초안. 한 항목이 끝-to-끝으로 게이트까지 흐르는지 확인. 그게 씨앗.
