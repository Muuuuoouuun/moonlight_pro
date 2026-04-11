# Engine / OS 분리 설명과 자동화 · 카드뉴스 UI 탭 구성 계획

## 1. 이 문서의 목적

이 문서는 Com_Moon에서 자주 섞여 보이는 3개 층을 명확히 분리한다.

- `Engine` = 실행 엔진
- `OS` = 운영 화면과 판단 레이어
- `Shared Domain` = 카드뉴스 같은 재사용 가능한 업무 로직

동시에 아래 3개 UI 주제를 하나의 사용자 흐름으로 정리한다.

- 자동화 UI
- 카드뉴스 제작 UI
- 카드뉴스 관리 + 편의성 레이어

핵심 목표는 "보는 곳"과 "실행하는 곳"을 섞지 않는 것이다.

## 2. 한 문장 정의

### Engine

Engine은 외부 입력을 받아 정규화하고, 실제 실행과 기록을 처리하는 기계 레이어다.

### OS

OS는 사람이 상태를 보고, 판단하고, 승인하고, 다음 액션을 고르는 운영 레이어다.

### Shared Domain

Shared Domain은 Engine과 OS가 함께 쓰는 업무 로직 묶음이다.

## 3. 현재 코드 기준 역할 분리

### 3.1 Engine이 맡아야 하는 것

현재 기준 파일:

- `apps/engine/app/api/webhook/project/route.ts`
- `apps/engine/app/api/webhook/telegram/route.ts`
- `apps/engine/lib/project-webhook.ts`

Engine 책임:

- 공개 webhook endpoint 노출
- 외부 payload 수신
- payload 정규화
- 실행 단위 생성
- `webhook_events`, `project_updates`, `routine_checks` 같은 원장 기록
- 실패 로그 적재
- 외부 시스템 연결 intake 처리

즉, Engine은 "입력 받고 실행하는 쪽"이다.

## 3.2 OS가 맡아야 하는 것

현재 기준 파일:

- `apps/hub/app/dashboard/content/page.jsx`
- `apps/hub/app/dashboard/content/studio/page.jsx`
- `apps/hub/app/dashboard/automations/page.jsx`
- `apps/hub/app/dashboard/automations/layout.jsx`

OS 책임:

- 지금 무엇이 중요한지 보여주기
- 어떤 작업이 멈췄는지 보여주기
- 카드뉴스 초안, 검토, 배포 상태를 운영 문맥으로 묶기
- 자동화 실행 결과를 사람이 이해할 수 있는 언어로 요약하기
- 수동 승인, 재실행, 점검, 우선순위 판단 제공

즉, OS는 "상태를 읽고 조정하는 쪽"이다.

## 3.3 Shared Domain이 맡아야 하는 것

현재 기준 파일:

- `packages/content-manager/card-news/generator.ts`

Shared Domain 책임:

- 카드뉴스 생성 규칙
- 템플릿 규칙
- 채널별 변환 규칙
- 슬라이드 구조화
- 공통 validation

즉, Shared Domain은 "업무 로직 자체"다.

## 4. 가장 중요한 원칙

### 원칙 1. Engine은 UI를 소유하지 않는다

Engine은 화면 정보구조, 탭, 필터, 운영 문구를 소유하면 안 된다.

### 원칙 2. OS는 외부 실행 세부사항을 소유하지 않는다

OS는 webhook contract, provider adapter, 재시도 로직, payload 정규화를 직접 떠안으면 안 된다.

### 원칙 3. 카드뉴스 로직은 OS 안에 갇히지 않는다

카드뉴스 생성 규칙은 나중에 Telegram, batch job, API, studio 어디서든 재사용되어야 하므로 `packages`에 둔다.

### 원칙 4. OS의 액션은 "직접 실행"보다 "의도 전달"이 중심이어야 한다

OS 버튼은 아래 의미를 가져야 한다.

- 실행 요청
- 승인
- 재시도 요청
- 점검 요청
- 초안 전달

실제 외부 실행과 intake 처리는 Engine이 담당하는 것이 맞다.

## 5. 권장 구조

```text
External tools / User input
  -> Engine intake
  -> Shared ledger (Supabase)
  -> OS dashboard / workspace
  -> Operator decision
  -> Engine execution
  -> Ledger update
  -> OS review
```

## 6. 지금 구조에서의 경계 정리

현재 `apps/hub/lib/server-write.js`는 일부 직접 기록과 Engine 호출을 함께 하고 있다.

이 파일의 역할은 아래처럼 제한하는 것이 좋다.

- 운영자가 직접 남기는 수동 기록
- smoke test
- Engine dispatch 요청

이 파일이 장기적으로 소유하면 안 되는 것:

- 외부 provider별 실행 로직
- 복잡한 webhook 표준화
- 자동화 orchestration 본체

즉, Hub는 "보내는 의도"까지만, Engine은 "받아 실행하고 기록하는 것"까지 맡는 구조가 더 깨끗하다.

## 7. 탑레벨 IA 결론

현재 탑레벨:

- `Overview`
- `Work OS`
- `Revenue`
- `Content`
- `Automations`
- `Evolution`

이 구성이 이미 6개이므로 `편의성`을 탑레벨에 추가하는 것은 권장하지 않는다.

이유:

- 문서 원칙상 탑레벨은 6개를 넘기지 않는 것이 맞다
- `편의성`은 독립 도메인보다 보조 도구 성격이 강하다
- 독립 탭으로 올리면 정보구조보다 "잡다한 것 모음"처럼 보일 위험이 크다

따라서 `편의성`은 탑레벨 탭이 아니라 `Command Center` 또는 `Quick Actions` 레이어로 두는 편이 맞다.

## 8. 권장 탭 구성

## 8.1 Content

유지 권장 탭:

- `Overview`
- `Queue`
- `Studio`
- `Assets`
- `Publish`

각 역할:

- `Overview`: 콘텐츠 생산량, 대기 상태, 브랜드별 주의점
- `Queue`: 아이디어, 초안, 검토, 승인 대기 관리
- `Studio`: 카드뉴스 작성과 미리보기
- `Assets`: 결과물, 템플릿, 재사용 소스
- `Publish`: 채널 배포 기록과 결과

핵심 판단:

- 카드뉴스 "제작"은 `Studio`
- 카드뉴스 "관리"는 `Queue` + `Publish`
- 자산 재사용은 `Assets`

즉, 제작과 관리는 같은 탭이 아니라 같은 흐름 안의 다른 단계여야 한다.

## 8.2 Automations

MVP 유지 권장 탭:

- `Overview`
- `Runs`
- `Webhooks`
- `Integrations`

각 역할:

- `Overview`: 현재 자동화 건강 상태 한눈에 보기
- `Runs`: 실행 성공/실패/대기 흐름 추적
- `Webhooks`: intake 테스트, 이벤트 확인, endpoint 점검
- `Integrations`: GitHub, Telegram, Notion 같은 외부 연결 상태 확인

후속 확장 시 추가 고려 탭:

- `Recipes` 또는 `Scenarios`

추가 조건:

- 실제 자동화 종류가 늘어서 "어떤 규칙이 있는지"를 별도 관리해야 할 때만 추가
- 지금 단계에서는 `Runs`, `Webhooks`, `Integrations`가 더 중요하다

## 8.3 편의성

권장 위치:

- 탑레벨 신규 탭이 아니라 `Command Center`
- 상단 quick action
- 또는 우측 utility rail

권장 내부 탭:

- `Quick Run`
- `Templates`
- `Snippets`
- `Recent`
- `Smoke Test`

각 역할:

- `Quick Run`: 자주 쓰는 명령 즉시 실행
- `Templates`: 카드뉴스/운영 메모/자동화 테스트 프리셋
- `Snippets`: webhook payload 예시, CTA 문구, 반복 복사 문구
- `Recent`: 최근 실행, 최근 복사, 최근 초안
- `Smoke Test`: webhook, integration, publish handoff를 빠르게 검증하는 점검 모듈

이 레이어는 "운영을 빠르게 만드는 도구함"이지, 별도 업무 도메인이 아니다.

## 9. 카드뉴스 제작 UI 계획

현재 `apps/hub/app/dashboard/content/studio/page.jsx`의 방향은 맞다.

강화 포인트는 아래와 같다.

### 화면 목적

- 한 번에 초안 작성
- 템플릿 선택
- 채널 선택
- 즉시 미리보기
- 다음 handoff를 분명히 보여주기

### 권장 3단 구조

#### 1. 상단 상태 바

- 브랜드
- 템플릿
- 채널
- 슬라이드 수
- handoff 상태

#### 2. 본문 2열

왼쪽:

- 초안 입력
- 템플릿 버튼
- 채널 선택

오른쪽:

- live preview
- 슬라이드 구조 요약
- 톤 체크

#### 3. 하단 handoff 바

- `Queue로 보내기`
- `Publish 검토로 보내기`
- `자동화 실행 요청`
- `초안 복사`

핵심은 "잘 쓰는 것"보다 "다음 단계로 넘기기 쉽게 쓰는 것"이다.

## 10. 카드뉴스 관리 UI 계획

카드뉴스 관리는 `Studio`가 아니라 `Queue` 중심으로 가는 것이 맞다.

### Queue가 답해야 할 질문

- 지금 어떤 초안이 멈춰 있는가
- 무엇이 리뷰 대기인가
- 어떤 콘텐츠가 자동화로 넘어갈 준비가 되었는가
- 어떤 카드뉴스가 재활용 가치가 있는가

### 권장 상태 체계

하나의 문자열 상태에 모든 의미를 몰아넣기보다, 아래처럼 2축으로 나누는 편이 맞다.

콘텐츠 라이프사이클:

- `idea`
- `draft`
- `review`
- `ready`

배포 라이프사이클:

- `queued`
- `published`
- `failed`

보조 플래그:

- `archived`
- `stale`
- `attention`

### Queue 기본 블록

- 상태별 lane 또는 압축 테이블
- 브랜드 필터
- 채널 필터
- 최근 수정일
- 다음 액션
- 담당자 또는 소유자

### Queue 빠른 액션

- 템플릿 변경
- Studio 열기
- Publish로 이동
- 자동화로 전달
- 보관 또는 재활용

## 11. 자동화 관리 UI 계획

자동화 화면은 "설정 나열"보다 "현재 기계가 어떻게 돌고 있는지"를 우선 보여줘야 한다.

### Automations Overview 핵심 블록

- live routes
- recent runs
- failed runs
- ready commands
- integration alerts

### Runs 핵심 블록

- 성공 / 대기 / 실패 KPI
- 최근 실행 타임라인
- 실패 원인 요약
- 재시도 버튼
- 연관 콘텐츠 또는 프로젝트 바로가기

### Webhooks 핵심 블록

- endpoint 목록
- 최근 event
- payload 요약
- 상태
- 테스트 전송 폼

### Integrations 핵심 블록

- 연결 상태
- 마지막 sync 시간
- 필요한 secret 또는 매핑 상태
- 어디 탭에 영향을 주는지 설명

## 12. Content와 Automations를 연결하는 방식

이 두 섹션은 분리되어야 하지만 끊기면 안 된다.

권장 연결 규칙:

- Content에서 `자동화 실행 요청` 가능
- Automations run detail에서 원본 콘텐츠로 복귀 가능
- Publish 실패 시 Logs 또는 Evolution으로 바로 이동 가능
- Queue item에서 최근 automation 상태를 한 줄로 보여주기

즉, 탭은 분리하지만 흐름은 이어야 한다.

## 13. 최종 IA 제안

```text
Overview
Work OS
Revenue
Content
  - Overview
  - Queue
  - Studio
  - Assets
  - Publish
Automations
  - Overview
  - Runs
  - Webhooks
  - Integrations
Evolution

Utility layer
  - Command Center
    - Quick Run
    - Templates
    - Snippets
    - Recent
```

## 14. 바로 실행할 우선순위

### P0

- Engine = 실행 / intake 레이어, OS = 운영 / 판단 레이어라는 문구를 주요 문서에 통일
- `편의성`을 탑레벨 탭으로 추가하지 않기로 결정
- `Command Center`를 편의성 레이어의 공식 이름으로 정리
- `Content`와 `Automations`의 서브탭은 현재 5탭 / 4탭 구조를 유지하기로 확정

### P1

- `Content > Studio`에 handoff 바 강화
- `Content > Queue`에 카드뉴스 2축 상태 모델 반영
- `Automations > Runs`에서 콘텐츠 원본 연결 추가
- `Command Center`에 `Smoke Test` 모듈 추가

### P2

- `Shared Domain`으로 카드뉴스 템플릿 규칙 확장
- automation scenario 또는 recipe 관리 화면 필요성 검토

## 15. 최종 결론

정리하면 이렇게 보는 것이 가장 명확하다.

- `Engine`은 실행기다
- `OS`는 운영석이다
- `Content`는 만드는 곳이다
- `Automations`는 기계 상태를 보는 곳이다
- `편의성`은 탑레벨 업무 도메인이 아니라 빠른 실행 도구함이다

이 구조로 가면 Com_Moon은 "자동화가 붙은 대시보드"가 아니라, 사람 판단과 기계 실행이 분리된 진짜 운영 시스템으로 보이게 된다.
