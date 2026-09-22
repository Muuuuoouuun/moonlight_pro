# 콘텐츠 성과 실행 계획

> REQUIRED: superpowers:subagent-driven-development. 요청 범위와 직접 입력 선택은 승인됨.

Goal: 콘텐츠의 요약·이번 주·월별 발행량과 수동 누적 성과를 한 탭에서 본다.
Architecture: 독립 server repository의 전체 workspace 원장 조회 → pure aggregation → read API. manual metrics는 기존 variant metadata와 updated_at CAS. UI는 독립 page와 편집 Drawer, 기존 내비 세 곳 연결.

- [x] Backend: lib/content-performance.js + tests; repositories/content-performance-ledger.js + tests; app/api/hub/content/performance/route.js + tests. 실패 테스트부터. year 검증, KST fullweek/year/month bounds, null-aware totals, paging, CAS/guard/errors. 문서 스펙의 정확한 집계 경계를 따른다.
- [x] UI: pages/content-performance.jsx/css + 필요 client helper/test. 요약/이번주/월별 SegmentedControl, 날짜·브랜드·채널 URL, 신뢰 상태/새로고침, count bars+표, 원고 링크, Drawer 숫자입력/기록시각/충돌 입력유지.
- [x] Navigation: hub-nav.js child, hub-data.js catalog, hub-app.jsx lazyPage(ssr:false). 내비 회귀 검사.
- [x] Review: backend/spec then whole codequality, 지적 수정. 기본 npm test 기준선 대비 확인, typecheck/contracts/Hub build, 브라우저390/1440 실사용 flow.
- [ ] Documentation/integration: README+spec 구현상태와 검증/한계 기록. 소유 파일만 commit, main 동시 변경 보존 병합, 자기 서비스/worktree 정리.

API shape와 root/agent ownership는 작업 메시지에 정확히 전달하고 테스트로 고정한다. 운영 환경 변수·DB·배포 및 자동 수집 루틴은 변경하지 않는다.

## 검증 기록 (2026-09-22)

- 시작 기준선: 1497 tests / 1486 pass / 11 skip / 0 fail.
- 기능 구현 후: 1519 tests / 1508 pass / 11 skip / 0 fail. 신규 22개 통과. typecheck(지원 workspace), 계약 검사, Hub production build 통과.
- 저장소/API 검증: 160건 초과와 서버 짧은 페이지, 부분 조회 실패, workspace 분리, KST 주·월·연도 경계, 미기록/0, 정확한 updated_at 비교와 metadata 보존.
- 브라우저: dev 및 production 빌드에서 1440px/390px 확인. 저장소 미연결 preview, 171건 집계, 요약/이번 주/12개월 전환과 월 드릴다운, URL 채널 필터 유지, 직접 기록 후 집계 갱신, entry 없는 CAS 충돌, 저장 응답 단절 후 재조회, HTTP200 error 재시도와 모바일 가로 넘침 없음. production은 임시 로컬 세션으로 인증했으며 인증 게이트를 수정하지 않았다.
- 브라우저의 live 레코드/저장 응답은 테스트 경계에서 주입한 값이다. 실제 Supabase에 수치를 저장한 검증을 뜻하지 않는다. 저장소 미연결 preview는 실제 로컬 API 응답으로 확인했다.
- 품질 검토에서 원고 복원이 최신 성과를 덮어쓰는 기존 경로를 발견했다. 0037로 현재 성과만 보존하도록 수정했으며, 임시 로컬 PostgreSQL에서 4개 테스트(하위 검증 포함)가 실제 실행됐다. 기존 전체 workflow SQL 계약·복원 결과/스냅샷/receipt/재시도·권한·마이그레이션 재실행도 검증했다.

## 운영 적용과 후속 수집

- 코드 적용 전에 `supabase/migrations/20260922_0037_content_performance_restore.sql`을 적용한다. 기존 0026 workflow 함수가 전제이며 테이블/컬럼 추가는 없다. 현재 저장된 성과를 본문 버전 복원으로 되돌리지 않는 수정이다. 운영 DB 적용은 이번에 수행하지 않았다.
- 직접 기록은 `content_variants.meta.performance`의 누적 views/shares/replies, capturedAt, source를 사용한다. 외부 API/브라우저 수집을 연결할 때도 수집 시각·출처와 nullable 수치를 같은 계약으로 남긴다. 지정 채널·대시보드·주기 및 실제 자동 수집은 후속 범위다.
- 기존 복원 계약대로 published_at은 원고 버전 값으로 복원된다. 따라서 복원 후 발행 기간이나 집계 대상 포함 여부는 달라질 수 있어도 최신 성과 기록 자체는 유지된다.
