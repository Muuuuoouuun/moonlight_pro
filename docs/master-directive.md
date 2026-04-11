# Com_Moon Hub OS: Master Plan & Architecture

## 1. 개요 (Overview)
Com_Moon은 3개 프로젝트(classinkr-web, sales_branding_dash, ai-command-pot)를 통합 관리하는 Hub OS입니다.

## 2. 서비스 레이어
- **Hub (Private OS)**: 나(보스)만 보는 운영 허브. 상태 확인, 판단, 승인, 우선순위 조정이 일어나는 레이어.
- **Engine (Execution)**: webhook intake, 명령 처리, payload 정규화, 실행 기록을 담당하는 실행 레이어.
- **Landing (Public)**: 고객용 랜딩 페이지 (블로그, 콘텐츠 배포, 서비스 홍보).
- **Shared Domain**: 카드뉴스 같은 재사용 가능한 업무 로직을 묶는 공통 패키지 레이어.

## 3. 핵심 아키텍처
- **Monorepo (Turborepo)**: 코드 공유 및 의존성 관리.
- **Hub OS + Engine 분리**: Hub는 운영 판단, Engine은 실행과 intake를 담당.
- **Supabase Ledger**: `automation_runs`, `webhook_events`, `project_updates`, `error_logs` 같은 운영 원장 저장.
- **Automations**: 수동/정기 작업 실행 상태를 Hub에서 보고 Engine으로 전달.
- **Self-Improving Loop**: 오류 발생 시 시스템이 자체 기록하고 개선안을 제안(Self-Evolution).

## 4. 로직 및 지침
- **에러 기록 방식**: `error_logs` 테이블에 context/payload/trace 정보 즉시 적재.
- **역할 분리 원칙**: Engine은 UI를 소유하지 않고, Hub는 provider별 실행 세부사항을 소유하지 않는다.
- **편의성 레이어**: `편의성`은 별도 탑레벨 탭이 아니라 `Command Center` 유틸리티 레이어로 둔다.
- **디자인 철학**: 모바일 쾌적성(PWA) + 클래스인 그린(#084734) 중심의 미니멀리즘.
- **역할 분담**: 클매기(나)는 전략 분석가(Strategist)로서 일일 보고 및 액션 제안.

## 5. 단계별 마일스톤
- **Phase 1**: 허브(개인 OS) 기반 구축 및 로그인(Supabase) 통합.
- **Phase 2**: Work OS / Revenue / Content / Automations / Evolution 운영 화면 정리.
- **Phase 3**: Engine 실행 레이어 정리, shared domain 확장, 자동화 및 자가 발전 루틴 도입.
