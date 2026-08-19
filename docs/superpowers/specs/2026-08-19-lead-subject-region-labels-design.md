# 리드 과목·지역 라벨 — 설계 (2026-08-19, 승인)

> 결정 주체: 운영자 (2026-08-19 대화에서 승인 — 이름 추론 우선 + 서치 보충 / 고정 목록 + 복수 선택 / 헤더 아래 필터 줄).
> 대상: `apps/hub` Leads 표면 117행 (라이브 Supabase `leads`).

## 0. 배경 실측 (2026-08-19 라이브 fetch)

- 지역: 51/117 보유, 전부 `시도-시군구` 규약(`경기-안양`, `서울-강남`). 66건 결측.
- 과목: 53/117 보유하나 `meta.enrichment.tags`의 `subject:*`에만 존재 — **운영자 편집 경로가 없다.**
  값 24종이 규칙 없이 드리프트(`math-essay` vs `essay`, `christian_education` 언더스코어 등),
  그중 15종은 `TAG_LABELS`에 한국어 라벨이 없어 raw slug로 렌더된다.
- 64건은 과목·지역 모두 결측. 이름에 과목이 박힌 경우가 다수(온리원**수학**, 더채움**영어**),
  지역은 이름으로 거의 안 풀린다. `ㅁㅁ`·`재수생`·`개인`·`0082-…` 등 소수는 어떤 방법으로도 미해결.
- `deals.lead_id`는 라이브에서 0/22 — 리드 단위 조인 참고사항 (memory: crm-deal-lead-linkage-gap).

## 1. 데이터 모델 (확정)

| 항목 | 저장 위치 | 형태 |
| --- | --- | --- |
| 과목 | `leads.meta.subjects` (신규) | 고정 키 배열, 복수 허용 — `["math","essay"]` |
| 지역 | `leads.meta.region` (기존 유지) | 자유 문자열, `시도-시군구` 규약 |
| 출처 | `leads.meta.label_source` (신규) | `{ subjects: "operator"\|"derived"\|"searched", region: 동일 }` — 필드별 |

- **`meta.enrichment.tags`는 불변.** enrichment 파이프라인 소유라 공유 시 재실행이 운영자 수정을
  덮어쓴다. 읽기 측은 `meta.subjects`가 없을 때만 기존 `subject:*` 태그를 §2 흡수 매핑으로
  변환해 폴백으로 보여준다 (기존 53건 무손실). 폴백 표시값의 출처는 `derived` 취급.
- 지역은 고정 목록을 만들지 않는다 — 시군구 롱테일 250+이고 기존 51건이 이미 규약 일관.

### 1.1 고정 과목 어휘 (12키 — 단일 정본 모듈)

`apps/hub/lib/sales-os/lead-labels.js` (신규)가 유일한 정의처. 목록 순서가 정렬 순서다.

| key | label | | key | label |
| --- | --- | --- | --- | --- |
| `math` | 수학 | | `coding` | 코딩 |
| `english` | 영어 | | `foreign-language` | 외국어 |
| `korean` | 국어 | | `arts-sports` | 예체능 |
| `science` | 과학 | | `elementary-general` | 초등종합 |
| `social` | 사회 | | `early-childhood` | 유아 |
| `essay` | 논술 | | `etc` | 기타 |

## 2. 레거시 태그 흡수 매핑 (24종 → 12키, 같은 모듈에 상수로)

| 레거시 `subject:*` | 흡수 대상 |
| --- | --- |
| math / english / korean / science / essay / coding / elementary-general | 동일 키 |
| social_studies | social |
| math-essay | math + essay (1태그→2키 허용) |
| ai / ict | coding |
| performing-arts / music / design | arts-sports |
| literacy / reading / hanja | elementary-general |
| early-childhood-education | early-childhood |
| language | foreign-language |
| engineering / civil-engineering / maritime / christian_education / general-secondary | etc |

미등재 레거시 값이 나타나면 `etc`로 흡수하고 콘솔 경고 (조용한 드랍 금지).

## 3. 라벨 채우기 (일괄 백필 — 운영자 확인 게이트 필수)

3단계, 각 단계가 `label_source`에 다른 값을 남긴다:

1. **이름 추론** (`derived`) — 이름 문자열의 과목 키워드 규칙 매칭(수학→math, 영수→english+math,
   사탐/한국사→social 등). 64건 결측분 과목의 60~70% 커버 예상.
2. **네이버 서치** (`searched`) — 이름으로 안 풀린 과목 + 결측 지역. Claude가 브라우저로
   학원명 검색, 소재지·과목 확인. 확신 없으면 채우지 않는다.
3. **미해결** — 식별 불가 이름(`ㅁㅁ`·`재수생`·`개인` 등)은 비워 둔다. 억지 추정 금지.

### 3.1 백필 파이프라인

- `scripts/propose-lead-labels.mjs` — 라이브 leads를 `@com-moon/supabase-rest`로 읽어
  흡수 매핑 + 이름 추론을 적용, 제안 JSON(행별 이름/제안 과목/제안 지역/출처/서치 필요 플래그)을
  scratch에 출력. **쓰기 없음.**
- Claude가 서치 필요 행을 네이버로 조사해 제안 JSON을 보충.
- **게이트: 117행 전체 표(이름 / 과목 / 지역 / 출처)를 운영자에게 제시하고 승인받은 뒤에만 반영.**
- `scripts/apply-lead-labels.mjs --apply` — 승인된 JSON을 행별 PATCH (기존 meta read-merge-write,
  clobber 금지). **`label_source`가 이미 `operator`인 필드는 절대 덮지 않는다** (재실행 안전).
  `meta.subjects`가 이미 있는 행은 스킵.

## 4. 확정도 표시 (DESIGN.md §5.3 준수)

- `derived`/`searched` 값 = **권장** — 목록 셀에서는 ◇ 마커 + `--fg-muted` 명도로 표시하고
  접근성 이름에 "권장"을 포함(aria). 직접 라벨 텍스트가 붙은 정식 `CertaintyBadge`(파선 ◇ 권장)는
  드로어가 담당 — 밀도 높은 표에 117×2회 "권장" 텍스트 반복은 소음이라 §11의 직접 라벨 요건을
  드로어 표면에서 충족하는 것으로 정리한다.
- `operator` 값 = **확정** — 마커 없이 일반 포그라운드.
- 결측 = `—` (`--fg-dim`).
- 운영자가 드로어에서 해당 필드를 수정하는 순간 그 필드만 `operator`로 승격 —
  드로어 onChange가 `leadEdits`에 `labelSource` 패치를 함께 기록 (건드리지 않은 필드의 출처 보존).

## 5. UI

### 5.1 드로어 (EditDrawer)

- 기존 `지역` 자유 입력 유지. 옆에 `과목` 복수 선택 칩(12키 고정 목록) 추가 —
  EditDrawer에 chips 멀티셀렉트 필드 타입이 없으면 primitive에 추가한다 (인라인 재구현 금지).
- 각 필드 옆에 `CertaintyBadge` (권장/확정) 표시.
- 저장 봉투 `{ok, status}` 기존 계약 그대로.

### 5.2 목록 컬럼

- `과목`·`지역` 컬럼 추가, 둘 다 `SortHead` 3단 토글(asc→desc→해제).
  과목 정렬 키 = 첫 과목의 고정 목록 인덱스, 지역 = 문자열 정렬(시도 우선 그룹핑 자연 발생).
  결측값은 방향 무관 항상 말미로 가라앉는다 (기본 정렬의 타임스탬프 결측 처리와 동일 계약).
- 복수 과목 셀 표기: `수학·논술`.
- 모바일: 두 컬럼 모두 `.hub-lc-m`으로 숨기고 이름 밑 `hub-lead-mobile-meta` 줄에 병합 (기존 계약).
- 무변별 컬럼 자동 숨김(28차)에 두 컬럼도 편입.

### 5.3 필터 줄

- 헤더 아래 한 줄: 과목 칩(복수 선택, OR) + 지역 드롭다운(시도 단위, 데이터에서 파생) +
  선택 시 "전체 해제". 과목×지역은 AND. 모바일은 `ScrollShadowX` 가로 스크롤.
- 지역 매칭은 시도 접두 일치 (`경기` 선택 → `경기-안양` 포함). 시군구 세밀 필터는 기존
  검색창이 담당 (`region`이 이미 searchText에 포함됨).
- 필터는 확정도 무관하게 매칭 (권장 수학도 수학 필터에 잡힌다 — 백필의 목적).

## 6. 읽기·쓰기 배선

- `mapLead` (revenue-ledger.js): `subjects`(meta.subjects ?? 태그 흡수 폴백), `labelSource` 노출.
- `buildLeadWrite` (revenue-write.js): `payload.subjects` → 12키 검증 후 `metaPatch.subjects`
  (미등재 키 드랍), `payload.labelSource` → `metaPatch.label_source` 병합.
  `undefined`=미변경 스킵, `[]`=명시적 비움 — 기존 필드 계약과 동일.
- 스키마 변경 없음 (전부 meta jsonb).

## 7. 테스트

- `lead-labels` 모듈: 흡수 매핑 24종 전수, 미등재→etc+경고, 이름 추론 규칙 대표 케이스.
- `revenue-write.test.mjs`: subjects 검증·labelSource 병합·미변경 스킵.
- `revenue-ledger` mapLead: meta.subjects 우선 / 태그 폴백 / 결측.
- apply 스크립트: `operator` 필드 보존, meta 병합 무클로버 (fetch 모킹).

## 8. 비범위

- `meta.enrichment.*` 쓰기, enrichment 파이프라인 수정.
- Segments·고객 DB 등 다른 표면의 필터 통합 (이번엔 Leads만).
- 지역 고정 목록화.
