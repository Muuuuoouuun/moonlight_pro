# 원고 책상 · 브랜드 Threads 올리기 (16a · 16b)

> 상태: **운영자 확정(2026-11-02) · 구현 · 로컬 검증 / 운영 DB 0073 적용 · 배포 · 실계정 게시 확인 전**
> 관계: `2026-09-23-studio-simplification.md` §3의 표면 예산(사이드 패널 없음 · 본문 컨트롤 6개)을 대체한다. 그 스펙의 저장·AI·템플릿·더보기 계약은 그대로다. `docs/README.md` §3의 "콘텐츠 직접 발행 · 보류" 중 **Threads 글**을 이 스펙이 연다(Instagram · YouTube · 예약 자동 올리기는 그대로 다음 단계).
> 시안: `docs/design-studies/2026-11-02-content-studio-brand-publish/`(16a 원고 책상 · 16b 올리기 창). 운영자 지시: "Threads 먼저, 여백 칸 포함해서 16a·16b 구현 ㄱㄱ".

## 1. 확정한 것 (운영자 2026-11-02)

1. **직접 발행은 Threads 글부터.** Moonlight가 브랜드의 Threads 계정에 글(연결 글 포함)을 올린다. 카드뉴스(Instagram) · 쇼츠(YouTube)는 연결 상태만 보이고 "다음 단계"로 둔다.
2. **원고 책상에 여백 칸을 둔다.** 왼쪽 = 이 글(연결 글 목차) · 결과물 · 기록, 오른쪽 = 브랜드 말투 · 올릴 곳 · 마지막 올리기.
3. **브랜드는 원고지 맨 위에서 고른다.** 브랜드 = 올릴 계정이자 AI '브랜드 말투'의 근거.

## 2. 원고 책상 (16a)

| 자리 | 내용 |
|---|---|
| 머리 | `원고 작성` 제목 · 저장 상태 한 단어 · 새 글 · 더보기 (변화 없음) |
| 왼쪽 여백 176px | 이 글: 연결 글 목차(번호 · 첫 줄 · 글자 게이지, 500자 초과는 빨강) · 결과물: 스레드/카드뉴스/쇼츠 상태(◐ 쓰는 중 · ✓ 올라감 · ● 있음 · ○ 비어 있음) · 기록: 버전 기록 · 예약 · 마지막 올리기 |
| 원고지 | 브랜드 pill · 형식 탭 → 제목(30/300) → 원문 메모(접힘) → 연결 글 블록 → AI → 하단 바 |
| 오른쪽 여백 232px | 말투(보이스 첫 줄 · 규칙 2개 · 금지어 수와 이 글에서 찾은 수, 찾으면 ◇ 권장) · 올릴 곳(Threads · Instagram · YouTube 연결 상태와 남은 일수) · 마지막 올리기 |

- **글 폭** 최대 600px(한글 약 35자), 원고지 안쪽 좌우 56px(왼쪽 안에 연결 글 번호와 이음선).
- **연결 글 블록**: Threads 글은 블록마다 번호와 `n / 500`. 지금 쓰는 블록 번호만 잉크(현재 위치). 줄 끝 Enter 두 번 = 다음 연결 글(본문은 지금처럼 빈 줄로 나뉜 한 문자열 — 엔진 · 미리보기 · 올리기가 같은 규칙, `lib/thread-posts.js`). 블록 맨 앞 Backspace = 앞 글과 잇기. 가운데 빈 블록은 편집기 안에만 있다(본문에서는 빈 줄로 합쳐진다).
- **하단 바**: 요약(연결 글 수 · 글자 수, 500자 초과면 이유 한 줄 빨강) · 복사(outline) · 예약 · **올리기(유일한 primary)**. 지금까지의 `발행했음`은 올리기 창의 `직접 올리기`로 옮겼다.
- 결과물 전환 select는 왼쪽 여백의 결과물 목록이 대신한다. 1100px 아래에서는 왼쪽 여백이 결과물 한 줄로, 오른쪽 여백은 원고지 아래로 간다. 700px 아래 본문 16px.

## 3. 표면 예산 (재발 방지 — `content-studio-surface.test.mjs`)

- 머리 버튼 3개(저장 재시도 · 새 글 · 더보기) — 그대로.
- 원고지 컨트롤 최대 7개: 브랜드 · 형식 탭 · 제목 · 원문 메모 · 복사 · 예약 · 올리기. primary는 올리기 하나.
- 왼쪽 여백은 이동 버튼뿐(입력 칸 없음), 오른쪽 여백은 읽기만(입력 칸 · 폼 컨트롤 없음).
- 기획 6칸 · 채널 추가 · 버전 · 내보내기 · 목표 · 검토는 계속 `더보기`. 새 기능은 더보기나 올리기 창으로 간다. 원고지에 더하려면 하나를 빼거나 이 절을 고친다.

## 4. 올리기 창 (16b)

가운데 창(Drawer `presentation="compact"`, 1040px, 600px 아래 전체 높이 시트). 왼쪽 세 단계, 오른쪽 미리보기 + 올리기 전 확인.

1. **어느 브랜드** — 브랜드 타일(아이콘 · 이름 · @핸들 · Threads 상태). 고르면 원고의 브랜드가 바뀐다(저장 뒤 올라간다).
2. **어느 채널** — Threads · Instagram · YouTube Shorts 줄. 지금 원고 형식의 줄만 고른 상태. 상태는 기호 + 글자(● 연결됨 · ○ 연결 전 · ! 연결 만료/권한 없음은 빨강 1px).
3. **언제** — `지금 올리기` · `예약` · `직접 올리기`.
   - 지금 올리기: Threads 글만. 주 버튼이 대상을 말한다(`Class.Moon Threads에 지금 올리기`). 못 올리면 비활성 + 이유 한 줄(브랜드 없음 · 연결 전/만료 · 스위치 꺼짐 · 작업 표 없음 · 500자 초과 · 이미 올림).
   - 예약: 지금의 **알림 방식** 그대로(`content_schedules`, 홈 "지금 올릴 글", 밤 정리의 놓침). "그 시각에 자동으로 올리기"는 점선 비활성 — 예약 실행기가 없어서다.
   - 직접 올리기: 복사 · 채널 열기 · 발행 URL · 일시 → 발행 기록(운영자 확인, 지금의 `발행했음`).
- 올리기 전 확인: 브랜드 · 연결 글 수와 500자 · 계정 연결(남은 일수) · 저장 상태 · 금지어(◇ 권장, 막지 않음).
- 결과: `올리는 중`(계정 확인 → 올리기 → 링크 확인) → `✓ 올라감 · 글 열기` / `? 확인 필요`(다시 보내지 않음 — Threads에서 보기 · 올라갔어요(링크 기록) · 안 올라갔어요(정리)) / 첫 글을 보내기 전 실패는 "공개된 글 없음 · 다시 올릴 수 있음".

## 5. 서버 계약

- **작업 표** `threads_publish_jobs` + RPC `threads_publish_job_v1`(마이그레이션 `20261102_0073`). 0064(Go;Re 1건 시험)를 일반화했다.
  - 운영자가 누른 한 번 = 작업 하나(`request_id` 유일). 결과물 하나에 끝나지 않은 작업은 하나(부분 유일 인덱스). 이미 올린 결과물은 `already-published`.
  - 준비 단계가 저장된 본문의 SHA-256을 다시 계산해 운영자가 확인한 본문과 맞을 때만 작업을 만든다(`stale-body`). 결과물 · 콘텐츠 · 브랜드 소속이 맞아야 한다(`brand-mismatch`).
  - 상태: prepared → claimed → (creating → container_ready → publish_requested → post_recorded) × 연결 글 수 → verified. 어디서든 ambiguous. 운영자 정리 abandoned(not-posted · posted-manually · cancelled-before-send).
  - 보내기 직전 두 단계(creating · publish_requested)는 연결(같은 브랜드 · 계정 · 핸들 · 만료 30초 이상 · `threads_content_publish`)과 브랜드 활성을 다시 확인한다. lease 90초, 성공한 전이마다 연장.
  - **verified 전이가 같은 트랜잭션에서** `publish_logs`(id = 작업 id, provider `meta_threads`, event `api_published`, provenance `provider_verified`, external_verified true) · 결과물/콘텐츠 `published` · 예약 `published`를 남긴다.
- **서비스** `lib/threads-publish-service.js`: 저장된 본문 · 브랜드를 서버가 읽고(화면이 보낸 글을 믿지 않음), 브랜드 전용 Meta 앱 · 연결 · 권한 · 만료 · `/me` 핸들을 확인한 뒤에만 작업을 만든다. 연결 글은 앞 글에 `reply_to_id`로 잇는다. 첫 글을 다시 읽어 계정 · 본문 · 링크가 맞을 때만 verified. 응답을 잃으면 다시 보내지 않는다.
- **라우트**: `GET /api/hub/content/publish/targets`(브랜드별 Threads · Instagram 연결 상태, 토큰 · 계정 ID 없음), `GET|POST /api/hub/content/publish/threads`(마지막 작업 읽기 / 올리기 · 정리). POST는 쓰기 가드 + **운영자 세션 + 같은 출처**가 필요하고 서버 간 비밀만으로는 열리지 않는다. `maxDuration` 60초.
- **스위치**: 배포 환경 `COM_MOON_THREADS_PUBLISH_ENABLED=true`일 때만 보낸다(기본 꺼짐). 꺼져 있으면 창이 이유를 말하고 직접 올리기로 안내한다.
- 발행 로그 화면은 provider_verified 기록도 발행됨으로 센다(`lib/content-publish-log.js`).

## 6. 켜는 순서 (운영)

1. 서울 운영 DB: `npm run db:migrate -- --expect-ref ncgpnqfulnlshegalmbd 20261102_0073_threads_publish_jobs.sql` → `npm run db:check`.
2. 브랜드별 Threads 앱 · 연결이 살아 있는지 설정 › 소셜 연결에서 확인(토큰 만료 · 권한 `threads_content_publish`).
3. Hub 환경 변수 `COM_MOON_THREADS_PUBLISH_ENABLED=true`를 `apps/hub/.env.production.local`에 넣고 `node scripts/vercel-env-push.mjs --app hub` → Hub 배포.
4. 짧은 글 1건을 한 브랜드에 올려 발행 로그 · 결과물 상태 · 글 링크를 확인한다.

## 7. 다음 단계 (이번 범위 밖)

- 예약 자동 올리기 — 분 단위 예약 실행기, 예약할 때의 본문 해시 = 승인, 고치면 다시 승인(16c "고쳐서 다시 승인"). Vercel 크론 주기 확인이 먼저다.
- Instagram 카드뉴스 — 카드 이미지 생성 · 공개 URL 보관.
- YouTube Shorts — 영상 파일 보관 · 채널 ↔ 브랜드 지정.
- 브랜드 상세의 채널 · 발행 화면(16d), 글 상태 8가지 전부를 발행 로그에 맞추기(16c).
- 성과 숫자 자동 수집(`threads_manage_insights` 권한 별도 승인).

## 8. 검증 기록 (2026-11-02, 로컬)

- `scripts/threads-publish-jobs.test.mjs` — PostgreSQL 16에서 RPC 흐름(준비 · 중복 · 진행 중 · 본문 변경 · 브랜드 불일치 · 500자 초과 · 연결 글 2개 · 확인됨이 발행 기록/상태/예약을 남김 · 이미 올림 · 확인 필요 → 정리 → 다시 · 연결 끊김 차단 · 권한). root에서는 initdb가 거부해 건너뛰고, 비루트 사용자로 통과를 확인했다.
- `lib/threads-publish-service.test.mjs` — 순서 · reply 체인 · 응답 유실(재전송 없음) · 첫 글 전 실패(정리 후 재시도 가능) · 연결 글 부분 실패 · 보내기 전 차단(작업 안 만듦) · 검증 실패.
- `app/api/hub/content/publish/threads/route.test.mjs` — 세션 게이트 · 서버 비밀만 거부 · 다른 출처 거부 · 확인 플래그 · 기본 꺼짐.
- 루트 `npm test`(클라우드, root): 6454 tests · 통과 6419 · 실패 6 · 건너뜀 29. 실패 6건은 모두 PostgreSQL 실시험이 root에서 initdb 거부로 멈춘 것(이번 변경 전부터의 환경 문제). `database-readiness.test.mjs`와 새 `threads-publish-jobs.test.mjs`는 비루트 사용자로 따로 돌려 통과했다. `npm --workspace @com-moon/hub run build` 통과.
- 브라우저(1440 · 390, 라이트 · 다크): 브랜드 고르기 · 연결 글 나누기/잇기 · 자동 높이 · 말투와 금지어 권장 · 올리기 창 세 모드 · 올라감/확인 필요 표시. 응답은 화면 확인용 가짜 응답이며, **실제 Threads 게시와 운영 DB 왕복은 아직 하지 않았다.**
