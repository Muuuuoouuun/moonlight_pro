# 갤럭시 통화·문자·카톡 → "기록할까요" 설정

> 상태: 2026-09-24 구현(브랜치 `claude/rr-capture`). 운영자 결정: 폰은 갤럭시(Android), 전용 앱 없이 자동화 앱(MacroDroid 우선, Tasker 대안)이 HTTP로 보낸다. Mac의 Engine(:3001)에 Tailscale로 닿는다.
> 상위 아키텍처 스펙: [`docs/superpowers/specs/2026-09-24-mobile-capture-and-phone-integration-spec.md`](../superpowers/specs/2026-09-24-mobile-capture-and-phone-integration-spec.md) (고가용성 3중 버퍼·오프라인 큐·공유 시트 설계)
> 관련 코드: Engine `apps/engine/app/api/intake/phone-events/route.ts` · `apps/engine/lib/phone-capture*.ts`, 허브 `GET/POST /api/hub/record-candidates` · `apps/hub/components/hub/record-candidates.jsx`.

## 무엇을 하나

통화를 끊거나 문자·카톡을 받으면 폰이 Engine에 알린다. Engine은 **등록된 고객과 맞는 것만** "기록 후보"로 남기고, 허브 오늘 연락의 **기록할까요** 섹션에 캘린더 미기록 미팅과 함께 보인다. [기록 남기기]를 눌러 기록 시트에서 확인해야 기록이 된다.

- **자동 저장 없음.** 후보는 연락 기록(`crm_activities`)이 아니다.
- **고객이 아니면 버린다.** 내용·번호를 저장하지 않고, 하루 버린 개수만 센다("고객이 아닌 연락 14건은 오늘 내용 없이 버렸어요").
- **번호는 저장하지 않는다.** 매칭에만 쓰고, 후보에는 고객 참조·시각·통화 시간·메시지 미리보기(최대 280자)만 남는다.
- **이틀이 지난 후보는 목록에서 빠진다.** 7일이 지나면 처리 여부와 상관없이 미리보기·고객 참조를 지운다.

```
갤럭시(MacroDroid) ──HTTPS(Tailscale)──▶ Engine :3001 /api/intake/phone-events
                                          │ 시크릿 확인 → 고객 대조
                                          ├ 고객 아님 → 버림(하루 개수 +1)
                                          └ 고객 → webhook_events(phone-capture · received)
허브 오늘 연락 ◀── GET /api/hub/record-candidates (캘린더 미기록 미팅 + 폰 후보)
   [기록 남기기] → 기록 시트 → 저장 확인 → 후보 processed
   [버림] / [취소·노쇼] / [고객 아님] → 되돌리기 토스트
```

## 1. Engine 준비 (Mac)

1. 시크릿을 만든다: `openssl rand -hex 32`
2. `apps/engine/.env.local`에 넣는다(허브 쪽이 아니다):
   ```
   COM_MOON_PHONE_INTAKE_SECRET=<위 값>
   ```
   Hub→Engine 공용 시크릿(`COM_MOON_SHARED_WEBHOOK_SECRET`)과 **다른 값**이어야 한다. 폰의 자동화 앱은 시크릿을 평문으로 들고 있으므로, 폰을 잃어도 이 경로 하나만 열리게 분리했다. 비워 두면 이 경로는 503으로 닫힌다. 로컬 open-webhook 모드(`COM_MOON_ALLOW_OPEN_WEBHOOKS`)로도 열리지 않는다.
3. `COM_MOON_DEFAULT_WORKSPACE_ID`·`SUPABASE_URL`·`SUPABASE_SERVICE_ROLE_KEY`가 Engine에 이미 있어야 한다(고객 대조와 저장).
4. Engine을 다시 띄운다: `npm run dev:engine` (또는 `npm run dev`).

마이그레이션은 **필요 없다.** 후보는 기존 `webhook_events` 테이블에 `source='phone-capture'`로 들어간다.

## 2. Tailscale (Mac ↔ 갤럭시)

1. Mac과 갤럭시에 Tailscale을 설치하고 **같은 계정(tailnet)** 으로 로그인한다.
2. 권장 — Tailscale Serve로 tailnet 안에서만 HTTPS로 연다:
   ```
   tailscale serve --bg 3001
   tailscale serve status
   ```
   (Mac 앱스토어판이면 CLI는 `/Applications/Tailscale.app/Contents/MacOS/Tailscale`.) 주소는 `https://<Mac 이름>.<tailnet>.ts.net/api/intake/phone-events`. tailnet 관리 화면에서 MagicDNS·HTTPS 인증서를 켜야 한다.
3. 대안 — `http://<Mac의 100.x.y.z 주소>:3001/api/intake/phone-events`. Engine 개발 서버는 모든 인터페이스에서 듣기 때문에 같은 와이파이에서도 열려 있다 — 이 경우 시크릿이 유일한 보호다. Serve를 권한다.
4. **Funnel은 쓰지 않는다**(공개 인터넷에 열린다).

### 연결 확인 (Mac에서)

```
curl -s -X POST https://<Mac 이름>.<tailnet>.ts.net/api/intake/phone-events \
  -H 'content-type: application/json' \
  -H 'x-com-moon-phone-secret: <시크릿>' \
  -d '{"type":"sms","number":"010-0000-0000","text":"연결 테스트"}'
```

| 응답 | 뜻 |
|---|---|
| `{"status":"ignored","reason":"not-a-customer"}` 200 | 정상 — 인증 통과, 고객 번호가 아니라 버림 (기본값) |
| `{"status":"saved", ...}` 201 | 고객과 맞아 후보가 됨 (`notice`에 짧은 확인 문구). `captureUnmatched: true`인 경우 미등록 번호도 "새 고객으로" 등록 후보 생성 |
| `{"status":"duplicate"}` 200 | 같은 사건을 이미 받음 |
| `{"status":"ignored","reason":"no-conversation"}` 200 | 부재중·0초 통화 — 후보로 만들지 않음 |
| `{"status":"ignored","reason":"ambiguous-customer"}` 200 | 같은 이름·번호가 서로 다른 고객 둘 이상 — 추측하지 않고 버림 |
| 401 `invalid-phone-secret` | 시크릿이 틀림 |
| 503 `phone-intake-not-configured` | Engine에 시크릿이 없음 |
| 400 `invalid-input` | 본문을 못 읽음(아래 JSON 참고) |
| 502 `customer-directory-read-failed` | 고객 목록을 못 읽음 — 모르는 채로 버리지 않고 거절 |

## 3. MacroDroid 매크로

공통 — 동작 **HTTP 요청(HTTP Request)**:

- 방법 `POST`, URL은 위 주소
- 헤더(Header Parameters): `x-com-moon-phone-secret` = `<시크릿>`
- 콘텐츠 유형 `application/json`, 본문(Content body)에 아래 JSON — 매직 텍스트는 본문에 그대로 쓴다
- (선택) 응답 본문을 문자열 변수에 저장하면 `notice`를 알림으로 띄울 수 있다

MacroDroid는 URL·헤더·본문에서 매직 텍스트와 `[v=변수이름]` 치환을 지원한다([HTTP Request 위키](https://www.macrodroidforum.com/wiki/index.php/Action:_HTTP_Request)). 아래 변수 이름은 MacroDroid 위키·포럼 기준이며, 앱 버전에 따라 매직 텍스트 목록(본문 입력칸의 `…` 버튼)에서 한 번 확인한다.

### A. 통화 시작 기억 (보조)

- 트리거: **통화 활성(Call Active)** — 모든 번호
- 동작: 변수 설정 — 문자열 변수 `callStart` = `{system_time}`

통화 시간 매직 텍스트는 확인하지 못했다. 대신 시작 시각을 보내면 Engine이 종료 시각과의 차이로 통화 시간을 계산한다(4시간 이내만 믿는다). 발신 통화는 신호음 시간이 포함될 수 있다.

### B. 통화 종료

- 트리거: **통화 종료(Call Ended)** — 수신·발신 모두
- 동작 1: HTTP 요청, 본문
  ```json
  {"type":"call","number":"{call_number}","name":"{call_name}","occurredAt":"{system_time}","startedAt":"[v=callStart]"}
  ```
- 동작 2: 변수 설정 — `callStart` = (빈 값). 다음 통화에 지난 시작값이 섞이지 않게 한다.

수신/발신을 가르고 싶으면 매크로를 둘로 나누고 본문에 `"direction":"in"` 또는 `"direction":"out"`을 넣는다. 부재중은 보내지 않아도 된다(보내도 `no-conversation`으로 무시).

### C. 문자 수신

- 트리거: **SMS 수신(SMS Received)** — 모든 번호
- 본문
  ```json
  {"type":"sms","number":"{sms_number}","text":"{sms_message}","occurredAt":"{system_time}"}
  ```

### D. 카카오톡 알림

- 트리거: **알림(Notification) — 알림 수신**, 앱: 카카오톡
- 본문
  ```json
  {"type":"kakao","title":"{not_title}","text":"{notification}","occurredAt":"{system_time}"}
  ```
- `{not_title}`은 보낸 사람 표시 이름, `{notification}`은 알림 본문 미리보기다. 메시지에 줄바꿈·따옴표가 있어 JSON이 깨져도 Engine이 알려진 키를 경계로 읽는다.

### Tasker를 쓸 때

같은 URL·헤더·JSON을 보내면 된다. 키 이름은 느슨하다 — `type`(call·sms·kakao 또는 전화·문자·카톡), `number`/`phone`/`from`, `name`/`title`, `text`/`message`, `duration`(초·`04:12`·`4분 12초`), `startedAt`, `occurredAt`(epoch 초·ms, ISO, `2026-09-24 14:32:00`은 KST로 읽음), `direction`(in·out·missed 또는 수신·발신·부재중). Tasker 변수 이름은 Tasker 내장 변수 목록에서 확인한다.

## 4. 무엇이 고객과 맞나

| 사건 | 맞추는 곳 | 규칙 |
|---|---|---|
| 통화·문자 | 연락처(`contacts.phone`) · 리드(`leads.phone`) · 회사(`companies.phone`, 그 회사에 리드나 계약 고객이 있을 때만) | 번호를 한 형식으로 접어 정확히 일치. `010-1234-5678`·`+82 10-…`·`82-10-…`·`0082-…` 모두 같은 번호 |
| 통화·문자(번호 없음) | 폰 주소록 이름 → 아래 카톡과 같은 이름 규칙 | |
| 카톡 | 연락처 이름·리드/계약 이름·별칭 `meta.kakao_names` | 공백·기호를 지우고 **정확히 일치**. 끝의 호칭(원장·실장·대표·선생·님·쌤 등)은 떼고도 본다. 2글자 이상. 부분 일치는 하지 않는다 |

- 같은 학원(회사)의 리드·계약·연락처는 한 고객으로 본다. 서로 다른 고객 둘 이상에 걸리면 버린다.
- 카톡 표시 이름이 등록 이름과 다르면(예: "해솔 원장 Kim") 그 고객(연락처·리드·계약)의 `meta.kakao_names`에 표시 이름을 넣는다 — 배열 `["해솔 원장 Kim"]` 또는 쉼표 문자열. 지금은 고객 화면에서 편집하는 칸이 없어 DB에서 직접 넣어야 한다.
- 연락처만 있고 리드·계약이 없는 사람도 후보가 된다(고객 키 없이).

## 5. 허브에서

- **기록 남기기** — 채널·시각·통화 시간이 채워진 기록 시트를 연다. 저장이 확인되면 후보가 닫힌다(`processed`, 미리보기는 지운다).
- **약속으로** — 카톡·문자에 날짜·시각이 보이면(내일 3시·다음 주 화요일 4시·9/29 14:00 등) 약속 후보를 채워 시트를 연다. 추측이므로 시트에서 확인한다.
- **버림** — 되돌리기 토스트가 뜬다. 같은 고객·채널의 대기 후보는 한 줄로 묶여 있어 함께 정리된다.
- 캘린더 후보의 **취소·노쇼**·**고객 아님** — 그 고객 레코드의 `meta.nudges.dismissed`(CRM 넛지와 같은 키)와 `meta.calendar_outcomes`에 남는다.

## 6. 안 되는 것 · 알고 쓰기

- **내가 보낸 카톡은 못 잡는다** — 받은 알림만 본다. 카톡에는 공식 API가 없다.
- **무음 채팅방·채팅방을 열어 둔 상태**는 알림이 안 떠서 누락된다. 단체방은 알림 제목이 방 이름일 수 있다.
- **Android 알림 접근**: MacroDroid에 알림 접근 권한을 줘야 한다. Play 스토어가 아닌 곳에서 설치한 앱은 Android 13 이후 "제한된 설정"으로 막혀, 앱 정보 → ⋮ → 제한된 설정 허용을 먼저 해야 한다(Android 15에서 더 넓어졌다).
- **삼성 배터리 최적화**가 MacroDroid를 멈추면 사건이 사라진다 — MacroDroid를 "절전 예외(사용하지 않음 앱 제외)"에 둔다.
- **OS·카톡 업데이트**로 알림 형식이 바뀌면 이름 매칭이 깨질 수 있다. 연결 확인 curl로 다시 점검한다.
- **Mac이 꺼져 있거나 Engine이 안 떠 있으면** 그 사이 사건은 버려진다(MacroDroid는 기본적으로 다시 보내지 않는다). → 해결책으로 [모바일 캡처 스펙](../superpowers/specs/2026-09-24-mobile-capture-and-phone-integration-spec.md) §2의 MacroDroid 로컬 재시도 큐(`[v=offlinePhoneQueue]`) 또는 텔레그램 버퍼/Supabase 직결 채널을 도입한다.
- 통화 녹음·요약은 받지 않는다(목업 02의 녹음 요약은 이 구성의 범위 밖).

## 7. 개인정보

- 수집 목적은 "고객 연락 기록"으로 좁다. 고객이 아닌 사건은 내용 없이 버리고 하루 개수만 남긴다.
- 저장되는 것: 고객 참조(이름·회사·연락처 id), 채널, 방향, 시각, 통화 시간, 미리보기(문자·카톡, 최대 280자). 번호·통화 내용은 저장하지 않는다.
- 기록으로 옮긴 후보는 미리보기를 즉시 지운다. 7일이 지난 후보는 상태와 상관없이 미리보기·고객 참조를 지운다(다음 intake 때 정리).
- 폰을 잃으면 `COM_MOON_PHONE_INTAKE_SECRET`만 바꾸면 된다(다른 Engine 경로와 무관).

참고: [MacroDroid HTTP Request](https://www.macrodroidforum.com/wiki/index.php/Action:_HTTP_Request) · [MacroDroid Magic text](https://macrodroidforum.com/wiki/index.php/Magic_text) · [Trigger: Call Ended](https://macrodroidforum.com/wiki/index.php/Trigger:_Call_Ended) · [Trigger: SMS Received](https://www.macrodroidforum.com/wiki/index.php/Trigger:_SMS_Received) · [Tailscale serve](https://tailscale.com/docs/reference/tailscale-cli/serve)
