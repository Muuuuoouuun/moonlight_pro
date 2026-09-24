# Meta 브랜드별 앱 연결 구현 인계 (2026-09-24)

## 범위와 현재 상태

- `codex/meta-multiapp`의 연결 코드를 통합했다. 정치 브랜드의 `Politic Officer Publisher` Meta 개발자 앱은 별도로 생성됐고 최소 권한 3개가 테스트 준비 완료다. 서울 운영 DB 마이그레이션 두 건은 적용·검증됐다. 정치·회사 계정 OAuth와 게시 실행은 아직 하지 않았다.
- `bridgemaker` + `@ml_bridgemaker`는 기존 `COM_MOON_INSTAGRAM_*`와 `COM_MOON_META_THREADS_*` 자격 증명을 계속 사용한다. 브랜드 키가 비어 있는 기존 BridgeMaker OAuth 요청도 이 핸들에 한해 허용한다.
- `politicofficer` + `@politic_officer`는 `politic_officer` 앱 슬롯, `classmoon` + `@moon.classin`은 `classmoon` 앱 슬롯을 쓴다. 브랜드 키와 핸들이 정확히 맞지 않거나 전용 ID/secret 중 하나라도 없으면 OAuth URL을 만들지 않는다. 전용 앱 ID가 기존 Moonlight 앱이나 다른 전용 브랜드 앱 ID와 같아도 연결을 막는다.
- 콜백은 서명된 state와 `social_oauth_flows`의 일회용 행에 담긴 앱 슬롯·앱 ID를 확인하고, 현재 환경 변수의 앱 ID와 재대조한 뒤 해당 앱의 secret으로 단기·장기 토큰을 교환한다. 연결 레코드에는 `oauthAppKey`·`oauthAppId`가 저장된다. 기존 앱 ID를 다른 앱 ID로 바꾸는 저장은 코드와 DB 트리거가 막는다.
- Threads deauthorization/data-deletion 서명은 설정된 앱별 secret으로 검증하고, 서명한 앱에서 만든 연결만 비활성화한다. 기존 BridgeMaker 레코드처럼 앱 ID가 없는 행은 기존 Moonlight 앱의 서명에만 해당한다.
- 재연결 시 `expectedAccountId`는 현재 선택한 Meta 앱의 ID·슬롯이 일치하는 연결에서만 고른다. Class.Moon 등에 같은 사용자 이름의 과거 Moonlight 앱 연결만 있으면 그 앱 범위의 ID를 새 OAuth에 고정하지 않고, 새 앱에서 검증한 핸들로 별도 연결한다. 기존 행은 보존된다. 명시한 `accountId`가 다른 앱의 행이면 거부한다. 두 앱이 같은 `account_key`를 돌려줘 기존 행과 충돌하면 저장은 계속 거부되므로, 자동 덮어쓰기 대신 운영자가 기존 행과 새 앱 소유권을 확인한 뒤 별도로 정리해야 한다.

## 필요한 환경 변수

기존 BridgeMaker 연결의 아래 네 값은 유지한다.

| 플랫폼 | BridgeMaker 앱 ID / secret | Politic Officer 전용 앱 ID / secret | Class.Moon 전용 앱 ID / secret |
| --- | --- | --- | --- |
| Instagram | `COM_MOON_INSTAGRAM_APP_ID` / `COM_MOON_INSTAGRAM_APP_SECRET` | `COM_MOON_INSTAGRAM_POLITIC_OFFICER_APP_ID` / `COM_MOON_INSTAGRAM_POLITIC_OFFICER_APP_SECRET` | `COM_MOON_INSTAGRAM_CLASSMOON_APP_ID` / `COM_MOON_INSTAGRAM_CLASSMOON_APP_SECRET` |
| Threads | `COM_MOON_META_THREADS_APP_ID` / `COM_MOON_META_THREADS_APP_SECRET` | `COM_MOON_META_THREADS_POLITIC_OFFICER_APP_ID` / `COM_MOON_META_THREADS_POLITIC_OFFICER_APP_SECRET` | `COM_MOON_META_THREADS_CLASSMOON_APP_ID` / `COM_MOON_META_THREADS_CLASSMOON_APP_SECRET` |

`COM_MOON_OAUTH_STATE_SECRET`와 Supabase 연결 환경 변수도 기존대로 필요하다. 여기에는 실제 ID나 secret을 기록하지 않는다. Instagram은 Instagram API setup의 제품 앱 ID/secret, Threads는 Threads 제품 앱 ID/secret을 각각 넣어야 한다. Meta 부모 Facebook App ID를 대신 넣으면 안 된다.

기존 `COM_MOON_INSTAGRAM_SCOPES`·`COM_MOON_META_THREADS_SCOPES` 오버라이드는 Moonlight 앱에만 적용한다. 정치·회사 전용 앱은 각 플랫폼의 기본 읽기·게시 최소 범위만 요청한다.

## DB 적용·연결 순서

1. 서울 운영 DB에 `20260924_0047_social_oauth_flow_guard.sql` 다음 `20260924_0048_meta_oauth_app_binding.sql`을 적용하고, 전체 파일명·SHA256 이력과 테이블·컬럼·트리거·RLS를 검증했다. 이 순서 뒤 연결 코드를 통합했다.
2. 통합된 Hub가 새 코드로 실행될 때 기존 OAuth state는 앱 식별자가 없어 콜백에서 거부된다. 연결 버튼으로 새 흐름을 시작해야 한다.
3. 새 Meta 앱 각각에 HTTPS OAuth callback URL을 등록하고, 각 제품의 전용 앱 ID/secret을 서버 환경 변수에 넣는다. 설정 전 Politic Officer와 Class.Moon의 상태는 연결 불가로 표시된다. 회사 앱 생성은 운영자가 보류했다.
4. 각 브랜드에 `brand`와 `brandKey`를 모두 지정해 연결한다. 예: `brand=politic_officer&brandKey=politicofficer`, `brand=moon.classin&brandKey=classmoon`. OAuth 뒤 반환된 핸들·계정 ID·앱 ID가 의도한 계정인지 별도로 확인한다.

기존 `Classmooni` 회사 앱을 재사용할지 게시 전용 앱을 새로 만들지는 운영 결정 사항이다. 앱 슬롯은 어느 쪽이든 전용 자격 증명으로 구성할 수 있지만, 현재 코드에 해당 ID/secret은 들어 있지 않다. 연결 코드는 게시 API를 실행하지 않는다.

Threads 해제·데이터 삭제 콜백은 서명과 앱 소속을 검증하지만, 과거의 유효한 `signed_request`를 재전송했을 때 재연결된 계정까지 비활성화하지 않는다는 보장은 아직 없다. Meta의 현재 Threads 콜백에서 발급 시각 필드가 항상 있는지 실측·공식 계약으로 확인하고 재전송 방지 규칙을 검증한 뒤 공개 운영 콜백으로 등록한다.
