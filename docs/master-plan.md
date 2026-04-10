# Com_Moon Hub OS: Master Plan & Architecture

## 1. 개요 (Overview)
Com_Moon은 3개 프로젝트(classinkr-web, sales_branding_dash, ai-command-pot)를 통합 관리하는 Hub OS입니다.

## 2. 서비스 레이어
- **Hub (Private)**: 나(보스)만 보는 운영 허브 (PMS, 보고, 루틴 체크, 자가 발전).
- **Landing (Public)**: 고객용 랜딩 페이지 (블로그, 콘텐츠 배포, 서비스 홍보).

## 3. 핵심 아키텍처
- **Monorepo (Turborepo)**: 코드 공유 및 의존성 관리.
- **n8n Automation**: 모든 수동/정기 작업을 AI가 트리거하여 처리.
- **Self-Improving Loop**: 오류 발생 시 시스템이 자체 기록하고 개선안을 제안(Self-Evolution).

## 4. 로직 및 지침
- **에러 기록 방식**: `error_logs` 테이블에 context/payload/trace 정보 즉시 적재.
- **디자인 철학**: 모바일 쾌적성(PWA) + 클래스인 그린(#084734) 중심의 미니멀리즘.
- **역할 분담**: 클매기(나)는 전략 분석가(Strategist)로서 일일 보고 및 액션 제안.

## 5. 단계별 마일스톤
- **Phase 1**: 허브(개인 OS) 기반 구축 및 로그인(Supabase) 통합.
- **Phase 2**: 3개 프로젝트 핵심 모듈 이식.
- **Phase 3**: n8n 자동화 및 자가 발전 루틴 도입.
