# 2026-09-21 브랜치 통합 기록

이 문서는 로컬 통합 작업의 실행 기록이다. 제품 스펙이나 운영 확정 결정을 대체하지 않는다.

## 범위와 보존

- 시작점: `09-mac1` / `origin/09-mac1`의 `6189760`.
- `git fetch --all --prune --tags`로 원격을 갱신했다.
- 메인 작업 폴더의 미커밋 7파일은 `a1c474f`에 보존했다.
- 기존 cleanup worktree의 미커밋 문서는 `c4726ec`에 보존했다.
- 시작점은 `codex/backup-09-mac1-20260921` 브랜치, 원본 패치와 ref 목록은 공용 Git 디렉터리의 `integration-20260921/`에 보관했다.
- `codex/integration-20260921` 전용 worktree에서 통합·검증하고 `09-mac1`에 fast-forward한다. `main` 병합, 원격 push, 배포, 운영 DB 변경은 이번 범위에 포함하지 않았다.

## 통합한 최근 브랜치

| 브랜치 | 가져온 끝 커밋 | 주요 내용 |
| --- | --- | --- |
| `origin/09.bigmac1.02` | `fb66c83` | `09.bigmac1`, `.01`, nice-hawking/cron 작업을 포함한 최신 기반 |
| `origin/codex/ai-personal-os-strategy` | `c2494a5` | 목표·성과 원장, AI 도움 후보·검토 흐름 |
| `origin/claude/moonlight-home-futura` | `ab87550` | 새 홈과 Futura 내비게이션 |
| `codex/eevee-office-v1` | `2bae587` | Office Council 전용 화면과 담당자 |
| `feat/integration-cleanup-0911` | `c4726ec` | 구현된 Telegram/OpenClaw 정리와 검증 기록 |

충돌한 디자인 결정 로그는 날짜순으로 양쪽 내용을 유지했다. 새 콘텐츠 변환에서 사용 중인 `@com-moon/content-manager` 의존성은 유지했다. cleanup 문서의 미구현 Gmail 삭제 계획 등은 실행하지 않았다.

## 검토 후 과거 ref로 보존한 작업

최근 작업과 무관한 예전 실험을 재도입하지 않도록 아래 ref는 삭제하지 않고 남겼다. 모두 내용이 동일하다고 판정한 것은 아니다.

- `codex/full-repair`: 4월의 기존 public web/dashboard 구조 실험.
- `backup/real_v1.3-bm-20260804`: calendar-task-view 수정은 현 코드에 동일하게 반영됨.
- `origin/real_v1.2`: 현재 영속 Account 저장 흐름보다 오래된 변경.
- `origin/claude/vigorous-taussig-0f4251`: 초안 목적은 최신 mentor-draft 흐름에 재구현됨.
- `origin/codex/moonlight-phase0-trust`, `origin/codex/moonlight-phase1a`: 이전 task 체계의 이력으로, 현재 pms-command/agent-command와 함께 무조건 병합하지 않음.
- `origin/real_v1`: 이전 content_outcomes/qualified 실험; 완전 대체 여부를 단정하지 않고 보존.
- `claude/quizzical-pare-3e3f41`: 미반영된 소규모 BrandMark 표현 변경을 과거 디자인 후보로 보존.

그 밖의 조사한 이전 브랜치들은 시작점의 조상 이력에 포함돼 있었다.

## 통합 후 수정

- API 서버 credential이 Hub middleware를 통과하도록 정합성을 맞추고, MCP read에도 credential을 전달했다. 일반 페이지는 계속 운영자 세션을 요구한다.
- 빠른 메모의 재시도 timestamp/요청 ID를 유지하고, 콘텐츠 연결을 journal RPC와 실제 readback으로 검증한다. 기존 프로젝트 메모 생성 진입도 canonical journal 화면으로 연결했다.
- AI가 제안한 할 일은 실제 저장 영수증 확인 후 완료로 표시하며, 중복 클릭·재시도는 같은 ID를 쓴다. 메모를 고친 뒤 돌아온 오래된 추출 결과는 폐기한다.
- AI 후보 생성의 인증 실패·응답 유실에서는 요청 ID와 복구 결과를 보존한다.
- 일일 브리핑은 실제 조회된 데이터 구조와 조회 상태를 AI에 전달한다. 연락 초안 요청 취소와 복사 오류 처리를 정리했다.
- 홈과 브리핑의 신호 이동표를 공유하고, 홈의 미연결·부분 조회·오류 상태와 재조회 기능을 바로잡았다. 일정 날짜 범위는 KST 기준이다.
- 전역 AI 패널 코드는 처음 열 때 로드한다. 이후 닫기/열기에서는 컴포넌트를 유지한다.
- agent scope의 JavaScript 값과 TypeScript 선언을 맞췄다.

## 검증

- 전체 Node 테스트: **1,622 통과 / 0 실패 / 11 선택 실행 제외**. 기본 테스트 파일 범위를 그대로 사용하고 `--test-concurrency=1`로 실행했다.
- 병렬 실행에서는 호스트의 PostgreSQL 공유 메모리 ID 한도로 일부 `initdb`/기동 실패가 발생했다. 순차 실행에서는 모두 통과했으며 시스템 설정이나 다른 프로세스를 변경하지 않았다.
- 변경한 journal PostgreSQL 회귀: 별도 **18 통과**. 중복 저장, timestamp 불일치, 콘텐츠 연결 재시도·원자성 포함.
- 새 태그·검색 migration의 선택 PostgreSQL 회귀: 별도 **12 통과**. 필터·페이징·KST 경계·권한 및 재적용 포함.
- `npm run build`: Hub·Engine 성공.
- `npm run typecheck`: 4개 workspace 성공.
- `npm run check:contracts`, `npm run check:classin`: 성공.
- production dependency audit: 취약점 0건.
- 실제 로컬 브라우저: 홈 preview, AI 패널 열기/닫기/재열기, 저장 불가 시 메모 입력 보존, Office 진입, 목표 화면 확인. 모바일 390px에서 홈의 가로 넘침 없음. 확인한 화면의 error/warn 콘솔 기록 없음.

## 운영 적용 경계

이번에 추가로 포함된 migration은 `20260920_0035_journal_tags_search.sql`, `20260921_0036_operating_goals.sql`, `20260921_0037_ai_assistance.sql`이다. 로컬 임시 PostgreSQL에서 검증했지만 운영 DB에는 적용하지 않았다. 실제 배포에서는 대상 환경의 migration 적용 상태와 인증·AI provider 설정을 별도로 확인해야 한다. 브라우저 검증은 운영 credential을 복사하지 않은 preview 환경에서 진행했다.
