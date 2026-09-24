# 소셜 채널 연결·발행 실사

> 확인일: 2026-09-24 · 서울 운영 DB·로컬 Hub 상태 API·브라우저 계정 화면·플랫폼 공식 문서 기준. 연결 결과가 바뀌면 재확인한다. 비밀 값과 개인 연락처는 기록하지 않는다.

계정별 소유자·승인·직접 조작 목록은 [소셜 채널 OAuth 계정 인계표](./2026-09-24-social-oauth-account-handoff.md)를 따른다.

### 2026-09-24 연결 진행 현황

- Meta `Moonlight` 앱의 Threads·Instagram 게시 권한과 임시 HTTPS 터널 콜백을 등록했다. `@ml_bridgemaker`의 두 테스터 초대를 수락하고 각 OAuth를 승인했다. 로컬 Hub 상태 API는 Threads·Instagram 각각 `connected`·계정명 `ml_bridgemaker`를 반환한다. `@politic_officer`는 별도 `도정치` Chrome 프로필에서 Instagram·Threads 본인 로그인과 Instagram 프로페셔널 대시보드를 확인했다. Instagram 테스터 초대는 승인됨으로 표시되지만 Threads 초대와 두 OAuth는 연결되지 않았다. `정상화` Chrome의 Meta AI 콘솔은 Social Technologies 앱 콘솔과 다르며 Facebook 로그인이 없어 정치 전용 앱 생성에 진입하지 못했다.
- `Classin Korea` 비즈니스가 관리하는 기존 `Classmooni` Meta 앱(상위 앱 ID `1261817029101418`)을 확인했다. Instagram 제품 앱 ID는 `940095648854296`, Threads 제품 앱 ID는 `1035066519184986`이다. 앱은 미게시 개발 상태이고 두 제품의 테스터 목록과 OAuth 리디렉션 콜백이 비어 있다. Instagram `instagram_business_basic`은 테스트 준비 완료, `instagram_business_content_publish`는 앱 검수 추가 전 상태이고 Threads `threads_basic`·`threads_content_publish`는 테스트 준비 완료로 표시된다. 회사 앱으로 활용할 수 있지만 현재 Moonlight 서버는 제품별 앱 자격증명을 하나씩만 선택하므로 다중 앱 지원과 앱별 연결 구분이 선행돼야 한다.
- 개인 Google 계정 `seoulmentoss@gmail.com`의 Cloud 프로젝트 `moonlight-youtube-509603`에서 Data API v3·읽기/업로드 범위·웹 OAuth 클라이언트를 설정했다. `22세기 유목민`, `문군`, `기독밈`을 각 채널로 별도 승인했다. 회사 `junhyuk.mun@classin.com`의 `클래스인 문`도 운영자의 특정 권한 승인 후 연결했다. 로컬 Hub 상태 API는 네 채널 모두 정확한 채널 ID·갱신 토큰을 반환한다. Testing 갱신 토큰은 2026-10-01에 각각 만료 예정이다. `ClassIn KR`은 이번 승인 대상에서 제외해 연결하지 않았다. `classin.com`의 기존 클라이언트 확인은 별도 재인증 대기 중이며 이 YouTube 전용 클라이언트와 무관하다.
- Moonlight에 YouTube 전용 OAuth 연결 경로를 추가했다(`548c4ba8`, `ac30afb1`). 계정별 연결 구조와 상태 API를 적용하고 서울 운영 DB에 `20260924_0046_social_multiaccount_connections.sql`을 기록했다. 적용 전후 연결 9건, `22세기 유목민`의 동일한 연결 ID·채널 ID와 갱신 토큰을 확인했다. 게시·업로드 코드는 포함하지 않는다. Instagram의 OAuth 승인 계정이 요청 브랜드와 다르면 저장을 거부하도록 수정했다(`898bff59`).
- YouTube 접근 토큰을 채널 ID별로 조회·갱신하는 서버 헬퍼와 `refresh-required` 상태 판정을 추가했다(`e8ad0463`). 2026-09-24에 `22세기 유목민`의 만료된 접근 토큰을 Google 갱신 엔드포인트로 실제 갱신하고 같은 채널 연결 행에 저장했다. `문군`·`기독밈`은 조회 시 아직 유효한 접근 토큰이 있어 갱신하지 않았다. 회사 `클래스인 문`까지 네 채널 상태 API는 `connected`를 반환했다. 갱신 토큰의 Testing 만료일(2026-10-01)은 변하지 않는다.
- Threads 연결 해제·데이터 삭제의 Meta 서명 검증 콜백을 운영 미들웨어의 공개 명시 목록에 추가했다(`00ea2f12`). 인접 경로는 계속 세션 게이트가 막는다.
- `codex/meta-multiapp` 격리 브랜치에는 브랜드별 Meta 앱 선택·앱별 상태 검증·생명주기 콜백 격리와 과거 앱 재연결 처리를 준비했다(`7387316c`·`2d74c20c`·`839feee3`). 전체 테스트 2,834 통과·실패 0, Hub 빌드 통과. 서울 운영 DB의 `0047`·`0048` 마이그레이션과 전용 앱 자격 증명 설정 전에는 메인에 통합하지 않았고 회사·정치 OAuth는 시작하지 않았다.

## 결론

Moonlight의 Threads·Instagram·YouTube OAuth 연결 경로는 코드에 있고, 운영 DB 연결은 개인 YouTube 3채널·회사 `클래스인 문` YouTube·`@ml_bridgemaker` Threads·Instagram 각 1건이다. 기존 다섯 연결의 `brandKey`는 비어 있고 회사 채널의 브랜드 매핑도 별도 확인이 필요하다. 소셜 게시·업로드 경로와 토큰 자동 갱신 작업은 아직 없다. 게시물 업로드는 실행하지 않았다. 현재 가능한 실무 흐름은 Studio의 원고·카드 문구·쇼츠 대본 작성 → 플랫폼 화면에서 수동 게시 → 게시 URL·일시를 Moonlight에 수동 기록하는 것이다. `발행했음`은 실제 플랫폼 게시 여부를 검증하지 않는다.

## 실제 계정·연결 상태

| 대상 | 확인된 계정·자산 | 현재 접근 | Moonlight API 연결 |
|---|---|---|---|
| Threads | `@ml_bridgemaker`, `@politic_officer`, `@moon.classin` | 각각 해당 Chrome 프로필에서 본인 프로필 확인. `@politic_officer` 초대 탭 확인 | `@ml_bridgemaker` 1건 |
| Instagram | `@ml_bridgemaker`, `@politic_officer`, `@moon.classin` | `@politic_officer`·`@moon.classin` 본인 프로필과 프로페셔널 대시보드 확인. `@politic_officer`의 기존 앱 테스터 초대 승인 표시 확인 | `@ml_bridgemaker` 1건 |
| Instagram 추가 | `@go_re_startagain` | 전환 시 비밀번호 요구 | 없음 |
| Instagram DB 링크 | HolyFunCollector | 브랜드 메타데이터에 링크만 있음. 현재 브라우저 게시 권한 미확인 | 없음 |
| YouTube Studio | 기독밈, 문군, 22세기 유목민, 클래스인 문, ClassIn KR | 다섯 채널의 Studio·권한 화면에 해당 로그인 계정이 각각 `소유자`로 표시. 개인 3채널과 클래스인 문은 OAuth 반환 ID까지 확인 | 개인 3채널·클래스인 문 |
| Meta Business Suite | `@politic_officer`의 `도정치` 프로필 | 비즈니스 자산 확인. 같은 Chrome은 Social Technologies 개발자 콘솔에서 로그인되지 않음 | 없음 |

운영 DB에는 활성 브랜드가 11개 있다. `meta.channels`에 Threads·Instagram 링크가 있는 브랜드는 BridgeMaker, HolyFunCollector, Politic_Officer 세 곳이고 나머지 8개는 비어 있다. 브랜드의 링크나 Studio 화면 접근은 API 게시 권한의 증거가 아니다. 연결 상태 API에서 `meta_threads`·`instagram_api`는 각각 `@ml_bridgemaker` 1건, `youtube`는 개인 3채널과 회사 `클래스인 문`이다.

## 지금 연결을 막는 조건

### Meta Threads·Instagram

1. 로컬 Hub 상태 API는 Threads·Instagram 모두 `connected`이며 앱 ID·시크릿·OAuth state 비밀키가 설정됐다. `@ml_bridgemaker`의 두 계정이 반환된다.
2. `Moonlight` Meta 앱의 Threads·Instagram 게시 권한과 HTTPS 콜백은 등록됐다. `@ml_bridgemaker`의 두 초대 수락·OAuth 승인이 완료됐다. `@politic_officer`는 별도 Chrome에서 로그인됐고 두 플랫폼 초대 수락·OAuth가 남았다. Threads OAuth의 진입 URL은 `www.threads.com`으로 수정했다.
3. Meta가 로컬 HTTP 콜백을 거부해 파일럿용 임시 HTTPS 터널을 쓴다. 운영 연결에는 안정적인 공개 HTTPS Hub 주소와 배포 환경 변수가 필요하다.
4. 로컬 파일럿 브랜드 핸들을 `ml_bridgemaker`로 설정했다. 연결 경로는 `brand`와 `brandKey`를 명시할 수 있고 서명된 state와 실제 `/me` 계정명을 대조한다. 브랜드 키는 핸들과 다르다: `@politic_officer`는 `politicofficer`, `@ml_bridgemaker`는 `bridgemaker`, `@moon.classin`은 `classmoon`이다.
5. 서울 운영 DB는 `account_key`와 `(workspace_id, provider, account_key)` 고유 제약으로 확장됐다. 상태 API는 계정 목록을 반환하고 OAuth 저장은 실제 외부 계정 ID를 키로 사용한다. Settings의 계정별 선택 UI와 게시 대상 브랜드 매핑은 아직 없다.
6. 장기 토큰 갱신 함수는 있으나 자동 실행 경로가 없다. 연결 뒤 만료 전 갱신·실패 표시가 필요하다.
7. 회사 소유 앱 `Classmooni`의 Instagram·Threads 이용 사례는 있지만 테스터·두 제품의 OAuth 콜백 설정이 비어 있다. 기존 Moonlight 개인 앱과 병행하려면 앱별 ID·시크릿 선택, 서명된 state의 앱 식별자, DB 연결의 앱 식별자, 앱별 해제·삭제 콜백 검증이 필요하다. 별도 Chrome 프로필만으로 앱 시크릿과 토큰은 분리되지 않는다.
8. [Meta의 Instagram 심사 표](https://developers.facebook.com/documentation/instagram-platform/app-review)에 따르면 소유·관리하는 Instagram 프로 계정만 쓰는 앱은 Standard Access로 운영할 수 있고 App Review가 필수는 아니다. [Threads 시작 안내](https://developers.facebook.com/documentation/threads/get-started)에 따르면 테스터는 `threads_basic`·`threads_content_publish`를 시험할 수 있지만 역할이 없는 계정을 받으려면 권한별 심사와 앱 공개가 필요하다. [앱 모드 안내](https://developers.facebook.com/documentation/development/build-and-test/app-modes)의 개발 모드 테스트 데이터 가시성 제한 때문에 테스트 성공을 일반 공개 게시 검증으로 간주하지 않는다.

### YouTube

1. Moonlight에 YouTube 전용 OAuth scope·callback·상태 조회와 전용 클라이언트 자격증명을 설정했다. 기독밈·문군·22세기 유목민·클래스인 문 채널이 각각 `connected`이며 반환 ID와 갱신 토큰을 확인했다. 채널별 접근 토큰 갱신 헬퍼는 구현·실측했지만 예약 갱신과 업로드 구현은 없다.
2. 기존 Hub `GOOGLE_CLIENT_ID`의 프로젝트는 개인 계정 Cloud 프로젝트들에서 찾지 못했다. 별도 `classin.com` 계정의 Cloud 자격증명 화면은 재인증 대기 중이다. YouTube는 이 기존 Calendar 클라이언트와 분리된 전용 프로젝트를 사용하므로 연결의 선행 조건은 아니다.
3. Google OAuth 앱의 테스트 사용자 3명과 웹 클라이언트 설정은 완료됐다. `seoulmentoss@gmail.com`의 YouTube 웹 계정 전환에는 `문군`·`22세기 유목민`·`기독밈`이 보인다. `22세기 유목민`은 OAuth에서 브랜드 계정의 예전 이름 `호가미`로 나타났지만 반환 채널 ID가 일치했다. `문군`은 개인 기본 `Junhyeok Mun`으로 승인했고 반환 채널 ID가 일치했다. 신규 미감사 프로젝트 업로드는 비공개로 제한되며 공개 발행에는 감사가 필요하다.
4. Studio의 `소유자` 행은 API 권한의 증거가 아니다. [YouTube 공식 도움말](https://support.google.com/youtube/answer/9481328?hl=en)에 따르면 채널 권한으로 초대된 사용자는 API를 쓸 수 없다. 실제 Google/Brand 계정에서 채널이 OAuth 선택 목록에 나오는지, 이후 `channels.list(mine=true)`가 기대한 `UC...` ID를 반환하는지 확인해야 한다.

## 플랫폼별 발행 가능성

| 플랫폼 | 공식 API 범위 | Moonlight에 필요한 추가 작업 |
|---|---|---|
| Threads | 글(500자), 사진, 영상, 최대 20개 혼합 캐러셀. [`게시`](https://developers.facebook.com/documentation/threads/posts?locale=en_US) | 앱·권한·OAuth 연결, 계정별 저장, 게시 호출, 결과 확인 |
| Instagram | 프로 계정의 사진·영상·릴스·최대 10개 캐러셀. [`게시`](https://developers.facebook.com/documentation/instagram-platform/content-publishing?locale=en_US) | 프로 계정 확인, 앱·권한·OAuth, 접근 가능한 미디어 URL, 이미지 렌더, 결과 확인 |
| Facebook Page | 글·사진·다중 사진·릴스와 일부 예약 게시. [`게시`](https://developers.facebook.com/documentation/pages-api/posts?locale=en_US) | 보유 페이지·역할 확인, 페이지 토큰과 권한, 별도 어댑터 |
| YouTube | `videos.insert` 영상 업로드·예약. 세로/정사각 3분 이하 영상은 Shorts로 분류. [`업로드`](https://developers.google.com/youtube/v3/docs/videos/insert), [`Shorts`](https://support.google.com/youtube/answer/15424877?hl=en-GB) | 소유 프로젝트·채널 권한 확인, OAuth·감사, 실제 MP4 제작과 업로드 |
| YouTube 커뮤니티 글 | 현재 [YouTube Data API v3 공식 메서드 목록](https://developers.google.com/youtube/v3/docs)에 커뮤니티 글 생성 리소스·메서드가 없다. 채널 화면에서 직접 게시하는 흐름만 확인 가능 | 카드 문구·이미지 제작과 게시 대기열은 자동화 가능. 공식 API 게시 단계는 지원 여부가 생기기 전까지 수동 운영 |
| TikTok | 사진·영상 Direct Post. 미감사 앱의 게시물은 비공개 제한. [`공식 안내`](https://developers.tiktok.com/docs/en/content-posting-api-get-started) | 현재 브랜드 채널 확인부터 필요 |
| Naver Blog | 외부 서비스의 블로그 글쓰기 Open API는 2020년에 종료. [`종료 공지`](https://developers.naver.com/notice/article/7527) | 공식 자동 게시 경로로 계획하지 않음 |

## 구현 순서 제안

1. `@politic_officer`는 별도 Chrome에 로그인됐다. 개인 앱을 재사용할지 Politic 전용 Meta 앱을 만들지 결정한 뒤 해당 앱의 테스터 초대·OAuth와 반환 계정명을 확인한다. 초대 수락에는 Meta 약관·테스터 활동 동의가 표시된다.
2. `@ml_bridgemaker`의 Threads·Instagram과 개인 YouTube 3채널·회사 클래스인 문 채널은 OAuth 연결됐다. 각 계정의 브랜드 매핑과 만료 전 토큰 갱신을 구현한다. 이 단계에서 게시하지 않는다.
3. 회사 YouTube `클래스인 문`은 OAuth와 반환 채널 ID `UCNK7qVBPx7HJ0gpJw6DacrQ`를 확인했다. `ClassIn KR`은 운영자가 이번 권한 부여에서 제외했다.
4. 이미지 렌더·미디어 보관, 버전별 검토, 게시 큐·중복 방지·성공 URL 확인을 구현한 뒤 실제 게시를 별도 검증한다.
5. Google OAuth 앱의 공개 브랜딩·운영 전환과 YouTube API 감사를 분리해서 처리한다. Testing 갱신 토큰의 만료일은 네 채널 모두 2026-10-01이다. 회사 클래스인 문 연결도 현재 개인 소유 Cloud 프로젝트의 파일럿 클라이언트를 쓰므로 장기 운영의 소유권 분리는 별도로 결정한다.

코드 근거: [`integration-inventory.md`](../integration-inventory.md), [`meta-threads.js`](../../apps/hub/lib/meta-threads.js), [`instagram-api.js`](../../apps/hub/lib/instagram-api.js), [`content-studio.jsx`](../../apps/hub/components/hub/pages/content-studio.jsx), [`20260804_0018_backend_optimization.sql`](../../supabase/migrations/20260804_0018_backend_optimization.sql).
