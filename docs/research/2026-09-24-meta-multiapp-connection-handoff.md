# Meta 브랜드별 앱 연결 구현 인계 (2026-09-24)

## 범위와 현재 상태

- `codex/meta-multiapp` 브랜치의 연결 코드만 준비했다. Meta 개발자 앱 생성, 계정 OAuth 승인, 운영 DB 마이그레이션 적용, 게시 실행은 이 브랜치에서 하지 않았다.
- `bridgemaker` + `@ml_bridgemaker`는 기존 `COM_MOON_INSTAGRAM_*`와 `COM_MOON_META_THREADS_*` 자격 증명을 계속 사용한다. 브랜드 키가 비어 있는 기존 BridgeMaker OAuth 요청도 이 핸들에 한해 허용한다.
- `politicofficer` + `@politic_officer`는 `politic_officer` 앱 슬롯, `classmoon` + `@moon.classin`은 `classmoon` 앱 슬롯을 쓴다. 브랜드 키와 핸들이 정확히 맞지 않거나 전용 ID/secret 중 하나라도 없으면 OAuth URL을 만들지 않는다. 전용 앱 ID가 기존 Moonlight 앱이나 다른 전용 브랜드 앱 ID와 같아도 연결을 막는다.
- 콜백은 서명된 state와 `social_oauth_flows`의 일회용 행에 담긴 앱 슬롯·앱 ID를 확인하고, 현재 환경 변수의 앱 ID와 재대조한 뒤 해당 앱의 secret으로 단기·장기 토큰을 교환한다. 연결 레코드에는 `oauthAppKey`·`oauthAppId`가 저장된다. 기존 앱 ID를 다른 앱 ID로 바꾸는 저장은 코드와 DB 트리거가 막는다.
- Threads deauthorization/data-deletion 서명은 설정된 앱별 secret으로 검증하고, 서명한 앱에서 만든 연결만 비활성화한다. 기존 BridgeMaker 레코드처럼 앱 ID가 없는 행은 기존 Moonlight 앱의 서명에만 해당한다.

## 필요한 환경 변수

기존 BridgeMaker 연결의 아래 네 값은 유지한다.

| 플랫폼 | BridgeMaker 앱 ID / secret | Politic Officer 전용 앱 ID / secret | Class.Moon 전용 앱 ID / secret |
| --- | --- | --- | --- |
| Instagram | `COM_MOON_INSTAGRAM_APP_ID` / `COM_MOON_INSTAGRAM_APP_SECRET` | `COM_MOON_INSTAGRAM_POLITIC_OFFICER_APP_ID` / `COM_MOON_INSTAGRAM_POLITIC_OFFICER_APP_SECRET` | `COM_MOON_INSTAGRAM_CLASSMOON_APP_ID` / `COM_MOON_INSTAGRAM_CLASSMOON_APP_SECRET` |
| Threads | `COM_MOON_META_THREADS_APP_ID` / `COM_MOON_META_THREADS_APP_SECRET` | `COM_MOON_META_THREADS_POLITIC_OFFICER_APP_ID` / `COM_MOON_META_THREADS_POLITIC_OFFICER_APP_SECRET` | `COM_MOON_META_THREADS_CLASSMOON_APP_ID` / `COM_MOON_META_THREADS_CLASSMOON_APP_SECRET` |

`COM_MOON_OAUTH_STATE_SECRET`와 Supabase 연결 환경 변수도 기존대로 필요하다. 여기에는 실제 ID나 secret을 기록하지 않는다. Instagram은 Instagram API setup의 제품 앱 ID/secret, Threads는 Threads 제품 앱 ID/secret을 각각 넣어야 한다. Meta 부모 Facebook App ID를 대신 넣으면 안 된다.

## DB 적용·통합 순서

1. 서울 운영 DB에 `20260924_0047_social_oauth_flow_guard.sql`이 적용됐는지 확인하고, 미적용이면 먼저 적용한다.
2. `20260924_0048_meta_oauth_app_binding.sql`을 적용한다. 두 migration이 없으면 새 연결을 시작하지 않는다.
3. 이 브랜치를 메인 작업에 통합하고 Hub를 다시 시작한다. 기존 OAuth state는 앱 식별자가 없으므로 새 콜백에서 거부되며, 연결 버튼으로 새 흐름을 시작해야 한다.
4. 새 Meta 앱 각각에 동일한 HTTPS OAuth callback URL을 등록하고, 각 제품의 전용 앱 ID/secret을 서버 환경 변수에 넣는다. 설정 전 Politic Officer와 Class.Moon의 상태는 연결 불가로 표시된다.
5. 각 브랜드에 `brand`와 `brandKey`를 모두 지정해 연결한다. 예: `brand=politic_officer&brandKey=politicofficer`, `brand=moon.classin&brandKey=classmoon`. OAuth 뒤 반환된 핸들·계정 ID·앱 ID가 의도한 계정인지 별도로 확인한다.

기존 `Classmooni` 회사 앱을 재사용할지 게시 전용 앱을 새로 만들지는 운영 결정 사항이다. 앱 슬롯은 어느 쪽이든 전용 자격 증명으로 구성할 수 있지만, 현재 코드에 해당 ID/secret은 들어 있지 않다. 연결 코드는 게시 API를 실행하지 않는다.
