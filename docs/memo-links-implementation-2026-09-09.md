# 메모 → 업무 연결 적용 기록

상태: 코드 구현·로컬 검증 완료 / 운영 DB 적용 대기.

## 사용 흐름

- 프로젝트의 **메모** 보기에서 빠른 입력 받은함과 프로젝트 메모를 읽는다.
- 원문을 보면서 제목·프로젝트·기한을 지정해 **할 일로 만들기**를 누른다. 계획 상태로 생성된다.
- 이미 존재하는 업무는 선택 후 **선택한 업무에 연결**한다.
- 메모의 **이 메모를 사용하는 업무**에서 업무로 이동한다.
- 칸반 카드는 우측 원본 메모 패널을 열고, 패널의 **업무 편집 · 상태 변경**으로 편집한다. 상태 드롭다운도 유지된다.
- 메모 제목·본문 검색 및 전체/업무에 연결됨/연결 없음 필터를 제공한다. 읽기 실패·상한 도달 시 연결 없음을 확정하지 않는다.

## 데이터 계약

`notes`와 `work_orders`의 원문을 복제하거나 변경하지 않는다. `task_memo_links`가 업무와 원문을 연결한다. 받은함은 source=inbox, kind=capture/note/idea만 읽는다. 고객 리드 전환과 AI 제안 실행은 이 기능에 포함하지 않는다.

Hub `/api/hub/memos`는 읽기 repository와 Engine BFF다. Engine `/api/memo-links/command`는 shared-secret 검증 후 `link_memo_task_v1` RPC를 호출한다. workspace는 Hub의 서버 설정에서 지정한다.

RPC는 원본별 transaction lock으로 전환을 직렬화한다. 같은 원문에서 재시도하면 이미 생성한 업무를 반환한다. 새 업무 생성과 연결 삽입은 한 transaction이다. 기존 업무 연결도 동일 쌍이 중복되지 않는다. 원문·업무·프로젝트가 동일 workspace에 존재해야 한다. 브라우저 역할에 새 테이블 직접 접근이나 RPC 실행 권한을 주지 않는다.

조회는 소스별 100건 제한이며, 원문별 관계를 재조회해 연결 여부를 판정한다. 칸반 패널은 task ID로 연결을 조회하고 해당 원문을 정확히 가져온다. 전체 서버 검색·페이지 이동·메모 편집·연결 해제는 이번 범위 밖이다.

## 검증

- 전체 Node 테스트 742개 통과(검증 시점의 공유 작업트리 기준).
- 계약 검사, typecheck, Hub·Engine production build 통과.
- 격리된 PGlite DB에서 실제 migration과 `supabase/tests/task_memo_links.sql` 실행: 생성, 재시도 중복 방지, 기존 업무 연결, 원문 보존, workspace 경계, 잘못된 참조 거절, 연결 삽입 실패 시 task rollback 통과.
- 브라우저의 명시적 가상 데이터 fixture에서 필수값, 생성 후 관계 재조회, 기존 업무 연결, 본문 검색, 연결 없음 필터 확인. 임시 fixture route는 제거했다.
- 실제 로컬 칸반에서 패널 열기/ESC 닫기·포커스 복귀 확인. 운영 데이터에 테스트 업무를 생성하지 않았다.
- 1440×1024 및 390×844에서 두 열/한 열 레이아웃 확인. 가상 데이터 캡처는 `artifacts/memo-links-2026-09-09/memo-workspace-desktop.png`.

## 운영 적용 제약

Supabase 관리 API가 **401 Unauthorized**를 반환해 migration 검증 요청이 거절됐다. 해당 요청은 BEGIN/ROLLBACK으로 감싼 테스트였으며, 원격 스키마 변경은 적용되지 않았다.

관리 API 인증을 복구한 뒤 다음 순서로 적용한다. 토큰은 채팅에 입력하지 않고 기존 로컬 환경 설정에서 갱신한다.

1. `node scripts/apply-migrations.mjs 20260909_0025_task_memo_links.sql`
2. Hub·Engine 변경 배포.
3. 운영자 세션에서 메모 1건 전환 → 새로고침 → 같은 원문 재시도 → 업무 1개 및 원문 연결 유지 확인.

Migration은 `supabase/apply-pending.sql` 및 migration runner 기본 목록에도 포함했다. 배포와 운영 저장 검증은 아직 완료로 간주하지 않는다.
