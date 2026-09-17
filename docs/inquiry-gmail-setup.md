# Gmail 문의 수집 연결·운영

구현 기준: 2026-09-13. 코드와 합성 데이터 테스트를 준비한 상태이며, 이 문서 작성으로 계정 연결·마이그레이션 적용·배포·자동 수집이 활성화되지는 않는다.

## 연결 준비

1. 문의 원장 마이그레이션 `20260913_0028_unified_inquiries.sql`을 적용할 준비를 하고 Hub와 Engine에 같은 기본 workspace를 지정한다. 실제 배포·적용은 운영 배포 절차를 따른다.
2. Hub에 `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, 전용 `COM_MOON_OAUTH_STATE_SECRET`을 설정한다. `GOOGLE_OAUTH_ENABLED_PROVIDERS`의 기존 목록에 `gmail`을 포함한다. OAuth 리디렉션 URI는 `<Hub origin>/api/email/gmail/callback`이다.
3. 운영자 주소는 `COM_MOON_OPERATOR_EMAIL`로 지정한다. 기존 기본값을 쓰는 환경에서는 저장소의 `resolveOperatorEmail` 기본 계정이 적용된다. 브라우저 로그인 힌트나 저장된 설정만으로 수집 계정을 확정하지 않고, 실행마다 인증된 Gmail profile 주소를 다시 검증한다.
4. Email 화면의 Gmail 연결을 진행한다. 전송 전용 토큰은 재연결해야 한다. OAuth 동의 목록은 `gmail.send`, `gmail.readonly`, `userinfo.email`이고, 수집 실행 시 Google tokeninfo의 실제 범위에 `gmail.readonly`, `gmail.modify`, `https://mail.google.com/` 중 하나가 있어야 한다. 단순히 `gmail.metadata`나 `gmail.send`만 있으면 본문 수집을 시작하지 않는다.
5. Hub의 `COM_MOON_ENGINE_URL`과 Hub·Engine의 `COM_MOON_SHARED_WEBHOOK_SECRET`을 연결한다. Hub는 문의 도메인을 직접 저장하지 않고 Engine의 `POST /api/inquiries/command`로만 변경한다.

기존 `GOOGLE_REFRESH_TOKEN_BOSS` / `GOOGLE_REFRESH_TOKEN` 환경 토큰도 호환한다. 저장된 OAuth 연결이 있으면 그것을 우선하며, 연결 원장 읽기 실패를 환경 토큰으로 조용히 우회하지 않는다. 저장된 연결의 계정이 검증됐던 경우 토큰 만료·권한 오류를 해당 계정의 최근 수집 오류에 남긴다. 환경 토큰만 있고 과거 검증 연결이 없는 경우에는 인증 실패를 실행 응답으로 보고한다.

현재 OAuth helper에는 과거 shared secret의 state-signing fallback이 남아 있다. 운영에서는 readiness 정의에 맞게 전용 `COM_MOON_OAUTH_STATE_SECRET`을 반드시 사용한다. 새 수집기와 Gmail 연결 URL은 명시적 제공자 허용 목록을 따른다.

## 수동 확인과 자동 실행

- `POST /api/hub/email/scan`은 기존 Hub write guard를 통과해야 한다. 선택 본문 `{ "maxMessages": 20 }`은 1회 처리량이며 최대 50건이다. 조회 범위가 20건이라는 뜻은 아니다.
- `GET /api/hub/email/scan`은 저장된 연결별 최근 성공·오류, phase, 복구 안내, 대기 ID 수와 `autoSyncEnabled`만 조회한다. Gmail API 호출, 토큰 갱신, 후보 탐색 또는 저장을 실행하지 않는다.
- `GET /api/cron/inquiries-sync`은 `Authorization: Bearer <CRON_SECRET>`이 정확히 일치해야 한다. 개발 환경에도 인증 예외가 없다.
- `apps/hub/vercel.json`에는 매일 1회(`0 21 * * *`, UTC 21:00 = KST 06:00)로 등록돼 있다. 2026-09-13까지는 5분 간격이었으나 Vercel Hobby 요금제가 하루 1회를 넘는 크론을 배포 시점에 거부해 2026-09-17 운영자가 일 1회로 확정했다. 실행 시각은 07:00 KST부터 도는 아침 크론 체인(후속 자동화·콘텐츠·비서) 앞에 두려는 권장값이며 운영자 확정은 아니다. Hobby는 실행 시각을 정시 기준 1시간 안에서만 보장하므로 06:00~06:59 KST 사이에 돈다. 낮에 들어온 문의는 다음 날 아침까지 자동 수집되지 않으므로 당일 확인은 수동 스캔(`POST /api/hub/email/scan`)을 쓴다. 한 번의 실행은 메시지 50건·35~45초 상한이고 남은 항목은 상태의 `pending`으로 다음 실행에 이어진다. 실제 자동 실행은 `COM_MOON_INQUIRY_AUTO_SYNC=true`일 때만 가능하다. 미설정 또는 다른 값이면 `preview / inquiry-auto-sync-disabled`를 반환한다. Hobby는 프로젝트당 크론 2개 제한도 있어(현재 5개 등록) 배포 성공 여부는 별도 확인이 필요하다.

응답 상태는 `saved`, `partial`, `preview`, `busy`, `error`다. `scanned`는 이번 실행에서 처리한 원문 수, `staged`는 새로 저장된 이벤트 수, `duplicates`는 이미 저장된 이벤트의 재시도 수다. `remaining`은 현재 체크포인트에 담긴 미처리 ID 수이며 전체 사서함의 잔여 개수가 아니다. `partial`의 `hasMore:true`는 다음 실행에서 이어서 처리함을 뜻한다. 연결 전·실패를 ‘문의 0건 성공’으로 표현하지 않는다.

## 수집 범위와 재시도

첫 실행은 알림 판정용 시작 시각을 고정하고 Gmail profile의 history ID를 먼저 저장한다. 조회 상한은 profile을 받은 뒤의 시각으로 설정해 토큰 갱신 중 도착한 메일도 포함한다. 최근 7일을 페이지별로 가져온 뒤 그 history ID 이후 변경 내역을 따라잡는다. 고정 시작 시각 이전 메일은 historical로 저장해 새 알림을 만들지 않고, 이후 수신 메시지는 새 내용으로 처리한다. 최초 7일보다 오래된 사서함 전체를 수집했다고 주장하지 않는다.

읽음·보관 여부는 제외 조건이 아니다. `SENT`, `DRAFT`, `SPAM`, `TRASH`만 제외한다. 제목·본문을 규칙으로 판단하고 Gmail·네이버·회사 도메인을 모두 문의자 주소로 허용한다. 네이버 사서함 자체를 읽는 연동은 포함하지 않는다. 기존 문의의 키워드 없는 회신도 수집한다. 초기 조회에서 회신이 원문의 앞 페이지에 나오면 그 회신보다 앞선 수신 대화를 확인한다. 대화 문맥은 앞선 메시지 최대 50건까지 살피며 더 긴 대화에서 판단할 수 없으면 확인 필요로 보낸다. 미래 메시지나 발신·스팸 문맥은 근거로 사용하지 않는다. 앞선 대화가 서명된 폼 안내라면 그 원문 ID를 체크포인트의 앞에 추가해 먼저 연결한 뒤 회신을 저장한다. 회신 자체에는 폼 canonical key를 재사용하지 않아 실제 새 회신 알림을 보존한다.

본문은 text/plain을 우선하고 HTML만 있으면 표시용 텍스트로 바꾼다. 분류 시 인용문과 서명 경계를 제외하지만 표시용 본문은 보존한다. 본문 표시 상한은 UTF-8 12,000바이트이며, 상한 초과·본문 MIME 누락·불완전한 문자 디코딩·긴 제목/연락처 때문에 잘린 내용은 확인 필요로 기록한다. 원문은 Gmail 링크로 확인한다. 첨부파일 다운로드·본문 HTML 실행·Gmail 읽음 변경·고객에게 메일 발송은 수행하지 않는다.

연결별 Engine lease와 체크포인트가 동시 실행을 제한한다. 페이지의 ID 목록을 먼저 저장하고 저장된 접두 구간만 제거한다. 문의 저장 응답이 유실되면 동일 ID로 재시도하며, lease가 만료됐거나 체크포인트 저장이 확인되지 않으면 쓰기를 중단한다. 일반 조회·저장 실패는 실패한 ID에서 재시도한다.

원문 조회가 명확한 404이면 삭제된 ID·발견 시각을 체크포인트에 남긴 뒤 다음 메일로 이동한다. 최근 100개 삭제 ID와 누적 개수, 삭제 내용은 복구할 수 없다는 안내를 보존한다. 삭제 기록 저장도 실패하면 진행하지 않는다.

history cursor가 404이면 이전 성공 시각과 마지막 조회 시작 시각 중 이른 시각부터 5분을 겹쳐 다시 페이지 수집하고 새 history 기준점 이후를 따라잡는다. 복구 범위와 누락 가능성을 화면에 남긴다. 삭제·조회 범위 밖 내용의 복구를 보장하지 않는다. Google이 설명하는 전체 동기화·증분 동기화와 cursor 만료 계약은 [Gmail 동기화 문서](https://developers.google.com/workspace/gmail/api/guides/sync), [history.list](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.history/list)를 따른다.

## 폼 안내 메일과 웹훅 중복 연결

일반 메일의 From 또는 `Authentication-Results` 헤더는 공유 제출 ID의 증거로 쓰지 않는다. 동일 폼의 웹훅과 안내 메일을 한 문의에 연결하려면 Hub에 아래 등록 정보를 설정하고 발송 서버가 제출 본문에 HMAC 서명을 넣어야 한다. 모든 예시는 합성 데이터다.

`COM_MOON_INQUIRY_EMAIL_FORMS`:

```json
[
  {
    "id": "landing",
    "sender": "no-reply@forms.example.com",
    "formId": "contact",
    "orgScope": "personal",
    "verificationSecret": "<SERVER_ONLY_FORM_HMAC_SECRET>"
  }
]
```

`id`는 Engine `COM_MOON_INQUIRY_SOURCES`의 등록 ID와 같아야 하고, `formId`도 해당 등록의 허용 form ID와 같아야 한다. `id`·`formId`는 영숫자로 시작하는 1~100자, 나머지는 영숫자·`.`·`_`·`-`만 허용한다. `eventId`는 같은 문자 규칙으로 1~300자다. HMAC secret은 웹훅 Bearer token과 별개로 설정하고 서버에서만 보관한다. 메일 본문이 지정한 workspace나 orgScope로 저장 위치를 바꾸지 않는다.

메일 text/plain 본문 전체는 아래 JSON 객체여야 한다. 안내 문구·Markdown 코드 펜스·인용문을 앞뒤에 붙이지 않는다. 실제 문의자는 `contact`에 들어가며 no-reply 발신자와 구별한다.

```json
{
  "eventId": "submission_001",
  "formId": "contact",
  "contact": { "name": "샘플 문의자", "email": "sample@example.com" },
  "subject": "서비스 도입 문의",
  "message": "도입 상담을 요청합니다.",
  "submittedAt": "2026-09-13T01:00:00.000Z"
}
```

본문은 최대 64KiB의 완전한 JSON envelope를 서명 검증에 사용한다. message는 최대 20,000자, subject 500자, contact.name 200자, contact.email 320자, contact.phone 100자이며 email 또는 phone이 필요하다. 긴 message도 검증한 다음 표시 상한에 맞춰 보존하고 확인 필요로 표시하므로, 본문 표시 제한이 공유 제출 ID를 잃게 만들지 않는다.

서명 헤더는 `X-Moonlight-Submission-Signature: sha256=<64자리 소문자 hex>`다. HMAC-SHA256은 **아래 고정 순서의 JSON.stringify 결과 UTF-8 바이트**에 계산한다. 선택 필드가 없으면 빈 문자열로 채운다. 값을 먼저 trim하거나 날짜 형식을 바꾸지 않는다. 발송한 JSON의 필드 순서는 달라도 되지만, 서명 계산의 필드 순서는 아래와 같아야 한다. 검증 구현의 `canonicalFormSubmission`도 같은 함수를 제공한다.

```js
import { createHmac } from 'node:crypto';

function canonicalFormSubmission(value) {
  return JSON.stringify({
    eventId: value.eventId,
    formId: value.formId,
    contact: {
      name: value.contact?.name || '',
      email: value.contact?.email || '',
      phone: value.contact?.phone || '',
    },
    subject: value.subject || '',
    message: value.message,
    submittedAt: value.submittedAt,
  });
}

const signature = 'sha256=' + createHmac('sha256', process.env.FORM_EMAIL_HMAC_SECRET)
  .update(canonicalFormSubmission(submission), 'utf8')
  .digest('hex');
// 본문: JSON.stringify(submission)
// 헤더: X-Moonlight-Submission-Signature: signature
```

발신 주소와 등록 form ID, 유효한 서명이 모두 맞으면 `form:<id>:<formId>:<eventId>`를 canonical key로 사용한다. 같은 제출 ID를 웹훅에도 보내면 수신 순서와 관계없이 하나의 문의에 연결하며 알림 순번을 중복 증가시키지 않는다. 서명이 없거나 바뀐 본문·다른 발신 주소이면 자동으로 합치지 않고 확인 필요로 남긴다. 두 경로에 공통 제출 ID가 없으면 자동 중복 제거를 보장하지 않는다.
