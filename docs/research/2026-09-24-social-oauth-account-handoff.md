# 소셜 채널 OAuth 계정 인계표

> 2026-09-24 확인. 브라우저의 Studio 권한·Meta 역할 화면, 로컬 Hub 상태 API, 운영 DB, 공식 문서 기준. 비밀번호·앱 시크릿·토큰은 이 문서에 적지 않는다. 연결 여부는 OAuth 완료 뒤 프로필/채널 ID와 DB 저장을 다시 확인한다.

## 현재 연결 상태

| 영역 | 현재 상태 | 다음 확인 |
|---|---|---|
| Threads `@ml_bridgemaker` | Meta `Moonlight` 앱 생성, `threads_basic`·`threads_content_publish`, HTTPS 콜백 등록. 테스터 초대 대기. 로컬 앱 시크릿 없음. OAuth 연결 0건 | Meta 재인증, 초대 수락, 시크릿 설정, OAuth와 프로필 확인 |
| Instagram `@ml_bridgemaker` | Instagram Login 앱 ID, `instagram_business_basic`·`instagram_business_content_publish`, HTTPS 콜백 등록. 프로 계정 확인. 테스터 초대 대기. 로컬 앱 시크릿 없음. OAuth 연결 0건 | Meta 재인증, 초대 수락, 시크릿 설정, OAuth와 프로필 확인 |
| YouTube | 개인 Google 계정에 `moonlight-youtube-509603` 프로젝트와 YouTube Data API v3 활성화. OAuth 앱 이름 `Moonlight Video Publisher` 입력, 별도 사용자 데이터 정책 동의 대기. Moonlight 연결 코드 있음, 클라이언트 자격증명과 OAuth 연결 0건 | 정책 동의, 테스트 사용자 3명, 웹 클라이언트, 각 채널 소유자 승인 |
| Google Calendar | 기존 Hub 연결 기록에 `connected` 및 refresh token 있음 | 실제 동기화/토큰 갱신은 별도 검증. YouTube 새 클라이언트와 분리 유지 |
| Gmail·Sheets | 현 로컬 Google OAuth provider 목록에는 `calendar`만 활성화 | 소셜 게시 범위 밖. 필요 시 별도 동의·권한·콜백 확인 |

## 확인된 YouTube 채널 소유자

YouTube Studio `설정 → 권한`의 해당 사용자 행에 `소유자`가 표시된 것을 확인했다. 같은 Google Cloud OAuth 앱에 아래 세 이메일을 **테스트 사용자**로 넣고 각 계정에서 채널별로 승인할 수 있다. 회사 계정에서 Google Workspace 관리 정책이 막는지는 실제 승인 때 확인한다.

| Google 로그인 | 소유 채널 | 채널 ID |
|---|---|---|
| `seoulmentoss@gmail.com` | 기독밈 | `UCb599DDZuNpGXdasHgqKkzw` |
| `seoulmentoss@gmail.com` | 문군 | `UCJ6W-afKFqwgL_h09S3K83Q` |
| `seoulmentoss@gmail.com` | 22세기 유목민 | `UCK_CYxp_L_BiM2GCcP4r_8w` |
| `junhyuk.mun@classin.com` | 클래스인 문 | `UCNK7qVBPx7HJ0gpJw6DacrQ` |
| `classinkr@classin.com` | ClassIn KR | `UCmHz5kvfHtL_jbmmAYyF6HA` |

`classinkr@classin.com`의 ClassIn KR 권한 표에는 `ek.hwa@with-people.co.kr`도 관리자라고 표시됐다. 그 계정의 API 승인은 범위에 넣지 않았다. 회사 두 이메일의 **Cloud Console 소유권은 YouTube OAuth 승인 조건이 아니다**. 기존 Hub `GOOGLE_CLIENT_ID`의 원래 프로젝트를 찾아야 할 때는 `junhyuk.mun@classin.com` Cloud 재인증이 별도로 필요하다. YouTube는 개인 계정의 전용 프로젝트·클라이언트를 사용한다.

## Meta 브랜드 계정

| 계정 | 확인된 접근 | API 연결에 남은 일 |
|---|---|---|
| `@ml_bridgemaker` Threads | 로그인된 본인 게시 UI, Moonlight 테스터 초대 수락 화면 | 앱 역할 초대 수락, Threads OAuth 승인 |
| `@ml_bridgemaker` Instagram | 프로페셔널 대시보드, Moonlight-IG 테스터 초대 수락 화면 | 앱 역할 초대 수락, Instagram OAuth 승인 |
| `@politic_officer` Threads·Instagram | 본인 게시 UI·Instagram 프로 대시보드 | 각 이용 사례 테스터/역할, 계정 OAuth 승인, 다중 계정 저장 구조 |
| HolyFunCollector Instagram | 브랜드 DB에 링크만 | 현재 로그인·프로 계정·게시 권한 확인 |
| `@go_re_startagain` Instagram | 계정 전환 시 비밀번호 로그인 요구 | 계정 접근과 이 브랜드가 자동 발행 대상인지 확인 |

## 운영자가 현재 직접 해야 하는 단계

1. 열린 Meta 개발자 창에서 문준혁 Facebook 계정 **비밀번호 재인증을 직접 제출**한다. 앱 시크릿 조회에만 필요하며 비밀번호를 채팅으로 보내지 않는다.
2. Threads와 Instagram `@ml_bridgemaker`의 앱 테스터 초대 수락 화면을 각각 확인한다. 수락에는 Meta 약관 동의와 **“앱 소유자가 나를 고용했거나 테스터 계약을 맺었다”**는 사실 확인이 포함된다. 사실에 맞는 경우에만 직접 수락하거나 명시적으로 진행을 요청한다.
3. Google Cloud의 `Moonlight Video Publisher` OAuth 앱 마지막 단계에서 **Google API 서비스 사용자 데이터 정책 동의**를 확인한다. 이후 에이전트가 세 소유자 이메일을 테스트 사용자로 추가하고 웹 클라이언트를 설정할 수 있다.
4. 준비가 끝나면 각 Google/Meta 계정의 OAuth 승인 창에서 해당 채널과 요청 권한을 확인한다. 에이전트는 승인 뒤 응답의 계정명·YouTube `UC...` ID, 저장 기록을 검증한다.

## 연결 뒤에도 필요한 변경

- 현재 `integration_connections`는 `(workspace_id, provider)`가 고유해 Threads·Instagram·YouTube가 각각 워크스페이스당 **한 계정만** 저장된다. 두 Meta 브랜드와 다섯 YouTube 채널을 동시에 연결하려면 외부 계정 ID별 연결 및 브랜드 매핑으로 DB·API를 확장해야 한다.
- 현재 Settings는 Threads·Instagram만 플랫폼별 한 연결 행을 보여주며 YouTube 연결 버튼은 아직 없다. YouTube 파일럿은 `/api/social/youtube/connect?channelId=UC...` 직접 경로를 쓴다. 다중 계정 전환 시 Settings·상태 API도 계정 목록과 브랜드별 선택을 지원해야 한다.
- Meta는 로컬 HTTP 콜백을 거부해 파일럿용 임시 HTTPS 터널을 등록했다. 장기 운영에는 고정 HTTPS Hub 주소, 배포 자격증명, 콜백 재등록, 토큰 갱신 작업이 필요하다.
- Google 외부 OAuth 앱의 `Testing` 상태에서 YouTube 범위로 받은 refresh token은 보통 **7일 뒤 만료**된다. [Google OAuth 공식 안내](https://developers.google.com/identity/protocols/oauth2). 새 미감사 API 프로젝트의 `videos.insert` 업로드는 **비공개로 제한**되므로 공개 자동 발행에는 [YouTube API 감사](https://developers.google.com/youtube/v3/docs/videos/insert)가 필요하다.
- Moonlight에는 지금 연결 경로만 있고 YouTube 업로드·Meta 게시 실행 코드는 없다. 권한 연결 성공과 실제 콘텐츠 발행 가능 상태는 별도로 검증한다.
- 2026-09-24 공유 작업 중 `apps/hub/.env.local`이 사라져 기존 백업과 현재 서울 Engine DB 설정으로 복원했다. Google Calendar의 연결 상태와 소셜 콜백 주소는 다시 확인했지만, 백업 뒤 추가됐던 다른 환경 키가 모두 보존됐는지는 알 수 없다. 새 소셜 앱 시크릿 설정 전후에 각 상태 API를 재확인한다.

관련 현황: [소셜 채널 연결·발행 실사](./2026-09-24-social-channel-connection-audit.md), [YouTube OAuth 연결 코드 설명](../youtube-oauth-connection.md).
