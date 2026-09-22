# 문의 수집 연결

> 상태: 구현됨 · 운영 DB 적용, Gmail 로그인, 실제 랜딩페이지 연결은 별도 설정
> 기준일: 2026-09-13. [승인 설계](superpowers/specs/2026-09-12-unified-inquiries-email-webhook-design.md), [Gmail 연결·서명 규칙](inquiry-gmail-setup.md)

문의 내역은 `/dashboard/revenue/inquiries`에서 확인한다. 메일·웹훅·직접 등록은 같은 문의 기록에 저장되고, 활성 문의의 미확인 개수가 종 버튼과 오늘 화면에 표시된다. 읽음과 완료는 독립적이다. 완료·제외한 문의는 기본 알림 수에서 빠지며, 완료 후 고객의 새 회신은 문의를 다시 처리 중으로 연다. 연결된 거래 상태는 자동 변경하지 않는다.

## 1. 저장소와 서버

기존 Moonlight Supabase 스키마에 `supabase/migrations/20260913_0028_unified_inquiries.sql`을 순서대로 적용한다. 운영 데이터에 대한 자동 적용은 이 작업에 포함하지 않았다. 마이그레이션은 문의·원본 이벤트·Gmail 수집 상태와 service-role 전용 원자 RPC를 추가한다. 일반 브라우저 권한에는 테이블/RPC 권한을 부여하지 않는다.

Hub와 Engine에 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `COM_MOON_DEFAULT_WORKSPACE_ID`를 설정한다. Hub는 `COM_MOON_ENGINE_URL`과 Engine과 일치하는 `COM_MOON_SHARED_WEBHOOK_SECRET`로 `POST /api/inquiries/command`를 호출한다. Hub의 기존 인증·write guard 설정도 유지한다. Engine 문의 API는 로컬 open-webhook 옵션으로 인증을 우회하지 않는다.

Hub 조회가 HTTP 200이더라도 `status:error`면 실패다. `preview`는 저장소/연결 미설정이며 저장 성공이나 실제 문의 0건을 뜻하지 않는다. 마이그레이션 미적용 상태의 configured DB는 오류로 표시된다.

## 2. Gmail

[Gmail 설정 문서](inquiry-gmail-setup.md)를 따라 운영자 계정의 메일 읽기 권한을 연결한다. 문의 내역의 **Gmail 연결 / 재연결** 버튼이 기존 OAuth 경로를 연다. **지금 메일 확인**은 수동 수집, GET 상태 조회는 저장된 상태 조회만 수행한다.

처음 연결하면 최근 7일을 알림 없이 가져온 뒤 새 메일 변경 기록을 이어서 읽는다. 한 실행의 상한에 도달하면 저장된 계속 위치에서 다음 실행을 시작한다. 서버 자동 수집은 `COM_MOON_INQUIRY_AUTO_SYNC=true`와 `CRON_SECRET`, 스케줄러 설정 후 활성화한다. 앱이 열려 있는지에 의존하지 않는다. 기본 설정 파일의 주기는 5분이며 실제 배포 플랜에서 이 주기가 지원되는지 확인해야 한다.

## 3. 랜딩페이지의 서버에서 전송

Engine 환경변수 `COM_MOON_INQUIRY_SOURCES`에 등록한다. 아래 값은 예시이며 실제 토큰은 비밀 저장소에서 관리한다. 연결마다 별도의 충분히 긴 임의 토큰을 사용한다.

```json
[{"id":"webbook","token":"replace-with-a-random-server-secret","workspaceId":"11111111-1111-1111-1111-111111111111","orgScope":"personal","formIds":["contact"]}]
```

실제 workspace UUID와 `classin|personal|unclassified` 범위를 지정한다. `id`와 폼 ID는 영문·숫자로 시작하고 영문·숫자·`.`·`_`·`-`만 사용하며 최대 100자다. 브라우저에 이 토큰이나 Engine shared secret을 넣지 않는다. 사이트의 공개 폼 수신 서버가 입력 검증과 남용 방지를 담당하고 아래 요청을 보낸다.

```http
POST /api/intake/inquiries
Authorization: Bearer <해당 출처 토큰>
X-Inquiry-Source: webbook
Idempotency-Key: submission-001
Content-Type: application/json
```

```json
{
  "eventId": "submission-001",
  "eventType": "inquiry.created",
  "formId": "contact",
  "submittedAt": "2026-09-13T10:00:00+09:00",
  "contact": {"name":"문의자","email":"customer@example.com","phone":""},
  "subject": "도입 문의",
  "message": "서비스 도입 상담을 요청합니다.",
  "pageUrl": "https://example.com/contact"
}
```

필수 값은 eventId, eventType, 허용된 formId, ISO 수신 시각, 비어 있지 않은 message, email/phone 중 하나다. 제목·이름·pageUrl은 선택이다. 본문 전체는 UTF-8 64 KiB 이하, message는 20,000자 이하, 제목은 500자 이하로 제한한다. URL은 HTTP(S)만 허용하며 서버가 URL에 접속하지 않는다. eventId는 출처 ID와 같은 문자 집합으로 최대 300자이며 재시도마다 유지한다. Idempotency-Key를 함께 보내면 eventId와 같아야 한다. 본문의 workspace/orgScope로 등록된 범위를 변경할 수 없다.

| HTTP | 결과 | 다음 동작 |
|---|---|---|
| 201 | `saved`, inquiry | 저장됨 |
| 200 | `duplicate`, inquiry | 이전 저장 결과 재사용 |
| 400 | `invalid-input` | 필수 값·크기·날짜·키 확인 |
| 401 / 403 | `unauthorized` | 출처 토큰·허용 폼 확인 |
| 409 | `conflict` | 같은 키로 다른 내용을 보냈는지 확인 |
| 502 / 503 | `error` | 연결 복구 후 동일 키·동일 본문으로 재시도 |

메일 알림도 보내는 폼은 [HMAC 서명된 메일 봉투](inquiry-gmail-setup.md)를 사용하고, 양쪽에 동일한 출처 ID·formId·eventId를 보낸다. 검증된 `form:<sourceId>:<formId>:<eventId>`만 두 경로를 하나의 문의에 연결한다. 단순 발신자 주소나 제목이 같다는 이유로 병합하지 않는다. 기존 폼 메일에 서명이 없으면 일반 문의 후보로 검토하며, 웹훅과의 자동 중복 제거를 보장하지 않는다.

## 4. 배포 후 확인

1. 직접 문의를 등록하고 새로고침 후 상세·미확인 숫자가 유지되는지 확인한다.
2. Gmail 연결 후 수동 수집으로 읽기 권한과 최근 수집 시각을 확인한다. 개인 도메인의 영업·지원 문의도 표본에 포함한다.
3. 같은 폼 제출을 같은 키로 재전송하고, 서명 메일과 웹훅을 양쪽 순서로 보내 한 문의·한 알림인지 확인한다.
4. 앱을 닫은 상태로 자동 수집을 실행한 뒤 수집 성공 시각과 새 문의를 확인한다. UI의 자동 수집 설정 문구만으로 스케줄러 실행 성공을 판단하지 않는다.

코드 검증에서는 합성 데이터와 임시 로컬 PostgreSQL을 사용했다. 실제 고객에게 메일을 발송하거나 운영 DB·OAuth·랜딩페이지를 변경하지 않았다.
