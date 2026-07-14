# 문준혁 소유 eeoCRM 리드 보강·스코어링 실행 기준

상태: ACTIVE — 16건 적용·재실행 검증 완료
범위: `문준혁 / Junhyuk Mun / EEO04186` 소유가 공식 스냅샷에서 확인되고, Moonlight 회사명과 정확 일치하는 레코드만

## 확정

- ClassIn/eeoCRM은 회사 공식 계정·기회·수금·활동 요약의 정본이다.
- Moonlight는 개인 업무 정본이다. ClassIn의 상세 원장을 복제하지 않고, 공식 ID·집계·근거 링크·다음 액션만 보관한다.
- 소유자 브리지: `ownerId=3935704427463307`, `EEO04186`, `문준혁`.
- 전체 CRM 81,294건이나 Moonlight eeoCRM 117건을 일괄 보강하지 않는다.
- 자동 보강 게이트는 `공식 owner 일치 + 회사명 exact_name`이다. 현재 22개 소유 계정 중 Moonlight 13개 회사, 16개 리드가 통과했다.
- 16개 리드의 공식 `won` 상태는 변경하지 않는다. 점수·태그·다음 액션만 고객 유지/갱신 관점으로 갱신한다.
- 공개 웹 검색은 지역·과목·기관 유형·공식 채널 같은 사업 정보만 사용한다. 개인 전화·이메일·사생활 정보는 수집하지 않는다.

## 데이터 흐름

1. ClassIn Supabase `external_crm_records`에서 문준혁 소유 `account/contact/opportunity/Collection__c/SalesPerformance__c`를 읽는다.
2. Moonlight `companies`와 정규화 회사명이 정확히 같은 계정만 선택한다.
3. Moonlight `leads.source='eeocrm'` 중 선택된 회사의 리드만 대상으로 한다.
4. Google Calendar는 최근 7개월을 월 단위로 읽고, 정확 회사명이 제목·장소에 포함된 접점만 집계한다.
5. 공개 웹 근거는 별도 JSON 입력으로 받아 `confidence=high`인 태그만 자동 적용한다.
6. `leads.status`는 보존하고 `score`, `next_action`, `meta.enrichment`만 patch한다.
7. 적용 후 `sync_runs`에 correlation ID와 대상/변경 건수만 기록한다.

2026-07-15 재감사에서 ClassIn `crm_customer_events`, `crm_tasks`, `crm_capture_rows`는 각각 전체 0건이었다. 따라서 캘린더·구매 근거가 없는 10건은 누락을 0점으로 바꾸지 않고 `engagement:unknown`을 유지한다. 공개 설명회 2건은 `activity:info-session-public`으로 구분하며 직접 영업 접점으로 점수화하지 않는다.

## 점수 해석

- 점수는 신규 구매 가능성 하나가 아니라 현재 리드 상태에 맞는 운영 우선순위다.
- `won`은 `customer_success` 레인으로 분류한다.
- 공식 소유권, 라이프사이클, 구매/수금, 캘린더 접점, 연락처 커버리지, 공개 근거를 분리 점수로 기록한다.
- 활동 소스 자체가 비어 있으면 의도 0으로 간주하지 않고 `engagement:unknown`, component `null`로 둔다.
- 공식 stage ID 의미를 모르는 상태에서 추측 매핑하거나 eeoCRM stage를 덮어쓰지 않는다.

## 실행

```bash
node \
  --env-file=apps/hub/.env.local \
  --env-file=/Users/bigmac_moon/Desktop/Projects/classinkr-web/.env.local \
  scripts/enrich-eeocrm-leads.mjs
```

공개 근거가 준비되면 dry-run:

```bash
node \
  --env-file=apps/hub/.env.local \
  --env-file=/Users/bigmac_moon/Desktop/Projects/classinkr-web/.env.local \
  scripts/enrich-eeocrm-leads.mjs \
  --evidence deliverables/junhyuk-eeocrm-public-evidence.json
```

검토 후 실제 적용은 마지막에 `--apply`를 추가한다. `--apply`는 `--evidence` 없이 실행할 수 없으며, 공개 근거가 없는 비교는 dry-run으로만 허용한다.

2026-07-15 03:12 KST 증거 포함 재검증 결과는 공식 owner 계정 22건, eeoCRM snapshot 117건, exact 회사 13곳, 대상 16건, 변경 0건, unchanged 16건, 캘린더 248건 scan이었다. 대상 16건의 태그와 `customer_success` lane은 모두 유지됐고 점수 분포도 기존 값과 같았다.

## 주의·계승 지침

- exact match가 아닌 별칭·유사명은 자동 적용 금지. 별도 confirmed alias가 생긴 뒤 재실행한다.
- Moonlight의 메모·다음 액션을 ClassIn 상세 활동으로 역복제하지 않는다.
- eeoCRM 117건의 external ID는 현재 ClassIn 스냅샷 81,294건의 external ID와 0건 일치한다. 이름 exact + owner proof가 현재 유일한 안전 브리지다.
- ClassIn 정기 sync는 2026-06-24 이후 `Missing Xiaoshouyi base URL`로 skipped 상태다. 최신성 표시는 스냅샷 시각과 분리한다.
- 공개 근거가 모호하거나 동명이면 `low`로 남기고 자동 태그에 쓰지 않는다.
- 재실행은 의미 내용이 같으면 unchanged로 판단하며, 변경분만 patch한다.
- 공개 근거 입력 없이 `--apply`하지 않는다. 스크립트의 apply guard를 제거하거나 우회하지 않는다.
- Hub 리드 상세의 `분류 · 증거` 패널은 과목·지역·직접 접점·접점 소스·공개 신호·프로그램·채널을 분리해서 표시한다. 공개 활동을 실제 콜·미팅처럼 합치지 않는다.
- 집계 증거는 `deliverables/junhyuk-eeocrm-activity-audit.json`, 계정별 공개 근거는 `deliverables/junhyuk-eeocrm-public-evidence.json`을 따른다.

## 미정/외부 블로커

- Xiaoshouyi `saleStageId` 숫자→라벨 사전은 현재 스냅샷에 없다.
- Mac에서 호출 가능한 eeoCRM MCP/서비스 credential이 없다. 쓰기 연결은 read-only 인증이 먼저 복구된 뒤 별도 승인한다.
- 콜·미팅·설명회 활동 원장은 ClassIn `crm_customer_events`가 현재 0건이다. 캘린더 exact match는 보조 근거일 뿐 완전한 활동 원장이 아니다. 향후 row가 생기면 owner/account target을 확인한 뒤 enrichment source에 추가한다.
