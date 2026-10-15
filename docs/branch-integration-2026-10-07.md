# 2026-10-07 로컬 작업 통합 기록

운영자가 요청한 로컬·원격 작업의 로컬 통합과 개발 서버 실행 기록이다. 제품 결정이나 운영 배포 완료를 뜻하지 않는다.

## 원천과 포함 관계

시작 작업 폴더는 `10.cmac2.0` / `42d12e4c`, 로컬 main은 `9f6f63e4`였다. `git fetch --all --prune` 뒤 원격 main은 `d43783d0`이었다. 원본 작업 폴더·`claude/record-wide` 작업 트리·자동 로그인 detached 작업 트리 모두 미커밋 변경이 없었다.

통합 시작 시 작업용 브랜치를 제외한 로컬 83개·원격 86개, 총 169개 ref를 대조했다. 최신 원격 통합 `origin/claude/inspiring-heisenberg-naw856` / `cdb48f4e`의 조상인 ref는 148개였다. 이 브랜치는 `origin/main`과 `origin/codex/moonlight-sync-20261007` / `4fd639f4`를 모두 포함한다. 전용 `codex/local-integration-20261007` 작업 트리에서 이를 기준으로 로컬에만 있던 `claude/record-wide` / `74f4e9ee`를 병합했다. 코드 충돌은 없었고 DESIGN.md의 두 충돌은 최신 SortHead 위치·목표/디자인 결정과 넓은 기록창 계약을 함께 남겼다.

Git ancestry만으로 포함 여부를 판단할 수 없는 나머지는 다음과 같이 대조했다. 재작성·squash로 들어간 작업을 원본 커밋으로 다시 적용하지 않았다.

| 원천 | 판정과 근거 |
| --- | --- |
| `claude/record-wide` | 새 병합: 넓은 연락 기록창·고객 메모 모드·휴대폰 시트·오늘 연락의 저장하고 다음·키보드 대상 방어 |
| `origin/claude/gifted-darwin-de0fsl` | 확인할 것 7커밋이 재작성돼 포함됨. [선별 통합 검증](evaluations/2026-10-07-check-items-integration/README.md)의 대응표와 이후 안전 보정·feature gate 유지 |
| `origin/claude/loving-feynman-cyokq6` | 읽기 전용 db:usage 도구 포함. [주간 점검 §6.1](evaluations/2026-10-07-weekly-direction-check.md)에서 코드 동일성 확인 |
| `origin/claude/zen-shannon-qyu1qn` | 오래된 수치를 최신 원격 통합의 재실측 문서가 대체. 이전 다음 마이그레이션 번호를 되살리지 않음 |
| `origin/codex/monday-news-roundup`, `origin/codex/report-insight-quality`, `origin/codex/research-reports-completion` | 최신 원격 통합이 흡수. 주간 점검 §6.1 대조와 해당 기능·마이그레이션 보존 |
| `origin/codex/guru-content-depth` | 재작성 커밋 `ba578455` 및 golden 보정 `305fb536` 포함 |
| `origin/codex/memo-agent-requests-design` | 두 문서의 patch 동등성 확인(`git cherry`), 재작성 커밋 `2499fa61`·`b3acc114` 포함 |
| `origin/codex/research-inbox`, `origin/codex/research-inbox-release` | main의 squash 및 배포 기록으로 포함. [9/30 통합 기록](branch-integration-2026-09-30.md)에서 원본 누적 patch 동일성 검증. 배포 기록 커밋은 patch 동등 |
| `origin/claude/studio-tab-development-yutzfd` | 9/30 통합에서 기존 예약·발행 로그는 포함 판정, 표지/훅과 후속편은 선별 적용·회귀 수정됨. 옛 SQL을 다시 추가하지 않음 |
| `origin/09.bigmac1.02` | audience/promise/currentFocus 전달·cadence 라벨 3종이 현재 코드에 있음. 초기 브랜드 값은 이후 운영자 답 기반 브랜드 마이그레이션으로 대체됨 |
| `backup/real_v1.3-bm-20260804` | 과거 스냅샷 보존. calendar-task-view는 현 코드와 동일. 오래된 셸·내비 변경 재도입 안 함 |
| `claude/quizzical-pare-3e3f41` | 8월 BrandMark WIP 디자인 후보 보존. [9/21 통합 기록](branch-integration-2026-09-21.md)의 제외 판단 유지 |
| `codex/full-repair` | 4월 public web·dashboard 구조 실험 보존. 현재 active Hub/Engine 구조를 이전 구조로 되돌리지 않음 |
| `origin/codex/moonlight-phase0-trust`, `origin/codex/moonlight-phase1a-durable-task` | 과거 task 체계의 구현 이력 보존. 현재 PMS/Agent 저장·복구 계약과 중복 적용 안 함. 9/21 제외 판단 유지 |
| `origin/real_v1`, `origin/real_v1.2`, `origin/real_v1.3(bm)` | 예전 content_outcomes·Account·Studio·PMS WIP 보존. 최신 구현의 완전 동등성을 주장하지 않으며 9/21·9/30 기록의 보존 판단 유지 |

원본 ref와 비교 결과 JSON은 공용 Git 디렉터리의 `integration-local-20261007/refs.txt`·`unmerged.json`에 보관했다. 원본 브랜치나 다른 세션의 작업 트리를 삭제하지 않았다. 역사적 WIP까지 모두 동일하다고 처리하는 `ours` 병합은 하지 않았다.

## 통합 검토와 검증

병합 커밋은 `b07276db`, 통합 검토에서 찾은 세 가지 복구 문제의 보정은 `90c23fc7`이다.

- 같은 고객의 기록 후보 A에서 긴 글 저장이 실패한 뒤 B 저장이 성공하면 A의 복구 글이 지워질 수 있었다. 후보별 복구 자리와 고객별 색인을 두고 요청 ID가 맞을 때만 지운다. 기존 복구 키와 저장소 차단 시 메모리 복구도 유지한다.
- 연속 고객 메모의 두 번째 초안부터 회사/개인 범위가 기본값으로 돌아갔다. 확인된 저장본과 충돌 저장본의 범위를 다음 초안으로 잇는다.
- 기억한 Preview에서 쓰는 중 저장소 재조회가 live로 바뀌면 작성기를 다시 세워 글이 화면에서 사라졌다. 같은 고객의 Preview→확인된 저장소 전환은 작성기를 유지해 기존 복구 경로로 옮긴다. 미확인 요청을 자동 재전송하지 않고, 서로 다른 확인된 저장소의 초안은 분리한다.

운영자 Mac에서 최종 코드 `90c23fc7`을 검증했다.

| 검사 | 결과 |
| --- | --- |
| `npm test` | 5497 tests · 통과 5483 · 실패 0 · skip 14, 약 79초 |
| `npm --workspace @com-moon/desktop test` | 346 tests · 실패 0 |
| `npm run lint` | 구문 가드 1735 source files · 문제 0(의미·스타일 검사는 아님) |
| `npm run typecheck` | 4 tasks 성공 |
| `npm run check:contracts` · `npm run check:classin` | 모두 통과 |
| `npm run build` | Hub·Engine·Windows 데스크톱 패키징 3 tasks 성공(최종 재검사에서 변경 없는 2 tasks는 캐시 재사용) |
| 네이티브 Mac 빌드 | `swift build -j 2 --sdk /Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk` 성공 |
| 네이티브 Mac 계약 | Office meeting API·store, Office requests contract 9/store 9, Hub transport 24 · 모두 통과 |

루트 테스트는 저장소의 `*.test.mjs` 675개를 포함한다. skip 14는 테스트 DB 등 실행 조건이 필요한 검사다. 네이티브 앱 실제 조작과 Windows 실기 확인을 이 결과로 대신하지 않는다. 빌드의 기존 Next.js middleware→proxy 권고와 데스크톱 Turbo output 설정 경고는 비차단이다.

Mac 기본 `swift build`는 CLT의 27 SDK에서 `SwiftUIMacros.StateMacro` 플러그인을 찾지 못했다. 저장소의 `script/build_and_run.sh`에 이미 있는 26.5 SDK 선택을 따라 재빌드하니 통과했다. 소스를 바꾸거나 Xcode 설정을 바꾸지 않았다. 설치된 펫을 교체·중지하지 않았다.

## 로컬 실행과 운영 경계

로컬 main에 통합 결과를 fast-forward하고 원래 작업 폴더에서 의존성을 설치한 뒤 Hub(`127.0.0.1:3000`)·Engine(`127.0.0.1:3001`) 개발 서버를 실행했다. 기존 env 파일은 그대로 사용하고, Hub의 Engine 주소만 해당 개발 프로세스에서 로컬 3001로 지정했다. Hub와 Engine의 `/api/health`는 모두 HTTP 200·status ok·Supabase 연결 성공이며 Hub→Engine도 reachable이다. 브라우저에서 첫 화면·고객 목록이 로딩을 마치고 실제 읽기 결과를 표시하는 것, 고객 드로어→연락 기록의 요약·자세히·모드·저장 제어가 렌더되는 것과 콘솔 오류·경고 0을 확인했다. 업무 데이터 쓰기나 실제 모델 생성은 하지 않았다.

재실행 명령은 아래와 같다. Turbo의 기본 env 필터가 프로세스의 로컬 주소를 버리지 않도록 `--env-mode=loose`를 지정하고 Hub·Engine만 선택한다.

```sh
COM_MOON_ENGINE_URL=http://127.0.0.1:3001 NEXT_DIST_DIR=.next.local-integration npm exec -- turbo run dev --filter=@com-moon/hub --filter=@com-moon/engine --env-mode=loose
```

실행 로그는 `/tmp/moonlight-integration-1007-dev.log`다. 임시 통합 작업 트리는 최종 문서 반영 뒤 제거하며 원래 작업 브랜치와 기존 다른 작업 트리는 보존한다.

원격 push·PR 변경·Vercel 배포·운영 DB 마이그레이션은 실행하지 않았다. 이전 PR #35도 변경하지 않았다. 원격 통합에서 닫아 둔 `officeWorkBreakdown`·`checkItemUnblock`·`decisionJournal` feature gate는 모두 false를 유지한다. 0069 저장 회의·0070 끝내기 영수증의 운영 DB 적용 여부는 이 로컬 Git 통합으로 바뀌지 않는다. 넓은 기록창은 원 스펙의 권장/미결 구분과 알려진 빈틈을 유지하며, 사용자 화면 확인을 대신해 확정이라고 표시하지 않는다.
