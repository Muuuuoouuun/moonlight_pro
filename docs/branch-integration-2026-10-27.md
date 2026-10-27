# Moonlight 관련 작업 통합 · 컴포넌트 검수 (2026-10-27)

기준 main은 PR54 병합 `053aa056fc09c08ad41b3cb91b960abf0e6d2d01`이다. 사용자의 전체 관련 변경 병합·디자인 컴포넌트 점검 요청에 따라 별도 복제본과 `codex/integration-design-20261027`에서 작업했다. PR은 [#55](https://github.com/Muuuuoouuun/moonlight_pro/pull/55)이며 검증 중 draft로 시작했다. 최종 SHA·CI·병합 상태는 PR의 최신 기록을 따른다.

## 기존 작업 보존

다음 체크아웃을 읽기 전용으로 확인했다. 어떤 체크아웃도 reset·stash·checkout·삭제하지 않았다.

| 체크아웃 | 시작 head | 상태 |
| --- | --- | --- |
| `moonlight_proj` | `d50ba16b` · `claude/today-overview-depth` | 미추적 `docs/evaluations/2026-10-22-code-optimization-review.md` 보존 |
| `eight-area-quality/moonlight_proj` | `c0d090bc` | clean, 미병합 품질 수정 |
| `moonlight_pro-neumorph` | `3321a356` | clean, PR49 |
| `moonlight_pro-review-ab` | `32bf193a` | clean, PR53 |
| `moonlight_pro-today-bottom` | `64c21bd6` | clean, 디자인 목업 문서 |

## 통합과 제외

| 대상 | 판단·근거 |
| --- | --- |
| PR53 `32bf193a` | 최신 main과 충돌 정리된 보안·정합성 변경. OAuth/login 반환 경로, KST 현황, 열린 할 일 우선 정렬·동점 id, 문의 검색, CLI 업로드 제외, MCP GUID 호환 통합 |
| PR49 `3321a356` | 공용 판·입력·탭·창·칩의 depth C 기준이 아직 main에 없어 통합 |
| `78b6300f` | 결제 저장 확인, 콘텐츠 계획 초안 유지, 브랜드 로그 범위가 main에 없어 통합 |
| `67693fd5` 및 `1465e205` | 오늘 할 일 그룹·메타, 실제 기록 기반 연속 띠, 단일 게이지와 통합 회귀 교정. `claude/eager-pascal-6so5a3`에 위 PR49·초안 보존 수정과 함께 포함되어 있어 그 브랜치를 통합 |
| `c0d090bc` | PR54와 동일하지 않음. 제품 문의 represented atomic upsert, 월별 저장 확인, 루틴 오류/빈 상태 분리, 탭 키보드 탐색, reduced-motion 취소, 기존 서버 자격에 따른 진단 경계 등 누락 품질 변경 통합 |
| `64c21bd6`, `a23a91d3`·`1be7bc26`, `6c68eacc` | 관련 통합 브랜치의 디자인 연구·확정 기록 문서. 오늘 14/15안은 운영자 미확정 목업으로만 보존하며 화면에 적용하지 않음 |
| PR47 `934d9232` | SVG 브랜드 세트는 main의 PNG 브랜드 타일 결정(`21853b48`)으로 대체되어 제외. 새 채널 아이콘을 임의로 확장하지 않음 |
| `3e65f9f8` | `git cherry origin/main`에서 patch-equivalent. 사이드바 현재 위치 수정은 이미 반영되어 재적용하지 않음 |
| `7fc159bb`, `3217d713` 및 파생 로컬 브랜치 | Mac 로그인 Tab 파일·시험·스크립트는 main과 동일. 개별 할 일 저장/재조회는 main에 있고 이후 삭제·연결 세대 처리로 확장됨. 중복 재병합 제외 |
| `codex/brand-api-connect`, desktop/production release, `claude/design-1021`, 그 밖의 조상 브랜치 | 이미 main에 포함. 재병합 불필요 |
| `claude/eager-pascal-2b0sgi`·`6so5a3`·`ixx5vd`·`wpjld4`, peaceful/relaxed/sweet/today-bottom refs | 같은 관련 커밋 묶음 또는 그 조상. 하나의 통합 경로로 처리 |
| `claude/eager-pascal-8n0dgv` | 관련 작업을 모은 후속 통합 ref. 이번 PR이 최신 main·PR53·6so5a3를 직접 합치므로 과거 의존성 그래프를 다시 가져오지 않음 |
| `backup/real_v1.3-bm-20260804`, `claude/quizzical-pare-3e3f41`, `codex/full-repair` | 오래된 백업·중간 WIP·별도 Office 실험. 현재 요청의 완성된 관련 수정이 아니므로 제외하고 원본 보존 |

## 병합 보정

- PR54의 dependency pins, lockfile, MCP 전송 보안·브랜드 API 변경을 유지했다. 과거 품질 브랜치의 직접 `@vercel/cli-config` 추가는 최신 그래프에 필요하지 않아 제거했다. 첫 CI의 lockfile 불일치 설치 실패를 이 원인으로 확인했고 `npm ci --dry-run --offline --ignore-scripts`로 수정 후 동기화를 확인했다.
- 중복 OAuth sanitizer import를 제거했다. return-path 공용 검증과 최신 브랜드 OAuth 앱 경계는 모두 유지한다.
- 루틴의 loading/error/preview/partial truth와 오늘 카드의 단일 막대를 함께 보존했다. partial은 완료 축하나 완전한 진행률 게이지로 나타내지 않는다.
- Progress에는 기본 접근성 이름을 주고 `aria-valuenow`를 0~100으로 제한한다. 실제 초과 달성 값은 `aria-valuetext`에 남긴다.
- forced-colors에서 그림자가 지워져 선택 상태가 사라지는 문제를 시스템 `Highlight` 색의 1px 윤곽으로 보완했다. 글자·배경은 브라우저 고대비 색 처리를 유지한다.
- main의 Tabs 가로 스크롤·터치 처리와 품질 브랜치의 roving keyboard 탐색을 함께 보존했다.

## 자동 검증

- 로컬 syntax lint: 1,923 files, 0 issues. 이 lint는 semantic/type/style 분석이 아니다.
- typecheck 4/4, contract checks, ClassIn checks 통과.
- Desktop 계약 시험 471 pass, 0 fail, 0 skip.
- Hub·Engine production build 통과.
- 접근성·공용 컴포넌트 집중 시험 25 pass, OAuth·루틴 등 집중 시험 37 pass.
- 로컬 전체 root suite: 6,433 tests, 6,398 pass, 20 fail, 15 skip. 실패 20개는 모두 Mac의 SysV 공유 메모리 32개 한도로 `initdb`가 시작되지 않은 환경 실패다. `ipcs`와 실행 프로세스를 읽기 전용으로 확인했으며 시스템 설정·공유 메모리·다른 작업자의 프로세스를 변경하지 않았다. 첫 샌드박스 시도는 네트워크/프로세스 제한으로 진행이 멈춰 이 작업의 해당 테스트 프로세스만 종료했다. 이후 재실행한 suite 결과가 위 수치다.
- CI에서는 PostgreSQL bin을 PATH에 올려 임시 DB 계약 시험을 실제 실행하도록 했다. 최종 정확한 head의 CI 결과는 PR55에서 확인한다. local 환경 실패나 skipped 검사를 성공으로 바꾸어 보고하지 않는다.

## 실제 화면과 조작

Browser plugin의 browser 스킬이 없어 설치된 Playwright로 loopback `127.0.0.1:3137`을 검증했다. 운영 env는 가져오지 않았고 외부 요청과 실제 저장 요청은 차단했다. 목업 업무 데이터를 소스에 추가하지 않았다.

- 1440×1000·390×844에서 오늘의 빠른 입력과 첫 행동, 16px 모바일 입력, 가로 넘침 없음 확인.
- 홈·오늘·현황·내 작업(`work/my`)·프로젝트(`work/projects`)·제품·고객·브랜드 로그·콘텐츠 소재/제작·Runs의 의미 있는 Preview/빈 화면을 확인. 홈·오늘·현황의 구분은 유지한다.
- 라이트/다크·forced-colors, 입력 홈·선택 pill·카드·아이콘·사이드바·중앙 창·모바일 bottom sheet를 확인.
- 빠른 입력을 반복 열기/닫기, Escape/닫기 버튼/오버레이 닫기, 초안 재열기, 제품 보기 전환, 모바일 내비게이션과 브라우저 Back 확인. 관련 콘솔 오류 0.
- 스크린샷과 임시 UI 스크립트·결과 JSON은 저장소 밖 작업 산출물로 준비했다. 스크린샷 파일명은 `moonlight-today-desktop.png`, `moonlight-today-dark.png`, `moonlight-today-mobile.png`, `moonlight-forced-colors.png`, `moonlight-capture-desktop.png`, `moonlight-capture-mobile.png` 등이다.

## 남은 한계·운영 경계

- 실제 운영 데이터의 저장·연결 OAuth·실제 모바일 기기·Windows 설치·모든 화면/상태 조합을 이 UI Preview 검사로 대체하지 않는다.
- Mac stale-cookie audit는 기존 CI에서 안전 검토 대기 상태로 skipped다. 이번 작업에서 실행하거나 수정하지 않았으며 통과로 세지 않는다.
- 열린 할 일이 약 158건 이상일 때 160건 읽기 창의 완료 항목 수가 덜 셀 수 있는 PR53의 알려진 한계는 남는다. 이를 위한 운영 DB migration은 범위 밖이다.
- 운영 DB migration, credential/보안 설정, 로컬 MCP 등록, 외부 Claude API/유료 모델 호출, 수동 운영 배포는 실행하지 않았다. 병합이 실행하는 기존 자동 CI/CD 결과는 PR·main의 해당 SHA에서 별도 확인한다.
