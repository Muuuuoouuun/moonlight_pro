# 브랜드 API·MCP 보안 보강 — 2026-10-27

운영자 요청: PR #54의 의존성 보안검사 실패를 해결하고, 브랜드 API 관리와 MCP의 보안을 보강한 뒤 검증된 변경을 병합한다.

## 의존성

전체 `npm audit`의 10건(high 6, moderate 4)을 0건으로 줄였다. CI의 `npm audit --omit=dev --audit-level=high` 기준은 유지한다.

| 의존성 | 반영 버전·조건 |
| --- | --- |
| MCP SDK | Hub·MCP 모두 1.32.2로 고정 |
| Zod | MCP 4.6.7, `@vercel/cli-config` 내부 고정 버전도 4.6.7로 override |
| body-parser | 2.4.0 |
| Electron | 같은 44 메이저의 44.9.3 |
| undici | 6.29.1 / 7.30.1 |
| fast-uri | 3.1.9 |
| xcode → uuid | 11.1.1 override; 실제 xcode `generateUuid()`의 CJS 호출·24자리 ID 생성 확인 |

Zod 메이저 변경은 MCP 도구 스키마 등록, 실제 SDK client/server 호출, 읽기·쓰기 프로토콜 회귀시험으로 확인한다. `npm audit fix --force`, 검사 기준 완화, 취약점 무시는 사용하지 않았다. 근거: [Zod 보안 권고](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5), [body-parser 보안 권고](https://github.com/advisories/GHSA-27r3-jxmh-p828), [uuid 보안 권고](https://github.com/advisories/GHSA-w5hq-g745-h8pq).

## MCP 경계

- Hub 자격 증명은 설정된 HTTPS origin에만 전달한다. HTTP는 정확한 loopback만 허용하며 userinfo·경로·query·fragment가 붙은 base URL, 다른 origin이나 API 밖으로 벗어나는 경로는 요청 전에 거절한다. 리디렉션을 따라가지 않는다.
- 응답 스트림을 Agent 128 KiB, legacy Hub 512 KiB로 제한하고 초과 시 취소한다. 비 JSON·배열·스칼라 응답을 성공으로 처리하지 않는다.
- MCP의 text·structuredContent 양쪽에서 OAuth 자격 필드와 서버 토큰 원문을 제거한다. 만료·존재 여부와 복구에 필요한 서명된 recoveryToken은 유지한다.
- HTTP registry의 버전, 크기, 타입, 프로필, 중복 이름·digest와 URL-token 읽기 전용 조건을 확인한다. 잘못된 registry는 모든 요청을 닫고, 잘못된 Authorization 헤더는 URL token으로 우회하지 않는다.
- HTTP 요청 크기·클라이언트별 빈도·연결 수·소켓 요청 수·시간을 제한한다. 감사 로그에는 제한된 호출 식별자만 남기고 인자, 원문 예외, 토큰은 넣지 않는다.
- `mcp:doctor`의 Node `--env-file` 전체 로딩을 제거했다. 파일과 하위 프로세스에는 MCP에 필요한 키와 런타임 경로만 전달한다.

기존 Host/Origin 검사와 클라이언트별 프로필, 서버의 Agent 인증·workspace·scope 검사는 유지한다. HTTP 클라이언트별 token은 MCP 입구 권한이며 Hub의 actor는 MCP 프로세스의 Agent token을 따른다. 서로 다른 Hub actor가 필요하면 별도의 프로세스·Agent token을 사용한다. [MCP 보안 지침](https://modelcontextprotocol.io/docs/2025-11-25/tutorials/security/security_best_practices)

## API 관리

`GET /api/agent/v1/integrations`와 `get_api_connections`를 추가했다. `integrations` 프로필은 `get_hub_health`, `get_api_connections` 두 읽기 도구만 노출하고 core 10개 계약은 유지한다.

DB 쿼리는 인증된 workspace와 허용한 provider로 한정한다. 전체 config나 access/refresh token을 읽지 않고 명시한 JSON 필드·만료 메타데이터만 선택한다. 브랜드·provider 필터, 최대 100개 페이지와 offset 상한이 있으며 읽기 실패는 오류로 반환한다. 앱의 값은 반환하지 않고 설정 존재 여부와 계정·앱 일치 여부를 보여 준다.

결과는 `verification: stored-metadata`, `tokenValuesRead: false`, `providerRequestsMade: false`, `refreshScheduled: false`를 명시한다. `stored-active`는 저장된 만료 시각의 판정이며 제공자 API 호출 성공의 증명이 아니다. 자동 갱신·게시·업무 생성은 추가하지 않았다.

## 검증

- 로컬 보안·SDK 프로토콜·HTTP·Agent API·env 시험: 65/65 통과, skip 0.
- Windows 로컬 데스크톱 계약 시험: 통과 443, 실패 0, 실행 조건에 따른 skip 28. 설치 파일·실행 전환 검증은 별도 Windows CI에서 수행한다.
- typecheck, contract check, 소스 문법 검사 통과. 전체 audit와 production audit 모두 취약점 0.
- 서울 운영 DB 메타데이터 읽기: 기존 16개 연결을 조회했고 반환값에 자격 원문이 없음을 확인했다. 이 로컬 검사는 로컬 파일의 앱 설정을 사용하므로 Vercel의 실제 설정 준비 여부로 해석하지 않는다.
- 전체 MCP 시험의 기존 POSIX 권한·symlink 시험은 Windows에서 실행 조건 차이가 있다. 전체 Linux CI와 Windows 데스크톱 설치 검증의 결과는 PR #54의 정확한 head 체크를 병합 조건으로 삼는다. 검사 실패를 통과로 바꾸지 않는다.

배포와 병합 결과·실제 운영 HTTP 확인은 PR #54와 작업 영수증에 기록한다. 이 기록은 변경한 경계와 의존성 검증 범위를 다룬다.
