# 소셜 채널 연결·발행 실사

> 확인일: 2026-09-24 · 서울 운영 DB·로컬 Hub 상태 API·브라우저 계정 화면·플랫폼 공식 문서 기준. 연결 결과가 바뀌면 재확인한다. 비밀 값과 개인 연락처는 기록하지 않는다.

계정별 소유자·승인·직접 조작 목록은 [소셜 채널 OAuth 계정 인계표](./2026-09-24-social-oauth-account-handoff.md)를 따른다.

### 2026-09-24 연결 진행 현황

- Meta `Moonlight` 앱이 생성됐다. Threads·Instagram 게시 권한과 임시 HTTPS 터널 콜백을 등록했고, `@ml_bridgemaker`·`@politic_officer`를 양쪽 테스터로 초대했다. 마지막 역할 화면에서 `@ml_bridgemaker` Threads는 수락됐고 나머지 세 초대는 대기 중이다. 두 앱 시크릿을 로컬에 설정해 상태가 모두 `ready`다. Instagram 파일럿 OAuth는 `개발자 역할 권한 부족`으로 멈췄다. 수락된 Threads의 OAuth 진입은 Chrome에서 `ERR_BLOCKED_BY_CLIENT`로 차단됐다. 연결은 0건이다.
- 개인 Google 계정 `seoulmentoss@gmail.com`에 전용 Cloud 프로젝트 `moonlight-youtube-509603`을 만들고 YouTube Data API v3·사용자 데이터 정책 동의·테스트 사용자 3명·읽기/업로드 범위·전용 웹 OAuth 클라이언트까지 설정했다. `22세기 유목민`을 OAuth의 기존 브랜드명 `호가미`로 승인했고, Hub status가 `connected`·정확한 채널 ID `UCK_CYxp_L_BiM2GCcP4r_8w`·갱신 토큰을 확인했다. 테스트 앱 갱신 토큰의 표시 만료는 2026-10-01 05:55 UTC다. `classin.com` 계정의 기존 클라이언트 확인은 별도 재인증 대기 중이며 YouTube 전용 클라이언트와 무관하다.
- Moonlight에 YouTube 전용 OAuth 연결 경로를 추가했다(`548c4ba8`, `ac30afb1`). 계정별 연결 구조와 상태 API를 적용하고 서울 운영 DB에 `20260924_0046_social_multiaccount_connections.sql`을 기록했다. 적용 전후 연결 9건, `22세기 유목민`의 동일한 연결 ID·채널 ID와 갱신 토큰을 확인했다. 게시·업로드 코드는 포함하지 않는다. Instagram의 OAuth 승인 계정이 요청 브랜드와 다르면 저장을 거부하도록 수정했다(`898bff59`).

## 결론

Moonlight의 Threads·Instagram·YouTube OAuth 연결 경로는 코드에 있고 세 플랫폼 로컬 설정이 완료됐다. 운영 DB에서 `22세기 유목민` YouTube 연결 1건은 확인됐고 Threads·Instagram은 0건이다. YouTube 업로드 경로는 아직 없다. 게시물 업로드는 실행하지 않았다. 현재 가능한 실무 흐름은 Studio의 원고·카드 문구·쇼츠 대본 작성 → 플랫폼 화면에서 수동 게시 → 게시 URL·일시를 Moonlight에 수동 기록하는 것이다. `발행했음`은 실제 플랫폼 게시 여부를 검증하지 않는다.

## 실제 계정·연결 상태

| 대상 | 확인된 계정·자산 | 현재 접근 | Moonlight API 연결 |
|---|---|---|---|
| Threads | `@ml_bridgemaker`, `@politic_officer` | 브라우저 본인 프로필 편집·게시 UI | 없음 |
| Instagram | `@ml_bridgemaker`, `@politic_officer` | 브라우저 프로페셔널 대시보드 | 없음 |
| Instagram 추가 | `@go_re_startagain` | 전환 시 비밀번호 요구 | 없음 |
| Instagram DB 링크 | HolyFunCollector | 브랜드 메타데이터에 링크만 있음. 현재 브라우저 게시 권한 미확인 | 없음 |
| YouTube Studio | 기독밈, 문군, 22세기 유목민, 클래스인 문, ClassIn KR | 다섯 채널의 Studio·권한 화면에 해당 로그인 계정이 각각 `소유자`로 표시. 22세기 유목민은 OAuth 반환 ID까지 확인 | 22세기 유목민 1건 |
| Meta Business Suite | `@politic_officer` 로그인 경로 | 약관 동의 전 단계까지. 페이지 자산·권한 미확인 | 없음 |

운영 DB에는 활성 브랜드가 11개 있다. `meta.channels`에 Threads·Instagram 링크가 있는 브랜드는 BridgeMaker, HolyFunCollector, Politic_Officer 세 곳이고 나머지 8개는 비어 있다. 브랜드의 링크나 Studio 화면 접근은 API 게시 권한의 증거가 아니다. `integration_connections`에서 `meta_threads`·`instagram_api`는 0건, `youtube`는 22세기 유목민 1건이다.

## 지금 연결을 막는 조건

### Meta Threads·Instagram

1. 로컬 Hub 상태 API는 Threads·Instagram 모두 `ready`다. 앱 ID·시크릿·OAuth state 비밀키가 설정됐다.
2. `Moonlight` Meta 앱의 Threads·Instagram 게시 권한과 HTTPS 콜백은 등록됐다. `@ml_bridgemaker` Threads 초대는 수락됐다. `@ml_bridgemaker` Instagram과 `@politic_officer` 두 플랫폼 초대의 수락이 남았다. Instagram 파일럿 OAuth에서 역할 부족 오류를 확인했다. 수락된 Threads의 OAuth 페이지는 Chrome에서 차단돼 다른 정상 브라우저 경로 또는 브라우저 차단 설정 확인이 필요하다.
3. Meta가 로컬 HTTP 콜백을 거부해 파일럿용 임시 HTTPS 터널을 쓴다. 운영 연결에는 안정적인 공개 HTTPS Hub 주소와 배포 환경 변수가 필요하다.
4. 로컬 파일럿 브랜드 핸들을 `ml_bridgemaker`로 설정했다. 다른 브랜드를 연결할 때는 올바른 핸들을 명시해야 하며, Threads·Instagram 모두 계정명이 다르면 저장을 거부한다.
5. 서울 운영 DB는 `account_key`와 `(workspace_id, provider, account_key)` 고유 제약으로 확장됐다. 상태 API는 계정 목록을 반환하고 OAuth 저장은 실제 외부 계정 ID를 키로 사용한다. Settings의 계정별 선택 UI와 게시 대상 브랜드 매핑은 아직 없다.
6. 장기 토큰 갱신 함수는 있으나 자동 실행 경로가 없다. 연결 뒤 만료 전 갱신·실패 표시가 필요하다.

### YouTube

1. Moonlight에 YouTube 전용 OAuth scope·callback·상태 조회와 전용 클라이언트 자격증명을 설정했다. 22세기 유목민 채널이 `connected`이며 반환 ID와 갱신 토큰을 확인했다. 업로드 구현은 없다.
2. 기존 Hub `GOOGLE_CLIENT_ID`의 프로젝트는 개인 계정 Cloud 프로젝트들에서 찾지 못했다. 별도 `classin.com` 계정의 Cloud 자격증명 화면은 재인증 대기 중이다. YouTube는 이 기존 Calendar 클라이언트와 분리된 전용 프로젝트를 사용하므로 연결의 선행 조건은 아니다.
3. Google OAuth 앱의 테스트 사용자 3명과 웹 클라이언트 설정은 완료됐다. `seoulmentoss@gmail.com`의 YouTube 웹 계정 전환에는 `문군`·`22세기 유목민`·`기독밈`이 보이고, Google OAuth에는 개인 기본 `Junhyeok Mun`·브랜드 `호가미`·`기독밈`이 보인다. 22세기 유목민의 브랜드 관리자 ID가 `호가미` 계정 ID와 일치했고, OAuth 반환 채널 ID도 일치했다. `문군`은 개인 기본 채널로 판단한다. 신규 미감사 프로젝트 업로드는 비공개로 제한되며 공개 발행에는 감사가 필요하다.
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

1. 남은 Meta 테스터 초대 3건의 약관/사실 확인과 수락을 마친다. 두 앱 시크릿은 로컬에 설정됐다.
2. 먼저 Threads `@ml_bridgemaker` 한 계정을 정확한 핸들로 OAuth 연결하고, status·프로필·DB 저장 영수증을 확인한다. 이 단계는 게시하지 않는다.
3. 계정별 저장 구조는 적용됐다. `@politic_officer` 및 Instagram 계정을 각각 OAuth 연결한다.
4. 이미지 렌더·미디어 보관, 버전별 검토, 게시 큐·중복 방지·성공 URL 확인을 구현한 뒤 실제 게시를 별도 검증한다.
5. YouTube는 22세기 유목민을 파일럿으로 연결하고 정확한 `UC...` ID와 갱신 토큰 저장을 확인했다. 다중 계정 DB 적용 뒤 문군·기독밈을 각각 별도 OAuth 승인으로 연결한다.

코드 근거: [`integration-inventory.md`](../integration-inventory.md), [`meta-threads.js`](../../apps/hub/lib/meta-threads.js), [`instagram-api.js`](../../apps/hub/lib/instagram-api.js), [`content-studio.jsx`](../../apps/hub/components/hub/pages/content-studio.jsx), [`20260804_0018_backend_optimization.sql`](../../supabase/migrations/20260804_0018_backend_optimization.sql).
