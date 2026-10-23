# Hub·Engine 공통 백엔드 품질 점검

> 후속 통합·운영 상태(2026-10-23): 이 문서는 초기 코드 감사 범위의 기록이다. 전체 테스트, 실제 API·DB 권한 검사와 승인된 PostgreSQL17.11 업그레이드의 최종 결과는 [전체 품질 기록](2026-10-22-quality-seven/README.md)·[DB 실행 기록](2026-10-22-quality-seven/db-upgrade.md)을 따른다.

기준: `c89ecbf257d5d385335ca55f1c53796abb981dd5`. 범위는 공용 PostgREST 클라이언트, Hub 인증 예외와 쓰기 본문 경계다. 운영 DB·배포·유료 모델 호출은 실행하지 않았다.

판정 기준은 루트 CLAUDE.md, 문서 지도, 2026-09-23 운영자 로그인 설계와 2026-10-07 자동 로그인 후속이다. HTTP 200 + `status: error` 읽기 봉투, 운영 환경의 exact same-origin + 서명 세션, 서버 전용 쓰기 자격, 30일 선택형 세션을 유지한다.

## 재현과 수정

| 결함 | 기준 코드의 재현 결과 | 수정 및 검증 |
| --- | --- | --- |
| 잘못된 2xx 읽기를 빈 목록으로 표시 | 공용 클라이언트에 HTTP 200 + JSON object를 주면 `rows: [], error: null`. 일부 호출만 `strictRows`를 켜고 있었다. | 모든 테이블 읽기가 JSON object 배열을 검증한다. 빈 문자열·잘못된 JSON·object·null·primitive 배열은 `invalid-rows`이며 실제 `[]`와 구별한다. 기존 `strictRows` 인자는 소스 호환성을 위해 남긴다. |
| 잘못된 저장 응답을 성공 처리 | insert representation에 같은 잘못된 본문을 주면 `persisted: true, record: null`. | insert/upsert/update/delete의 요청한 representation이 잘못됐으면 `persisted: false, reason: invalid-rows`. 실제 저장 여부가 불명확하므로 자동 재시도는 추가하지 않았다. 응답 본문 없는 `return=minimal` 쓰기는 기존 계약을 유지한다. |
| 공개 경로의 접두사가 인접 경로까지 허용 | 세션 없이 `/api/operator/session-private`, `/api/health-private`를 접근 판정하면 allow. 현재 실재하는 데이터 라우트 유출까지 확인한 것은 아니다. | 로그인·세션·헬스를 exact allowlist로 옮겨 인접 이름과 등록되지 않은 자식을 차단한다. 자체 인증을 가진 cron/webhook/agent 하위 경로는 유지한다. |
| Hub JSON 제한이 전체 할당 후 적용 | Content-Length 없는 8바이트 청크 3개, 제한 8바이트에서 끝까지 읽은 뒤 413. 읽기 중단은 공통 함수 밖으로 예외가 전파됐다. | 두 번째 청크에서 초과를 감지해 스트림을 취소하고 나머지를 읽지 않는다. 읽기 실패와 손상된 UTF-8은 제한된 400 JSON 응답으로 반환한다. 한글의 바이트 경계 분할도 보존한다. |

PostgREST의 기본 테이블 JSON 응답은 배열이며 `return=representation`은 변경된 리소스 표현을 반환한다. 이번 검증은 그 계약에 맞춘 것이고 새로운 Supabase API 기능에 의존하지 않는다. [Resource Representation](https://docs.postgrest.org/en/stable/references/api/resource_representation.html), [Return Representation](https://docs.postgrest.org/en/stable/references/api/preferences.html#return-representation).

## 검증 기록

- 수정 전 해당 3파일 테스트: 56개 통과.
- 새 재현을 추가한 뒤 실제 실패 5개 확인: 기본 read 오류 소거, write 거짓 성공, 공개 경로 경계, 초과 본문 끝까지 읽기, 중단 본문 예외.
- 수정 후 해당 3파일: 61개 통과.
- 전체 `npm test` 1차: 5,517개 중 5,498 통과, 5 실패, 조건부 skip 14. 실패 4개는 부모 작업에서 확인·정리한 macOS SysV 공유메모리 부족(`shmget: No space left on device`)이 정리 전에 발생한 결과다. 나머지 1개는 `req.text` 메서드만 덮어쓰던 multimodal 시험이 실제 스트림 실패를 표현하지 못한 것이었다. 그 시험을 실제 errored ReadableStream으로 바꿨다.
- 환경 정리와 시험 보정 후, 실패한 PostgreSQL 4파일·multimodal 파일·핵심 3파일을 합쳐 93개 통과, 실패 0, skip 0. agent command 원자 트랜잭션, 성과 복원, inquiry 원자성, focus cap 동시 수정까지 재검증했다.
- `npm run typecheck`: 4개 workspace 작업 성공. `git diff --check` 통과.
- 전체 단일 실행의 최종 green은 통합 담당자의 병합 후 실행으로 확인해야 한다. 위 결과를 단일 전체 통과 실행으로 합산해 표기하지 않는다.

## 평가에 반영할 근거와 한계

- 안정성: 공용 응답 검증의 실재 결함을 제거했고 기존 시간 제한, 읽기 중복 병합, 쓰기 완료 뒤 재조회 무효화, duplicate·timeout 분류 시험을 보존했다. 로컬 범위는 강해졌지만 배포 뒤 실사용 복구까지 인증한 것은 아니다.
- 보안·환경: exact 공개 경로와 스트림 상한을 보강했다. 로그인 설정 누락 차단·운영 loopback 차단·인증된 same-origin 쓰기·서버 자격 분리 시험은 유지된다. 운영 Firewall 속도 제한, 실제 배포 인증 우회, 현재 DB 권한·버전은 이 작업에서 확인하지 않았다.
- 속도: 과대 요청의 불필요한 전체 읽기는 제거했다. 정상 운영 API p50/p95, 페이지 왕복, DB 쿼리 플랜은 이번 실행에서 측정하지 않았으므로 속도 90점의 근거가 될 수 없다.
- 최신성: 2026-10-22 Supabase changelog와 공식 PostgREST 계약을 확인했다. 10-12 CBC TLS 폐기 공지는 구형 클라이언트 영향이고, 09-25 PostgreSQL 보안 minor 공지는 실제 운영 버전·확장 사용을 확인해야 적용 여부를 판단할 수 있다. 이 확인을 운영 업그레이드 완료로 표기하지 않는다. [TLS 공지](https://supabase.com/changelog/cbc-tls-ciphers-deprecated), [PostgreSQL 공지](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes).

이 제한된 감사만으로 7분야 가중 평균 90·최소 87 달성을 선언하지 않는다. 디자인·업무 실용성·본질 집중은 이번 담당 범위 밖이고, 속도와 운영 보안에는 측정하지 않은 부분이 남는다.
