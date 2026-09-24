# 소셜 채널 OAuth 계정 인계표

> 2026-09-24 확인. 브라우저의 Studio 권한·Meta 역할 화면, 로컬 Hub 상태 API, 운영 DB, 공식 문서 기준. 비밀번호·앱 시크릿·토큰은 이 문서에 적지 않는다. 연결 여부는 OAuth 완료 뒤 프로필/채널 ID와 DB 저장을 다시 확인한다.

## 현재 연결 상태

| 영역 | 현재 상태 | 다음 확인 |
|---|---|---|
| Threads `@ml_bridgemaker` | 테스터 초대 수락·OAuth 승인 완료. 로컬 Hub 상태 API `connected`, 계정명 `ml_bridgemaker` 확인 | 장기 토큰 자동 갱신·게시 실행 구현 |
| Instagram `@ml_bridgemaker` | 테스터 초대 수락·OAuth 승인 완료. 로컬 Hub 상태 API `connected`, 계정명 `ml_bridgemaker` 확인 | 장기 토큰 자동 갱신·게시 실행 구현 |
| YouTube 개인 3채널 | `moonlight-youtube-509603`의 Data API v3·읽기/업로드 범위·테스트 사용자 3명·웹 OAuth 클라이언트 설정 완료. `기독밈`(`UCb599DDZuNpGXdasHgqKkzw`), `문군`(`UCJ6W-afKFqwgL_h09S3K83Q`), `22세기 유목민`(`UCK_CYxp_L_BiM2GCcP4r_8w`) 각각 Hub `connected`·갱신 토큰 확인. 2026-09-24 세 채널의 만료된 접근 토큰을 기존 권한으로 갱신·저장하고 `connected`를 재확인 | Testing 갱신 토큰은 각각 2026-10-01 07:17, 07:16, 05:55 UTC 만료 예정. 장기 OAuth 운영 조건 검토 |
| YouTube 회사 `클래스인 문` | 운영자가 `junhyuk.mun@classin.com`의 채널 보기·동영상 관리 범위에 명시적으로 동의한 뒤 OAuth 완료. `클래스인 문`(`UCNK7qVBPx7HJ0gpJw6DacrQ`)의 만료된 접근 토큰을 2026-09-24 기존 권한으로 갱신·저장하고 Hub `connected` 재확인 | Testing 갱신 토큰 2026-10-01 08:33:57 UTC 만료 예정. 업로드 API는 아직 구현되지 않음 |
| YouTube 회사 `ClassIn KR` | 운영자가 이번 권한 부여 대상에서 제외. OAuth 연결하지 않음 | 별도 승인이 있을 때만 연결 |
| Google Calendar | 기존 Hub 연결 기록에 `connected` 및 refresh token 있음 | 실제 동기화/토큰 갱신은 별도 검증. YouTube 새 클라이언트와 분리 유지 |
| Gmail·Sheets | 현 로컬 Google OAuth provider 목록에는 `calendar`만 활성화 | 소셜 게시 범위 밖. 필요 시 별도 동의·권한·콜백 확인 |

## YouTube Studio에서 확인한 소유자 역할

YouTube Studio `설정 → 권한`의 해당 사용자 행에 `소유자`가 표시된 것을 확인했고, 아래 세 이메일을 Google Cloud OAuth 앱의 **테스트 사용자**로 등록했다. 이 표는 Studio 역할 확인 결과이며 API 승인 가능성을 확정하지 않는다. [YouTube 공식 도움말](https://support.google.com/youtube/answer/9481328?hl=en)에 따르면 채널 권한으로 초대된 사용자는 Studio에서 `Owner` 역할이어도 YouTube APIs를 쓸 수 없다. 실제 OAuth 선택 목록과 `channels.list(mine=true)` 반환 ID로 채널별로 검증해야 한다.

| Google 로그인 | Studio에서 확인한 채널 | 채널 ID |
|---|---|---|
| `seoulmentoss@gmail.com` | 기독밈 | `UCb599DDZuNpGXdasHgqKkzw` |
| `seoulmentoss@gmail.com` | 문군: YouTube 개인 기본 채널. OAuth에는 `Junhyeok Mun`으로 표시되는 것으로 판단 | `UCJ6W-afKFqwgL_h09S3K83Q` |
| `seoulmentoss@gmail.com` | 22세기 유목민: Google 브랜드 계정의 기존 표시명 `호가미`로 OAuth에 표시 | `UCK_CYxp_L_BiM2GCcP4r_8w` |
| `junhyuk.mun@classin.com` | 클래스인 문 | `UCNK7qVBPx7HJ0gpJw6DacrQ` |
| `classinkr@classin.com` | ClassIn KR | `UCmHz5kvfHtL_jbmmAYyF6HA` |

`classinkr@classin.com`의 ClassIn KR 권한 표에는 `ek.hwa@with-people.co.kr`도 관리자라고 표시됐다. 그 계정의 API 승인은 범위에 넣지 않았다. 회사 두 이메일의 **Cloud Console 소유권은 YouTube OAuth 승인 조건이 아니다**. 기존 Hub `GOOGLE_CLIENT_ID`의 원래 프로젝트를 찾아야 할 때는 `junhyuk.mun@classin.com` Cloud 재인증이 별도로 필요하다. 현재 회사 `클래스인 문`의 파일럿 OAuth도 개인 계정 소유 YouTube 전용 Cloud 프로젝트·클라이언트를 사용한다. 회사 자격 증명과 운영 책임을 독립시킬 필요가 있다면 회사 소유 프로젝트로 이전·재승인해야 하며, 아직 하지 않았다.

`seoulmentoss@gmail.com`의 YouTube 웹 계정 전환 메뉴에는 `문군`·`22세기 유목민`·`기독밈`이 모두 표시된다. Google OAuth 선택 목록에는 개인 기본 `Junhyeok Mun`, 브랜드 `호가미`, `기독밈`이 나온다. 22세기 유목민의 YouTube 설정에서 연 브랜드 관리자 URL의 브랜드 ID와 `호가미` 브랜드 계정 ID `116010767891049305346`이 일치한다. 따라서 채널의 현재 이름과 브랜드 계정의 기존 이름이 다른 것으로 확인했다. `호가미`를 승인한 뒤 Hub 상태 API가 반환한 채널 ID도 `UCK_CYxp_L_BiM2GCcP4r_8w`로 일치했다. `문군`은 YouTube 설정에 브랜드 관리자 영역이 없는 개인 기본 채널이어서 OAuth의 `Junhyeok Mun`과 대응하는 것으로 판단한다. `aaahaaah@hanyang.ac.kr`은 YouTube 계정 전환 메뉴에 채널이 없어 대상에서 제외했다. 회사 `클래스인 문`의 OAuth 반환 ID는 `UCNK7qVBPx7HJ0gpJw6DacrQ`로 검증했고 `ClassIn KR`은 연결하지 않았다. 업로드는 하지 않았다.

회사 계정의 동의가 `admin_policy_enforced` 등으로 막히면 Google Workspace 관리자가 [관리 콘솔의 보안 → 액세스 및 데이터 관리 → API 제어](https://support.google.com/a/answer/7281227?hl=en&p=app_access_apps)에서 해당 OAuth 앱의 접근 정책을 확인해야 한다. `클래스인 문`의 동의는 완료되어 이 정책에 막히지 않았다. `ClassIn KR`은 권한 부여를 시도하지 않았으므로 정책 상태를 단정할 수 없다.

## Meta 브랜드 계정

| 계정 | 확인된 접근 | API 연결에 남은 일 |
|---|---|---|
| `@ml_bridgemaker` Threads | 로그인된 본인 게시 UI, Moonlight 테스터 초대 수락·OAuth 연결 확인 | 게시 기능 구현 전 연결만 완료 |
| `@ml_bridgemaker` Instagram | 프로페셔널 대시보드, Moonlight-IG 테스터 초대 수락·OAuth 연결 확인 | 게시 기능 구현 전 연결만 완료 |
| `@politic_officer` Threads·Instagram | 별도 `도정치` Chrome 프로필에 두 플랫폼 모두 본인 로그인 확인. Instagram 프로페셔널 대시보드 확인. Instagram `Moonlight-IG` 테스터 초대는 계정 화면에 `회원님이 승인함 2026년 9월 24일`로 표시됨. Threads `Moonlight`는 초대 탭에 표시됨 | 앱 분리 결정 뒤 Threads 초대 상태·OAuth 승인·반환 계정명 확인 |
| `@moon.classin` Threads·Instagram | `classin.com` Chrome 프로필에 두 플랫폼 모두 본인 로그인 확인. Instagram 프로페셔널 대시보드 확인 | 회사 소유 별도 게시 앱의 지속 가능한 연락처·예비 관리자 확정, 앱 생성, 제품별 OAuth 콜백·테스터 역할·서버 연결 설정 |
| HolyFunCollector Instagram | 브랜드 DB에 링크만 | 현재 로그인·프로 계정·게시 권한 확인 |
| `@go_re_startagain` Instagram | 계정 전환 시 비밀번호 로그인 요구 | 계정 접근과 이 브랜드가 자동 발행 대상인지 확인 |

> **2026-09-24 운영자 정정:** 운영자는 `도정치`를 정치 YouTube 계정용 Chrome 프로필로 추정하며 `정상화`와 계정 맥락이 겹칠 수 있다고 설명했다. 두 프로필의 실제 Google·Meta 로그인 동일성은 재검증하지 않았다. 아래의 `도정치` 접근 기록은 당시 관찰로 남기되, **별도 이름의 Chrome 프로필 연결을 후속 작업의 필수 조건으로 보지 않는다.** 정치 Instagram·Threads 및 Meta 비즈니스 자산은 실제 로그인 계정과 권한으로 확인한다.

## 운영자가 현재 직접 해야 하는 단계

1. `Politic Officer Publisher` 전용 Meta 앱은 생성됐고 최소 게시 범위 3개가 테스트 준비 완료다. 콜백·연락처와 테스터는 미설정이다. 앱 역할은 `정상화` 관리자 1명뿐이며 정치 비즈니스 소유·관리 권한 연결은 미확인이다. 후속 자산 점검은 접근 가능한 정치 계정 로그인에서 실제 계정·권한을 확인한다. 이후 테스터 초대·승인과 OAuth 동의는 별도로 확인한다. 기존 `Moonlight` 앱 초대가 정치 계정 화면에 보인 사실을 전용 앱의 승인으로 혼동하지 않는다.
2. 회사 YouTube `클래스인 문`은 운영자가 채널 보기·동영상 관리 권한을 승인했고 연결과 반환 채널 ID를 검증했다. `ClassIn KR`은 명시적으로 승인 대상에서 제외했으므로 연결하지 않는다. 기존 Google Cloud 자격증명 화면의 재인증은 별개이며 Cloud 소유권은 채널 OAuth 승인의 선행 조건이 아니다.
3. 운영자가 `Junhyeok` Chrome에서 서울 Supabase SQL Editor 로그인을 완료했다. `20260924_0047_social_oauth_flow_guard.sql`과 `20260924_0048_meta_oauth_app_binding.sql`은 이력 함수로 순서대로 적용됐다. 이력의 전체 파일명·SHA256 2건, 흐름 테이블과 앱 식별 컬럼 2개, 연결 보호 트리거·함수, RLS 및 `anon`·`authenticated` 읽기 차단을 확인했다. 로컬의 기존 Supabase 관리 API 토큰은 여전히 HTTP 401이어서 CLI 적용은 불가하다. 인증 정보는 채팅이나 저장소 문서로 받지 않는다.

## 연결 뒤에도 필요한 변경

- `integration_connections`의 `account_key`·계정별 고유 제약과 OAuth 저장·상태 API의 계정 목록을 서울 운영 DB에 적용했다. `20260924_0046_social_multiaccount_connections.sql`은 이력에도 기록됐다. 적용 전후 기존 연결 9건과 22세기 유목민의 동일한 연결 ID·채널 ID·갱신 토큰을 확인했다. 지금 연결된 소셜 6건의 `brandKey`는 모두 비어 있다. 브랜드별 게시 대상 매핑은 후속 작업이다.
- Meta OAuth 요청을 계정 ID·브랜드·일회용 nonce에 묶고 재사용을 막는 코드와 `20260924_0047_social_oauth_flow_guard.sql`을 서울 운영 DB 적용·검증 뒤 통합 브랜치에 합쳤다. 100건을 넘는 계정 조회와 손상된 DB 응답의 차단은 `f96ab85c`·`6836f985`에서 보완했다. 새 계정의 OAuth 저장 경로는 새 흐름 테이블을 사용한다.
- `codex/meta-multiapp`의 `7387316c`·`2d74c20c`·`839feee3`은 BridgeMaker 기존 앱을 유지하면서 Class.Moon·Politic Officer에 전용 앱 ID/secret을 배정하는 서버·Settings 경로를 준비했고, 두 DB 마이그레이션 적용 후 통합 브랜치에 합쳤다. 상태 조회는 앱 ID까지 확인하고 브랜드별 응답 목록도 해당 앱으로 제한한다. Threads 해제·삭제 콜백은 앱별 서명과 모든 연결 행을 검사하며, 과거 앱의 계정 ID를 새 앱 재연결에 사용하지 않는다. 통합 후 전체 테스트 2,979 통과·실패 0·skip 13. 정치·회사 전용 앱 자격 증명과 OAuth 콜백 설정·계정 확인 전에는 해당 계정 OAuth를 시작하지 않는다. 앱별 설정은 [Meta 브랜드별 앱 연결 인계](./2026-09-24-meta-multiapp-connection-handoff.md)에 적었다.
- YouTube 채널별 접근 토큰 갱신 헬퍼를 적용했다(`e8ad0463`). 서버에서 정확한 채널 ID를 조회해 필요한 경우에만 Google 갱신 권한으로 토큰을 바꾸고 같은 연결 행에 저장한다. 만료된 접근 토큰은 상태 API에서 `refresh-required`, 갱신 권한이 만료되면 `reauthorization-required`로 구분한다. 2026-09-24 네 채널을 이 헬퍼로 갱신·저장하고 상태 API에서 모두 `connected`를 재확인했다. 갱신 토큰의 10월 1일 만료는 연장되지 않았으며 예약 갱신 작업이나 업로드 API도 아직 없다.
- 현재 Settings는 Threads·Instagram만 플랫폼별 한 연결 행을 보여주며 YouTube 연결 버튼은 아직 없다. YouTube 파일럿은 `/api/social/youtube/connect?channelId=UC...` 직접 경로를 쓴다.
- Meta는 로컬 HTTP 콜백을 거부해 파일럿용 임시 HTTPS 터널을 등록했다. 장기 운영에는 고정 HTTPS Hub 주소, 배포 자격증명, 콜백 재등록, 토큰 갱신 작업이 필요하다.
- `Classin Korea` 비즈니스는 기존 `Classmooni` Meta 앱을 관리한다(상위 앱 ID `1261817029101418`, Instagram 제품 앱 ID `940095648854296`, Threads 제품 앱 ID `1035066519184986`). 앱은 개발 상태이고 Instagram·Threads 테스터 목록은 비어 있으며 두 제품의 OAuth 리디렉션 URL도 비어 있다. 기존 개인 앱과 병행하려면 앱별 ID·시크릿 선택, OAuth state/DB의 앱 식별자, 앱별 서명 검증과 삭제 콜백 격리가 필요하다. Chrome 프로필 분리만으로 API 앱 권한이 분리되지는 않는다.
- `도정치` 프로필은 앞선 점검에서 Meta Business Suite의 `@politic_officer` 비즈니스 자산을 볼 수 있었다. `정상화` Chrome의 Social Technologies 콘솔에 **실제 생성된** `Politic Officer Publisher` 앱(상위 앱 ID `1331254372240610`, Instagram 제품 앱 ID `3518738211624338`, Threads 제품 앱 ID `1624666812372311`)이 보인다. 앱은 미게시 상태이고 Threads API·Instagram 콘텐츠 관리 이용 사례가 있으며, 앱 역할 화면의 관리자는 `정상화` 1명이다. 기본 설정의 연락처 이메일·개인정보처리방침·앱 도메인과 두 제품의 OAuth 콜백은 비어 있다. 운영자의 2026-09-24 명시 승인 후 최소 권한 `threads_content_publish`, `instagram_business_basic`, `instagram_business_content_publish`를 각각 추가했고 세 권한 모두 **테스트 준비 완료** 표시를 확인했다. 댓글·메시지·삭제 권한은 추가하지 않았다. 생성 당시 비즈니스 선택 화면에는 `사용할 수 있는 비즈니스가 없습니다`가 표시됐고, 이후 연결 여부는 미확인이다. 앞선 Codex 브라우저 목록에서는 `도정치`라는 이름이 보이지 않아 자산 소유·권한을 재확인하지 못했으나, 프로필 이름만으로 별도 로그인 필요 여부를 판단하지 않는다. `dev.meta.ai/api-keys`는 AI 모델 API 콘솔로 게시 앱 콘솔과 다르다.
- 회사 `classin.com` Chrome의 Meta Social Technologies 콘솔에는 `Classin Korea` 소유 `Classmooni`(개발 중)와 `classin-mt-ads`(라이브) 2개 앱이 보인다. 별도 `Class.Moon Publisher` 앱 생성 절차에서 Instagram 콘텐츠 관리·Threads API 이용 사례를 함께 선택할 수 있고 `Classin Korea` 포트폴리오의 비즈니스·액세스 인증 완료 표시를 확인했다. 초안 앱 연락처는 `junhyuk.mun@classin.com`이다. 운영자는 장기 유지 연락처와 예비 앱 관리자 지정 전 **회사 새 앱 생성은 우선 보류**한다고 결정했다. 최종 `앱 만들기`는 Meta 약관·정책 동의도 포함한다.
- `Classin Korea` 비즈니스 포트폴리오에는 전체 액세스 관리자 4명(준혁 문 포함)이 있어 포트폴리오 자체가 한 이메일에만 묶인 상태는 아니다. 그러나 기존 `Classmooni` 앱 자산에 직접 할당된 전체 액세스 권한자는 `준혁 문 (You)` 1명뿐이다. 회사 Meta 개발자 계정은 `문준혁`/`junhyuk.mun@classin.com`으로 표시되며 개발자 연락처도 이 이메일이다. 회사 Chrome에서 Facebook 계정 센터를 열었을 때 다른 `정상화` 프로필이 표시돼 회사 계정의 추가 로그인·복구 수단 유무는 검증하지 못했다. 회사 이메일이 없어져도 Meta 계정 ID가 자동 삭제된다고 단정할 수는 없지만, 이메일이 유일한 로그인·복구 수단이거나 회사가 사람의 비즈니스 권한을 회수하면 앱 관리 연속성은 보장되지 않는다. [Facebook은 계정 연락처 이메일 추가·변경을 지원](https://www.facebook.com/help/ipad-app/224049364288051?locale=en_US)한다. 회사 정책에 맞는 장기 유지 연락처와 앱 자산의 별도 신뢰 가능한 관리자를 확인해야 한다.
- 회사 `클래스인 문` YouTube의 `youtube.com/account_advanced`에는 `브랜드 계정으로 채널 이전`이 보인다. 현재는 `junhyuk.mun@classin.com` Google 계정의 개인 기본 채널이며 브랜드 계정으로 이전하지 않았다. 운영자는 이 로그인이 **회사 Google Workspace 사용자 계정**이라고 확인했다. [Google 안내](https://support.google.com/accounts/answer/183931?hl=en)에 따르면 조직 계정의 설정은 관리자가 통제할 수 있으므로 복구 이메일만 추가해도 Workspace 사용자 삭제에서 채널이 보호된다고 볼 수 없다. [YouTube 공식 안내](https://support.google.com/youtube/answer/4628007?hl=en)는 개인 채널은 해당 Google 계정만 관리하고 브랜드 계정은 여러 소유자를 둘 수 있으며 새 주 소유자 지정까지 7일의 소유자 기간이 필요하다고 설명한다. 회사 계정 삭제 전에 채널 소유권 이관 계획을 별도로 세워야 한다. [채널 이전 안내](https://support.google.com/youtube/answer/3056283?hl=en)는 대상 브랜드 계정을 잘못 선택하면 기존 채널이 삭제될 수 있다고 경고한다. 이번 조사에서는 이전·권한 변경을 실행하지 않았다.
- `Classmooni` 기본 설정에는 개인정보처리방침 `https://classin.ai.kr/privacy`가 들어 있지만 서비스 약관·데이터 삭제 URL은 `https://www.facebook.com/`로 입력되어 있고 앱 도메인·연락처 이메일은 비어 있다. 회사의 공식 약관·삭제 안내 또는 Moonlight의 실제 운영 주체에 맞는 공개 URL을 확인한 뒤 수정해야 한다. 기존 회사 앱의 값을 추측해 교체하지 않는다. Instagram 게시 권한은 앱 검수에 아직 추가되지 않았다.
- Google 외부 OAuth 앱의 `Testing` 상태에서 YouTube 범위로 받은 refresh token은 **7일 뒤 만료**된다. 상태 API의 네 채널별 표시 만료는 위 표를 따른다. [Google OAuth 공식 안내](https://support.google.com/cloud/answer/15549945?hl=en). 새 미감사 API 프로젝트의 `videos.insert` 업로드는 **비공개로 제한**되므로 공개 자동 발행에는 [YouTube API 감사](https://developers.google.com/youtube/v3/docs/videos/insert)가 필요하다.
- Google Cloud `Moonlight YouTube`의 Audience는 `External · Testing`이고 `앱 게시` 버튼은 브랜딩 미완료로 비활성이다. 재점검에서 홈페이지·개인정보처리방침·서비스 약관 링크와 승인 도메인이 모두 비어 있다. 운영자는 현재 DNS를 관리할 수 있는 소유 도메인이 없다고 확인했다. Moonlight 공개 정책 페이지의 연락처로 `seoulmentoss@gmail.com`을 지정했고 `aaahaaah@naver.com`은 예비 연락처로 전달했다(공개 페이지에는 싣지 않음). [Google 브랜딩 안내](https://support.google.com/cloud/answer/15549049?hl=en)에 따라 홈페이지·정책 URL과 검증 가능한 도메인을 채워야 한다. [Google Audience 안내](https://support.google.com/cloud/answer/15549945?hl=en)에 따르면 `In Production`으로 옮기면 Testing의 7일 동의 만료 규칙은 적용되지 않는다. 전환 후에는 기존 7일 토큰이 연장된다고 가정하지 말고 채널을 재승인해 새 토큰 만료값을 확인한다. [개인 용도 100명 미만](https://support.google.com/cloud/answer/13464323?hl=en)은 OAuth 검증 면제 대상일 수 있으나 미검증 경고와 신규 사용자 100명 한도는 남는다. 이 전환은 YouTube 업로드의 비공개 제한을 해제하지 않는다.
- 현재 Vercel `moonlight-pro-hub` 프로젝트에 연결된 도메인은 `moonlight-pro-hub.vercel.app` 하나뿐이다. 이 배포의 `/legal/privacy`·`/legal/terms`·`/legal/data-deletion`도 로그인으로 307 이동한다. 공개 경로와 `/legal/about` 코드는 준비했으나 아직 배포되지 않았다. 배포 뒤 공개 접근, Google 승인 도메인 등록 가능 여부, 도메인 소유 확인을 검증해야 한다. 현재 Vercel 배포 환경 변수는 비어 있어 운영 OAuth 콜백 배포도 별도 구성 필요하다.
- 기존 `SUPABASE_ACCESS_TOKEN`은 관리 API에서 401을 반환한다. `20260924_0046_social_multiaccount_connections.sql`, `20260924_0047_social_oauth_flow_guard.sql`, `20260924_0048_meta_oauth_app_binding.sql`은 로그인된 서울 프로젝트 SQL Editor와 이력 함수로 적용했다. `npm run db:check`·`npm run db:migrate`를 다시 사용하려면 관리 토큰 갱신이 필요하다.
- Moonlight에는 지금 연결 경로만 있고 YouTube 업로드·Meta 게시 실행 코드는 없다. 권한 연결 성공과 실제 콘텐츠 발행 가능 상태는 별도로 검증한다.
- 2026-09-24 공유 작업 중 `apps/hub/.env.local`이 사라져 기존 백업과 현재 서울 Engine DB 설정으로 복원했다. Google Calendar의 연결 상태와 소셜 콜백 주소는 다시 확인했지만, 백업 뒤 추가됐던 다른 환경 키가 모두 보존됐는지는 알 수 없다. 새 소셜 앱 시크릿 설정 뒤 Threads·Instagram 상태 API는 `ready`, YouTube는 `connected`로 재확인했다.

관련 현황: [소셜 채널 연결·발행 실사](./2026-09-24-social-channel-connection-audit.md), [YouTube OAuth 연결 코드 설명](../youtube-oauth-connection.md).
