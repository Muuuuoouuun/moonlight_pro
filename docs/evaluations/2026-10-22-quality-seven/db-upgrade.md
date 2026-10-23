# 서울 운영 DB 업그레이드 실행·복구 검증 결과 — 2026-10-23 00:02:25 KST 검사 완료

사용자가 승인한 서울 프로젝트 `ncgpnqfulnlshegalmbd` (`ap-northeast-2`)의 same-major 업그레이드가 완료됐다. Management API build는 `17.6.1.166`에서 `17.11.0.003`, SQL `server_version`은 `17.6`에서 `17.11`로 확인됐다. 데이터·권한·준비 상태 검사를 통과했고, 운영 핵심 read API가 회복된 뒤 최종 3회 반복도 모두 통과했다. 플랫폼 완료 직후에는 실제 504와 앱의 partial/error가 발생했으므로 플랫폼 완료 시각과 앱 정상 확인 시각을 구분한다.

실행 경계: 승인된 DB 업그레이드 POST 1회만 전송했다. 업무 레코드 쓰기, worker·모델 호출, 운영 ANALYZE·DDL, 앱 배포, timeout 변경, 복원·롤백은 실행하지 않았다. 검증은 읽기 전용이며 응답 내용과 비밀키를 로그에 남기지 않았다. 로그는 상태·시간·바이트 수·카탈로그 집계만 포함한다.

| 사건 | KST | UTC |
| --- | --- | --- |
| 로컬 백업 생성 | 10/22 23:35:23.945–23:35:32.111 | 10/22 14:35:23.945–14:35:32.111 |
| 백업 복원·정규화 비교 검증 완료 | 10/22 23:37:43.215 | 10/22 14:37:43.215 |
| 정확한 대상·현재 버전·eligibility·미진행 상태 재확인 후 POST 수락(HTTP 201) | 10/22 23:43:48.110 | 10/22 14:43:48.110 |
| 공급자 upgrade initiated_at | 10/22 23:43:56.797730 | 10/22 14:43:56.797730 |
| 공급자 terminal 상태 `10_completed_post_physical_backup`, status 1 | 10/22 23:50:11.325801 | 10/22 14:50:11.325801 |
| project ACTIVE_HEALTHY / 17.11.0.003 관측 | 10/22 23:50:17.750 | 10/22 14:50:17.750 |
| SQL·데이터·권한·준비 상태 검증 완료 | 10/22 23:51:23.216 | 10/22 14:51:23.216 |
| 앱 최초 사후 검사 완료: 일부 partial/error와 health 503 | 10/22 23:52:00.323 | 10/22 14:52:00.323 |
| Supabase db/rest/auth/pooler/realtime/storage 모두 healthy 관측 | 10/22 23:53:23.019 | 10/22 14:53:23.019 |
| 두 번째 앱 검사 완료: health 정상, daily-brief partial 잔존 | 10/22 23:53:56.300 | 10/22 14:53:56.300 |
| 핵심 5 read와 Hub·Engine health 모두 정상인 최초 일괄검사 완료 | 10/22 23:56:31.856 | 10/22 14:56:31.856 |
| 운영 최종 3회 반복 검사 | 10/23 00:01:18.802–00:02:25.316 | 10/22 15:01:18.802–15:02:25.316 |

POST 수락부터 공급자 terminal 상태까지 약 6분 23초다. 실제 서비스 중단 길이는 연속 가용성 검사를 수행하지 않아 확정할 수 없다. 최초 일괄검사 완료 시각은 해당 검사를 마친 시각이지, 그 이전 어느 순간에 앱 전체가 정상화됐는지를 의미하지 않는다. 업그레이드 전 운영 health 기준값도 없으므로 당시 운영 오류 전부를 이번 변경이 새로 만든 회귀라고 단정하지 않는다. 업그레이드 전 통합 local read 50/50 live와 사후 local partial/error는 별도 관측 근거다.

요청은 [공식 Management API](https://supabase.com/docs/reference/api/v1-upgrade-postgres-version)와 [공식 OpenAPI](https://raw.githubusercontent.com/supabase/supabase/master/apps/docs/spec/api_v1_openapi.json)의 `UpgradeDatabaseBody`를 확인해 `{"target_version":"17","release_channel":"ga"}`로 보냈다. API에는 image pin 필드가 없어 직전 eligibility의 유일한 GA 17 target이 `supabase-postgres-17.11.0.003`인지 검증했고 실제 결과도 일치한다. 추적 ID는 `a1fa85fd-f386-40c8-ac89-719422a0bdf3`다. 파일 잠금 표식을 POST 전에 저장했고 재전송 없이 GET으로만 상태를 추적했다. eligibility의 당시 예상 소요 시간은 1시간이었다.

데이터 검증은 백업의 같은 read-only snapshot에서 만든 manifest와 비교했다. `public` 및 `moonlight_ops`의 114개 테이블, 7,694행에 대해 행 수와 전체 행 digest가 모두 같았다. 100개 함수의 anon/authenticated/service_role EXECUTE 권한, SECURITY DEFINER, 함수 설정도 동일했다. 준비 상태 47개 feature와 migration-history 항목(하위 조건 5개)을 모두 통과해 총 48개 논리 항목이 준비됐다. invalid index 0, 애플리케이션 일반 테이블 RLS 누락 0이다. 설치 확장과 버전도 전후 동일했다. 검증 중 실제 행 변화가 있었다면 외부의 정상 쓰기 가능성을 검토해야 하지만 이번 비교에서는 변화가 없었다.

초기 오류를 구간별로 분리해 확인했다. 첫 운영 health는 503/약 5.4–5.7초, daily-brief는 HTTP 200/partial/10.6초, revenue는 HTTP 200/error/5.3초, followups는 HTTP 200/partial/5.2초였다. 단순 직접 REST `select=id&limit=1`도 projects는 10/10 HTTP 200(26–89ms), leads는 7/10 HTTP 200 및 3/10 실제 HTTP 504(약 5.0초)였다. 따라서 복합 앱 query나 앱 자체 5초 제한만으로는 초기 현상을 설명할 수 없다.

Supabase edge 로그를 분·HTTP 상태·gateway version으로 집계한 결과 23:51–23:54 KST의 HTTP 504 27건은 모두 gateway version 2였다. 23:55–00:02:30 KST 집계에는 1,244건이 있고 HTTP 4xx/5xx가 없다. 이 집계는 본 검사 외 트래픽을 포함하며 로그 수집 지연 가능성이 있다. gateway 경로와의 연관은 확인되지만 DB warming, gateway 연결 상태 등 정확한 원인은 확정하지 않았다. 일시적으로 Connection: close로도 10/10 정상 응답했으나 시간 경과가 함께 바뀌었으므로 이를 원인이나 해결책으로 결론내리지 않았다. 마지막에는 기본 연결 재사용으로 직접 REST 10/10 HTTP 200(p50 26.1ms, p95 123.9ms)을 확인했다.

최종 운영 앱 검사는 30초 간격 3라운드, 핵심 read 15/15 HTTP 200 + status live, Hub·Engine health 6/6 HTTP 200 + status ok였다. 비인증 private read는 HTTP 401을 유지했다. Supabase 공식 6개 service health도 모두 healthy이고 project는 ACTIVE_HEALTHY / 17.11.0.003이다. 아래 시간은 응답 body 수신까지의 지연이며 n=3의 p95는 최댓값이므로 장기 성능 보장이 아니다.

| 운영 read | 성공 | p50 ms | p95 ms |
| --- | --- | --- | --- |
| daily-brief | 3/3 live | 886.0 | 1364.9 |
| revenue | 3/3 live | 199.3 | 219.3 |
| projects | 3/3 live | 226.7 | 228.8 |
| tasks | 3/3 live | 174.0 | 189.1 |
| followups | 3/3 live | 199.7 | 215.6 |

보존한 로컬 백업은 `/Users/bigmac_moon/.codex/backups/moonlight/2026-10-22-quality/attempt-2/moonlight-seoul-app.dump` (3,502,115 bytes)이며 SHA-256은 `3501f255fbd42dc1d50647daa5930c8d6680cb70bb7ba0af4de170ca912dd9fe`다. 디렉터리 0700, 파일 0600으로 보호하고 Git에 넣지 않았다. 임시 로컬 PostgreSQL 17.10에 복원해 동일성·권한·readiness를 검증했고 임시 서버를 정상 종료한 뒤 클러스터를 지웠다. 최초 비교는 UTC/Asia-Seoul 및 float 출력 설정 차이로 digest 차이가 났으나 동일한 원본 archive를 source 세션 설정으로 다시 검증해 모두 일치했다. 최종 근거는 같은 폴더의 `verification-report-normalized.json`이다.

복구 한계는 남는다. 로컬 백업은 애플리케이션 public/moonlight_ops만 포함하며 Supabase 관리 auth/storage/vault schema, 역할 비밀번호, Storage 파일과 플랫폼 설정을 포함하지 않는다. 전체 Supabase 복구본이나 정확한 17.11 플랫폼 복원 리허설이 아니다. 관리 API는 업그레이드 전과 사후(23:51:57 KST) 모두 `backups=[]`, `physical_backup_data={}`, PITR false를 반환했다. 공급자의 terminal 단계명에 post_physical_backup이 있어도 사용 가능한 managed recovery point는 확인하지 못했다. 이 제약을 업그레이드 성공으로 해소됐다고 보아서는 안 된다.

핵심 근거 파일은 모두 `/tmp/moonlight-quality-20261022/`에 있다.

- `db-upgrade-final-precheck.json`, `db-upgrade-receipt.json`, `db-upgrade-execution.jsonl`, `db-upgrade-latest-status.json`: 승인 대상·단일 요청·플랫폼 타임라인.
- `db-upgrade-postvalidation.json`: 17.11 SQL·readiness·테이블·함수 권한 비교.
- `db-upgrade-api-validation.json`, `db-upgrade-api-validation-recheck.json`, `db-upgrade-api-validation-third.json`: 초기 오류와 최초 전체 정상 관측을 모두 보존.
- `db-upgrade-direct-rest-validation.json`, `db-upgrade-rest-fresh-connections.json`, `db-upgrade-edge-log-aggregate.json`: 직접 REST 및 gateway 구간 근거.
- `db-upgrade-api-validation-final.json`, `db-upgrade-final-rest-health.json`: 마지막 운영 반복·기본 연결 REST·공식 health 결과.
- `db-upgrade-postbackup-metadata.json`: managed backup 조회 한계.

이번 결과는 승인된 버전 업그레이드와 관측 범위의 복구 검증 완료를 뒷받침한다. 장시간 가용성이나 모든 과거 암호문/외부 클라이언트 호환성은 검증하지 않았다. 다시 504가 발생하면 위 시간대·gateway별 집계와 안전한 request ID를 근거로 공급자 상태를 확인하는 것이 다음 읽기 전용 조사 경로다. 기존 timeout을 늘리거나 데이터를 덮어쓰는 조치는 수행하지 않았다.
