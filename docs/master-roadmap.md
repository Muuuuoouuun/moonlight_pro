# Com_Moon Hub OS: 마스터 개발 플랜 (Master Roadmap)

## 1. 개요 (Overview)
Com_Moon은 3개 프로젝트(classinkr-web, sales_branding_dash, ai-command-pot)의 기능을 통합하고 자동화하여, 보스(Junhyuk Mun)의 **[세일즈 10x, 콘텐츠 자동화, 개인 운영체제(OS)]**를 구현하는 통합 Hub입니다.

## 2. 개발 철학 (Principles)
- **독립성(Air-gap)**: 회사 프로젝트와 데이터/코드 격리.
- **자동화 중심(Automation-First)**: n8n과 AI를 통한 실무 자동화.
- **자가 발전(Self-Evolution)**: 오류 발생 시 로그 기록 및 분석 루프 가동.
- **모바일 퍼스트(PWA)**: 스마트폰에서 즉시 실행 가능한 앱 경험.

## 3. 단계별 마일스톤 (Milestones)

### [Phase 0] 기반 구축 (Completed)
- **Turborepo 환경 구축**: Hub / Engine / packages 중심 실행 구조 완료.
- **PWA/Supabase 설정**: 모바일 환경 구축 및 데이터 DB 연동.
- **핵심 인프라**: `lib/hub-gateway`, `packages/content-manager` 생성.

### [Phase 1] 운영체제 가동 (Current)
- **Dashboard UI**: 운영 건/리드/카드뉴스 현황 실시간 모니터링.
- **Daily Brief / Playbooks / Settings / Command**: 운영 브리핑, SOP, 설정 점검, 명령 진입면 구축.
- **Command**: AI 자동화 명령 실행과 허브 진입을 하나의 조작면으로 통합.
- **에러 로그 시스템**: `error_logs` 테이블 통한 자가 진단 및 패치 시스템.
- **Plan tracker (`/dashboard/work/plan`)**: 마스터 로드맵 페이즈와 현재 진척을 한 화면에서 비교하는 운영자용 현황판. (shipped — UI + 시드)

### [Phase 2] 콘텐츠/세일즈 모듈 이식
- **Content Manager**: `classinkr-web`의 핵심 로직을 Hub OS 내 이식.
- **Content Studio (`/dashboard/content/studio`)**: 카드뉴스 작성·슬라이드 단위 미리보기·이메일/퍼블리시 핸드오프. (shipped — UI 슬라이스, 백엔드 swap 대기)
- **Content Queue (`/dashboard/content/queue`)**: idea / draft / review 파이프라인 + 오너·마감·다음 액션 로스터 + stage 필터. (shipped — UI 슬라이스)
- **Sales/Branding Dashboard**: `sales_branding_dash`의 지표 시각화 엔진 통합.

### [Phase 3] AI 오케스트레이션
- **n8n 연동**: Hub OS 웹훅을 통한 자동화 파이프라인(카드뉴스 배포, 이메일/알림 등) 완성.
- **Email automation (`/dashboard/automations/email`)**: 채널(Resend / n8n / Gmail) 라우팅 + 템플릿 카탈로그 + 큐/최근 발송 + 가드레일. **Email composer**: 세그먼트 빠른 전환 + 변수 칩 / 블록 라이브러리 / 라이브 미리보기. (shipped — UI 스켈레톤, provider 어댑터 대기)
- **Strategist AI**: 클매기(나)의 지표 분석 및 의사결정 제안 활성화.

## 4. 운영체제 구조 (OS Structure)
- **apps/hub**: 관리자용 통합 OS (대시보드, PMS, 카드뉴스 에디터).
- **apps/engine**: n8n 연동 및 AI 컨트롤 타워.
- **packages/**: 공통 UI, 게이트웨이, 콘텐츠 매니저 패키지.

## 5. 관리 및 개선 루프
1. **기록**: 모든 에러는 즉시 DB에 기록.
2. **분석**: 클매기(AI)가 에러 분석 및 ADR(기술 결정 기록) 작성.
3. **적용**: 코드 패치 자동화.

## 6. 현재 설계 우선순위
1. `Revenue` 개인/회사 분기
2. `Content` 브랜드 운영 레이어
3. `Overview` 오늘 우선순위 구조
4. 공통 `detail drawer`
5. `Automations` 실패 대응 플로우
6. `Evolution` 개선 루프
