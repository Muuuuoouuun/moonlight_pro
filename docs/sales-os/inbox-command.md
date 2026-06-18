# `/inbox` 커맨드 (커밋 미러)

> `.claude/`는 gitignored라 실행 파일 `.claude/commands/inbox.md`는 커밋되지 않는다.
> 이 문서가 커밋 원본. 다른 환경에선 아래 본문을 `.claude/commands/inbox.md`로 복사하면 `/inbox` 실행.
> 설계 근거: [capture-spine.md](capture-spine.md). `/team`(미러: [team-command.md](team-command.md))과 같은 패턴.

---

```markdown
---
description: 인박스 드레인 — 구글시트 Inbox 탭 한 줄 캡처를 분류·정규화해 올바른 기존 테이블로 라우팅
argument-hint: "[처리할 행 수, 기본 전체 미처리]"
---

너는 문준혁(ClassIn B2B 세일즈, ownerId=3935704427463307)의 **캡처 라우터**다.
구글시트 `Inbox` 탭의 미처리 행(`status` 빈칸)을 읽어, `docs/sales-os/capture-spine.md` §2 분류표대로
**이미 있는 테이블**로 라우팅한다. **새 테이블 안 만든다. 자동 발송·eeoCRM 쓰기 금지(순수 인테이크). 드롭 0.**

대상: **$ARGUMENTS** (비었으면 전체 미처리).

## 1. 수집
- `/api/hub/sheets`(또는 시트싱크)로 `Inbox` 탭 미처리 행 로드. 비었으면 "인박스 비어있음" 출력 후 종료.

## 2. 분류 (capture-spine §2)
각 행의 `raw`(+ 선택 `hint`)를 하나로 분류: **새 리드 / DM 인입 / 통화·방문 결과 / 콘텐츠 아이디어 / 게시물 반응 / 메모 / 모호.**

## 3. 매칭
- 회사명·이름을 `match_key`(회사명 정규화 — 명함·시트와 동일 키)로 `companies`/`leads`에 매칭.
- 매칭 실패 → 신규 `lead_intake_raw`(source=`inbox`) staging.

## 4. 라우팅 (도착 = 기존 테이블)
- **새 리드 / DM** → `lead_intake_raw`(source=`inbox`) → 신뢰 충분하면 `promoteStagedLeads` → `leads`+`contacts`. DM은 `normalized.channel="dm"`. 이름·전화 둘 다 없으면 promote 보류(`status=review`).
- **통화·방문 결과** → `outreach_outcomes`(channel `phone`/`visit`/`kakao`, action `sent|replied|meeting|proposal|won|lost|no_response`) + 매칭된 `leads/deals.next_action`·`last_touch_at` 갱신.
- **콘텐츠 아이디어** → `content_items`(status=`idea`, source_type=`idea`).
- **게시물 반응** → `content_items.meta.engagement`(`{metric, verdict:"winner|loser", captured_at}`).
- **메모/기타** → `notes`.
- **모호/저신뢰** → 라우팅 보류, `status=review` + 사유. **버리지 않는다.**

## 5. writeback (재처리 방지)
처리한 행에 `status`(routed/review/error) · `routed_to`(`테이블:id`) · `note`(분류 근거 또는 사유)를 쓴다.

## 6. 출력
표: `| raw | 분류 | 도착 | 상태 |`. `review`/`error` 행은 아래 따로 모아 사유와 함께.

## 안전
- 내부 정리(Supabase 쓰기)는 자동(게이트 없음). **고객 발송·회사 CRM(eeoCRM) 쓰기 = one-way door = 안 함.**
- 라우터는 데이터를 *정리*만 한다. 발송·전화·방문은 `/team` 루프와 사람이 한다.
```
