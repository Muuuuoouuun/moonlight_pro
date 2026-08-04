# Phone Bridge 우선 기획서 — 개인 폰 연동을 Sales OS로 가져오는 방식

> 목적: 전화, 문자, 카카오톡 같은 개인 폰 접점을 Moonlight Sales OS에 자연스럽게 연결한다.
> 단, 폰을 감시하는 CRM이 아니라 운영자가 승인하는 `Phone Bridge -> Sales Inbox` 구조로 설계한다.
> 메인 OS 적용 문서: [personal-sales-os-nudge-layer.md](personal-sales-os-nudge-layer.md)

운영자: 문준혁. 주 채널: 전화/문자 -> 방문/대면 -> 고객 카카오톡. 이메일은 ClassIn 영업 모션에서 0에 가깝다.

## 1. 한 줄 원칙

폰 연동은 원문을 최대한 가져오는 기능이 아니라, **세일즈 접점의 발생 여부와 다음 액션을 놓치지 않게 하는 브리지**다.

- 기본 저장 = 메타데이터와 요약.
- 원문 저장 = 고객별 allowlist와 명시 승인 후.
- 자동 확정 금지. 감지된 접점은 Sales Inbox에서 `저장 / 수정 / 스누즈 / 무시`.
- 개인 연락처와 민감 대화는 자동 제외. Sales OS는 업무 연락만 다룬다.

## 2. 채널별 현실과 우선순위

| 채널 | 자동화 수준 | P0 접근 | P1 접근 | 리스크 |
|------|-------------|---------|---------|--------|
| 전화 | 중간 | Moonlight에서 전화 걸기 + 통화 후 1탭 회수 | Android companion에서 call log 읽기 | iOS call history 직접 접근 어려움 |
| SMS | 중간 | 문자 초안 생성 + 발송 여부 1탭 확인 | Android companion 또는 비즈니스 SMS API | Google Play 권한 정책, 개인정보 |
| iMessage | 낮음 | 수동 공유/복사 -> Quick Capture | 없음 | iOS 원문 접근 불가에 가까움 |
| 개인 카카오톡 | 낮음 | 복사/공유 -> Quick Capture, 카톡 초안 생성 | 알림/접근성 스크래핑 금지 | 공식 개인 대화 API 부재, 정책 리스크 |
| 카카오톡 채널/상담톡 | 높음 | 별도 보류 | 공식 비즈니스 채널 연동 | 사업용 채널 전환 필요 |

## 3. P0: 폰 없이도 시작하는 Phone Bridge

P0는 앱 권한 없이도 구현 가능해야 한다.

### 3.1 CRM에서 전화 걸기

고객 상세에 `전화` 액션을 둔다.

흐름:

1. 운영자가 고객 상세에서 `전화` 클릭.
2. 전화 앱으로 연결.
3. Moonlight에 `call_intent` 이벤트 생성.
4. 일정 시간 뒤 또는 복귀 시 `통화 결과 확인` 카드 표시.
5. 운영자가 `연결됨 / 부재중 / 나중에 / 잘못 걸림 / 메모` 중 선택.
6. `crm_activities`와 `next_actions` 후보로 저장.

저장 예:

```json
{
  "source": "phone_bridge",
  "event_type": "call_intent",
  "account_id": "uuid",
  "contact_id": "uuid",
  "direction": "outbound",
  "occurred_at": "ISO",
  "status": "needs_result",
  "body": "전화 시도",
  "next_action_hint": null
}
```

### 3.2 문자/카톡 초안 생성

Moonlight는 직접 발송보다 초안을 만든다.

액션:

- `문자 초안`
- `카톡 초안`
- `팔로업 초안`

흐름:

1. 고객/딜 맥락으로 메시지 초안 생성.
2. 운영자가 복사.
3. 실제 발송은 문자/카톡 앱에서 직접.
4. Moonlight가 `발송했나요?` 확인 카드 제공.
5. `발송함` 선택 시 활동 기록과 follow-up timer 시작.

P0에서는 실제 발송 여부를 OS에서 증명하지 않는다. 운영자 확인을 기록한다.

### 3.3 Quick Capture 붙여넣기

운영자가 카톡/문자 내용을 복사해 Moonlight universal capture에 붙여넣는다.

예:

```text
김대표: 이번 주 내부 검토 후 금요일까지 연락드릴게요. 가격은 괜찮은데 법무만 확인 필요합니다.
```

AI 분해:

- 고객 후보: 김대표 / 연결 account
- 채널: kakao 또는 sms
- 요약: 가격은 수용, 법무 검토 후 금요일 회신
- 반대/리스크: 법무 검토
- next action: 금요일 오전 리마인드
- 저장 위치: Sales Inbox review

## 4. P1: Android Companion

안드로이드에서만 깊은 자동화를 한다. 앱스토어 배포보다 개인 companion 앱/사이드로드/내부 배포를 우선한다.

### 4.1 권한

- `READ_CALL_LOG`: 통화 기록 읽기.
- `READ_SMS`: SMS 읽기.
- `READ_CONTACTS`: 번호 -> 이름 매칭.
- 알림 접근은 기본 금지. 카카오톡 스크래핑 목적 사용 금지.

### 4.2 동기화 정책

기본값:

- allowlist contact만 동기화.
- 원문 SMS 저장 OFF.
- 최근 14일만 backfill.
- 30~90일 뒤 원문 삭제, 요약/다음 액션만 보존.
- 개인 연락처 exclude list 제공.

동기화 단위:

```json
{
  "source": "android_companion",
  "channel": "phone | sms",
  "direction": "inbound | outbound | missed",
  "external_id": "device-local-hash",
  "occurred_at": "ISO",
  "duration_sec": 180,
  "from": "hashed-phone",
  "to": "hashed-phone",
  "body_preview": "optional",
  "body_full": "optional encrypted",
  "privacy_mode": "metadata | summary | full",
  "entity_match": {
    "account_id": "uuid",
    "contact_id": "uuid",
    "confidence": 0.88
  }
}
```

### 4.3 Moonlight API

Hub/Engine 경계:

- Companion -> Engine intake API.
- Engine이 shared secret/device token 검증.
- Hub는 read/review UI만.

필요 API:

- `POST /api/phone-bridge/events`
- `GET /api/hub/phone-bridge/inbox`
- `POST /api/hub/phone-bridge/decide`

모든 이벤트는 바로 ledger 확정이 아니라 `phone_event_inbox` 또는 기존 intake staging으로 들어간다.

## 5. P2: Kakao Business 전환

개인 카카오톡 대화 자동 수집은 제품 방향에서 제외한다.

대신:

- 카카오톡 채널
- 상담톡
- 알림톡/친구톡
- 비즈니스 SMS provider

를 통해 사업용 대화만 공식 API로 받는다.

원칙:

- 개인 톡방 읽기 금지.
- 비공식 스크래핑 금지.
- 고객에게 사업용 채널 안내.
- Sales OS에는 channel event와 요약만 저장.

## 6. Sales Inbox 카드 설계

Phone Bridge에서 들어온 이벤트는 아래 카드로 보인다.

카드 필드:

- 채널: 전화/SMS/카톡 공유/문자 초안
- 방향: 발신/수신/부재중
- 고객 후보
- 딜 후보
- 요약
- 감지된 다음 액션
- 민감도 표시
- 원문 보기 토글(허용된 경우만)

액션:

- `저장`
- `고객 바꾸기`
- `딜 연결`
- `다음 액션 수정`
- `스누즈`
- `무시`

## 7. 데이터 저장 원칙

가능하면 기존 `crm_activities`를 재사용한다.

확정 후 `crm_activities` 매핑:

| Phone Bridge | crm_activities |
|--------------|----------------|
| call outbound connected | kind=`call` |
| missed call | kind=`update`, body=`부재중 전화` |
| SMS sent | kind=`email` 대신 `update` 또는 channel meta |
| Kakao copied note | kind=`note` |
| message with next action | kind=`update` + next_action 생성 |

추가가 필요한 경우:

- `source`
- `channel`
- `direction`
- `external_ref_hash`
- `privacy_mode`
- `summary`
- `raw_body_encrypted`

초기에는 `meta`에 보관하고, 양이 늘면 `communication_events`로 승격한다.

## 8. 구현 로드맵

### P0.1 전화/문자/카톡 초안 표면

- 고객 상세 `전화`, `문자 초안`, `카톡 초안`.
- 통화 후 결과 카드.
- 발송 확인 1탭.
- Quick Capture 붙여넣기 -> Sales Inbox.

### P0.2 Entity Resolver

- 전화번호, 이름, 회사명, 최근 열린 고객으로 매칭.
- confidence 낮으면 review.

### P0.3 Next Action 연결

- 통화/메시지에 날짜/약속이 있으면 `next_action` 후보 생성.
- proposal 후 발송 확인 시 follow-up timer 시작.

### P1 Android Companion

- call log/SMS metadata sync.
- allowlist/exclude list.
- device token, local encryption.
- Sales Inbox review.

### P2 Business Messaging

- Kakao Channel/상담톡.
- SMS provider.
- 발송 상태 callback.
- 고객별 consent/opt-out.

## 9. 성공 기준

- 통화 후 30초 안에 활동 기록 완료.
- 문자/카톡 팔로업 초안 작성 시간이 70% 감소.
- 전화/문자 접점의 80% 이상이 고객 타임라인에 남음.
- 열린 딜 중 next action 없는 비율 10% 이하.
- 원문 저장 없이도 daily sales action이 충분히 생성됨.

## 10. 명시적 비목표

- 개인 카카오톡 전체 대화 자동 수집.
- iPhone SMS/iMessage 전체 읽기.
- 고객 동의 없는 원문 장기 보관.
- 자동 발송 기본값.
- 회사 CRM 또는 외부 채널에 사람 승인 없이 쓰기.

