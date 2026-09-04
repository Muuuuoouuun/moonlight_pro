# 세일즈·콘텐츠·마케팅 → 브랜딩: 성장 구조 기획

> 상태: **DRAFT · 권장안(운영자 확정 전)**. 2026-09-03 office-hours 세션 산출물.
> 상위 정본: `docs/README.md` 우선순위 → `docs/operator-workflow-profile.md` → `2026-07-13-moonlight-personal-operator-os-deep-design.md` → 주제별 최신 스펙(`2026-08-29-brand-tab-design.md`, `plans/2026-08-31-personal-revenue-roadmap.md`).
> 관계: 이 문서는 기존 확정 결정을 바꾸지 않는다. Phase 1B·1C 완료를 전제로 **다음 사이클의 후보**를 정리한다. 본문의 `확정`은 기존 문서에서 이미 확정된 사실만 가리키고, 이 문서가 새로 제안하는 것은 전부 `권장`이다. 운영자 인터뷰는 중단 상태이므로 여기서 질문을 던지지 않고 §12에 모아 둔다.
> 검토: 독립 2차 의견 1회(§11), 적대적 리뷰 1회(사실 오류 4건·불일치 8건 반영, 2026-09-03). 코드 인용은 리뷰 시점 라인 번호다.

---

## 0. 한 장 요약

**프레임.** 세일즈·콘텐츠·마케팅은 세 개의 입력 엔진이고, 브랜딩은 그 셋이 쌓이는 **복리 자산**이다. 루프가 닫히면 브랜드가 다음 문의의 획득 비용을 낮춘다. 이 프레임을 지금 시스템에 대면 결론은 네 줄이다.

1. **세일즈 엔진은 깊고 진짜다.** 리드·딜·고객DB·팔로업·원자 컨택 결과 RPC·Guru 코칭·승인 큐·시트 인테이크까지 있다. 다만 Phase 1B·1C가 부분 작동이고 아직 매일 쓰지 않는다(2026-07-29 확인). 모든 학습 루프가 데이터 기아 상태다.
2. **콘텐츠 엔진은 원장은 완비, 신호는 0.** `content_items`·`variants`·`publish_logs`·브랜드 정체성·케이던스·아이디어 큐·플라이휠 크론이 있지만, 발행은 수동 마킹이고 조회·공유·문의 신호는 하나도 안 들어온다. 제작 화면(blog·카드뉴스)이 실제 채널(Threads·IG·Shorts)과 어긋난다.
3. **마케팅 엔진은 사실상 없다.** 주인 문서도 주인 화면도 없다. 캠페인 워룸은 7탭 중 6탭이 빈 경로, 세그먼트는 ClassIn 읽기 전용, 리드의 95%가 오는 Meta 시트의 검토 행을 보여줄 `IntakeInbox`는 만들어졌지만 라우팅이 안 돼 있다.
4. **브랜딩은 이제 막 "운영 대상"이 됐다.** 브랜드 탭 P1이 8/29에 나왔다. 그러나 9+1개 브랜드가 역할 구분 없이 같은 무게이고, 브랜드→매출 연결(`byBrand`)은 죽은 스텁이며, 증거(실사용 레퍼런스·후기·사례)를 모으는 곳이 없다.

**가장 큰 발견 두 가지.**
- 성장 수식(`계약 = 문의 × 유효리드율 × 클로징률`, 60건 = 문의 600개)에서 운영자가 **통제하는** 레버는 둘뿐이다. 문의의 95%는 회사 Meta 예산이 정하므로 그의 변수가 아니다. 그가 쥔 것은 (a) 리드에 얼마나 빨리·몇 번 닿는가(유효리드율 20%를 40%로 올리면 필요 문의 수가 절반), (b) 브랜드가 만드는 문의(적지만 결제율 10%로 진하다). 시스템의 근육은 (a)의 뒤쪽(팔로업·CRM)에 있고, (a)의 앞쪽(도착 → 첫 접촉 속도)과 (b)에는 계측이 없다. 세 엔진 사이에 **다리가 하나도 없다**: 고객 반론이 콘텐츠 아이디어가 되지 않고, 콘텐츠가 리드에 귀속되지 않으며, 성사된 거래가 브랜드 증거가 되지 않는다.
- **초안을 만드는 크론 2개가 지금 실패 중이다.** `followup-autopilot`과 `content-flywheel`은 Engine이 돌려주는 `{text}`가 아니라 `subject/body`·`title/body`를 요구하고, 요청하는 모드(`followup-draft`·`content-draft`)가 Engine에 없어 조용히 다른 모드로 떨어진다. 결과: 승인 큐에 초안이 한 번도 들어간 적이 없다. "AI 자율 워커 + 발송만 승인" 로드맵은 배관은 있는데 물이 안 흐른다(§5.6 W19, §7 F-0).

**권장.** 새 최상위 탭을 만들지 않는다(추가 서피스는 기존 페이지 안 섹션이나 하위 라우트로, 마운트 위치는 §7에 명시). (1) 1B·1C를 닫고 매일 쓰는 의식을 시작하되, 그 의식이 열리는 화면을 **"오늘 연락할 리드"**(기존 고객 연락 화면 + 소스 배지 + 도착 후 경과 + SLA 정렬)로 정한다. (2) 기존 원장에 **다리 3개 + 계측 필드 2개**(`first_touch_at` 파생, `content_ref`)를 놓는다. 시트 리드의 소스·캠페인·폼·도착 시각 필드는 이미 있다. (3) 30일 동안 **주간 성장 리뷰**로 세 엔진을 한 화면에서 읽는다. 큰 것(설명회 퍼널·캠페인 워룸·브랜드 편집장 AI·성과 API)은 그 30일이 신호를 보여줄 때 졸업시킨다. 상세는 §9 접근안 A+C, 2차 의견 반영은 §11.

---

## 1. 프레임: 세 엔진과 하나의 복리 자산

```text
        ┌────────────── 세일즈 ──────────────┐
        │ 문의 → 유효리드 → 상담·데모 → 견적 → 종료 │
        │ 결과: 매출, 반론, 고객 반응, 사용 장면    │
        └──────┬──────────────────────┬──────┘
   반론·질문 → 아이디어               성사·반응 → 증거
        ┌──────▼──────┐        ┌──────▼──────┐
        │   콘텐츠     │        │   브랜딩     │ ← 복리 자산
        │ 아이디어 → 제작│──발행──▶│ 정체성·리듬·기록│
        │ → 파생 → 발행 │        │ 포지셔닝·증거  │
        └──────┬──────┘        └──────▲──────┘
      콘텐츠 → 문의(귀속)             신뢰 → 문의 비용↓
        ┌──────▼──────────────────────┴──────┐
        │              마케팅                 │
        │ 유입 소스(Meta·Threads·설명회·기존고객)│
        │ SLA · 세그먼트 · 캠페인 · 허락 자산    │
        └────────────────────────────────────┘
```

이 운영자에게 각 단어의 뜻은 다음과 같다(운영자 프로필·성장 계획 기준).

| 엔진 | 이 운영자에게의 정의 | 회사 lane(ClassIn) | 개인 lane |
|---|---|---|---|
| 세일즈 | 문의를 계약으로 바꾸는 사람의 행동. 전화·문자 → 방문 → 카톡. 이메일 0. | 학원·기관 HW/SW 판매, 월 6건 → Gate 1 300,000 CNY | 코칭·자문형 개인 딜(30일 현금흐름 로드맵). 오퍼 정의는 미정(§12 Q1)이라 이 문서는 의도적으로 비워 둔다 |
| 콘텐츠 | 원본 아이디어 하나를 Threads·Instagram·Shorts로 재가공. Threads 하루 1개. | `classmoon` 사례 중심, 실사용 레퍼런스 영상이 최고 성과 | 개인 lane 브랜드 7개(전체 9+1 중 ClassIn 스코프 3개 제외), 각기 다른 리듬 |
| 마케팅 | 문의가 들어오는 **소스**를 관리하는 일. 광고는 마케팅팀이 집행. | Meta 리드 시트(95%) · Threads DM · 설명회 · 기존 고객 | 의도적 공백(§12 Q1·Q4 대기) |
| 브랜딩 | 누구를 위한 누구인가를 한 줄로 만들고, 리듬을 지키며, 증거를 쌓는 일. | "교육 현장 세일즈" 개인 브랜드 = 회사 문의의 가장 질 좋은 소스 | 정체성·꿈 브랜드(시·회복·신앙·정치·기록) |

브랜딩이 복리 자산인 이유는 숫자에 있다. 최고 성과 Threads 콘텐츠의 퍼널은 `30 문의 → 6 유효 → 3 결제`(전체 결제율 10%)로, Meta 단순 리드보다 훨씬 진하다(`classin-growth-operating-plan.md` §2, §4 "단순 Meta lead는 템플릿 응답/질문으로 컷"). 브랜드가 만드는 문의는 **적지만 싸고 진하다**. 이걸 늘리는 것이 세 엔진을 한 방향으로 맞추는 일이다.

---

## 2. 운영자 현실과 숫자 (문서에서 확인된 사실만)

| 항목 | 값 | 출처 |
|---|---|---|
| Moonlight 목적 | 인지 에너지 1/3, 누락 0건. 본인만 쓰는 개인 OS, SaaS 아님 | 프로필 §2 확정 |
| 실사용 | 2026-07-29 기준 "아직 매일 안 씀, 간단 테스트만" | 메모리 `phase1-usage-and-priorities` |
| 구현 단계 | Phase 0·1A 완료, 1B·1C 부분 작동, 컨택 결과 정본 화면 미정 | `docs/README.md` §3 |
| ClassIn 기준값 | 월 6건 계약 ≈ 100,000 CNY. HW 20,000 · SW 첫 충전 10,000 CNY | 성장 계획 §1 |
| 목표 게이트 | Gate 1 월 300,000 CNY → Gate 2 월 60건/HW 60대 → Gate 3 월 1,000,000 CNY+ | 성장 계획 §2 |
| 퍼널 상수(Threads 최고 성과 콘텐츠 기준) | 30 문의 → 6 유효(20%) → 3 결제(50%). 60건 = 문의 600개. **Meta 시트 리드의 기준선은 문서에 없다** — §13 과제 1이 잰다 | 성장 계획 §2 |
| 리드 소스 | ~95% Meta 광고/마케팅팀 Google Sheet, 나머지 기존 고객·Threads | 성장 계획 §1 |
| 반복 업무 | 하루 약 4h(콘텐츠 2h, 리드·콜 2h) → 40% 절감 목표 | 성장 계획 §4 |
| 콘텐츠 채널 | Instagram · Threads · YouTube Shorts. Threads 비중 최대, 하루 1개 목표, 실제 1~2개 비지속 | 프로필 §12 |
| 콘텐츠 신호 | 공유 수 · 답글/문의 수 · 조회 수(도달 선행 신호) | 프로필 §12 |
| 아이디어 보관 | 메모장 + Threads 임시 저장에 흩어짐 | 프로필 §12 |
| 브랜드 | 개인 9 + ClassIn `classin_side`. `classmoon`·`studyseagull`·`classin_side`만 ClassIn 스코프 | `20260427_0004`, `operating-ledger.js` |
| 개인 lane 매출 | 30일 현금흐름 로드맵 출시(8/31). 무엇을 파는지(오퍼) 정의는 문서에 없음 | `plans/2026-08-31-…`, 시드 "Studio OS advisory pilot" |
| 하드 게이트 | ClassIn 전체 동기화 · 음성 AI · 직접 소셜 발행은 1B·1C 뒤 | `docs/README.md` §3 |

**빠져 있는 사실.** 운영자의 개인 목표·꿈(예: 시나브로 시집 출간, 고래 회복 프로덕트, MoonPM 툴킷)은 브랜드 `meta.philosophy`와 프로젝트 이름에만 흔적이 있고, 정본 문서 어디에도 목표 문장이 없다. 이 기획은 그 자리를 **채우지 않고** §12에 질문으로 남긴다.

---

## 3. 현재 시스템 지도 (필러 × 표면 × 진실 상태)

`live` = Supabase 원장을 그대로 렌더 · `partial` = 일부 소스만 · `stub` = 데이터 경로 없음 · `orphan` = 만들어졌지만 라우팅 없음.

### 3.1 세일즈

| 표면 | 상태 | 비고 |
|---|---|---|
| Leads / Deals / Accounts / Cases / 고객 DB(Customer 360) | live | `revenue.jsx`, `customers.jsx`. 딜 stalled 14일 상수, Guru 코칭 패널 |
| 고객 연락(Followups) | live | 전화·문자 → 방문 → 카톡. `POST /api/integrations/outcomes/record` 단건 insert(비원자) |
| 컨택 결과 원자 RPC `record_contact_outcome_v1` | live | 고객 DB 컨택 시트에서만 사용. 정본 화면 미정 |
| Stalled scan(Daily Brief 로드 시) · recompute-scores 크론(휴리스틱 점수) | live | 발송 0 |
| followup-autopilot 크론(07:00 KST) | **실패 중** | Engine `sales-mentor` 응답 `{text}`에 `subject/body`가 없어 항상 `errored`. `work_orders` 생성 0건. 모드 `followup-draft`는 Engine에 없음 → `pipeline-triage`로 조용히 대체 |
| Telegram 봇(명령 → `automation_runs`, `/cardnews` → 콘텐츠 초안) | live | 폰에서 들어오는 유일한 실제 캡처 경로. 프로필 §3 "짧은 텍스트·음성·붙여넣기"와 맞닿음 |
| Google Sheets 인테이크(import → staging → promote → push) | live(연결 시, **import는 수동**·크론 없음) | 승격 시 `leads.source`(`meta_ads`·`threads`·`google_sheets`)와 `meta.{campaign, ad_name, adset_name, form_name, form_id, created_time, intent, validity, source_ref}`를 이미 정규화해 쓴다(`sheets-sync.js buildLeadRecord`). `sheets-sync.jsx`는 집계만 보여줌 |
| **IntakeInbox**(staging 행 단위 검토·승격·반려) | **orphan** | `pages/intake-inbox.jsx` + `GET/POST /api/hub/intake`가 있으나 `PAGE_MAP`·`hub-nav.js`에 없음. 옛 경로 `dashboard/classin/intake`는 `hub-data.js:112`에서 `classin/revenue`로 alias 중 |
| 명함 OCR 인테이크, Gmail → intake 스캔 | live | |
| Guru(세일즈 멘토) · Council · AgentsOrders(승인 큐) | live(Engine 필요) | 5 페르소나 채팅은 엔드포인트 없음(명시적 비활성) |
| eeoCRM 동기화 | orphan | 페이지·API 존재, 라우팅 없음. v1.4 보류 결정과 일치 |
| Segments | live, 읽기 전용, ClassIn 전용 | 유입경로·단계·유형·스코어밴드 |

### 3.2 콘텐츠

| 표면 | 상태 | 비고 |
|---|---|---|
| Queue(Inbox → Drafting → Ready → Handed off → Watch) | live | 브랜드 필터 · 케이던스 읽기 |
| Studio | live + IndexedDB 미러 | **blog 모드 + 카드뉴스 캐러셀**. Threads 텍스트·Shorts 스크립트 1급 편집기 없음 |
| `content_items` / `content_variants` / `content_assets` / `publish_logs` | 원장 존재 | `publish_logs`에 `channel · target_url · external_id` 있음(플랫폼 게시물 매칭 키). 발행은 수동 마킹 |
| Quick Capture `idea` 힌트 | live | `quick_capture` RPC가 `idea`를 `work_orders(kind idea, persona content, status proposed, gate needs_human)`로 보냄. `content_items(status idea)`와 두 갈래인지 §7 F-6에서 확인 |
| content-flywheel 크론(07:30 KST) | **실패 중** | Engine `brand-mentor` 응답에 `title/body`가 없어 항상 502 `draft-failed`. 모드 `content-draft`는 Engine에 없음 → `brand-strategy`로 대체. 고쳐도 성과 신호가 없어 선택 근거는 `content_rules`뿐 |
| IG / Threads OAuth 연결·상태 | live(인증만) | `media_publish`·컨테이너 생성 코드 없음 → **게시 불가**. 수집 없음. YouTube 없음 |
| 발행 handoff(`publish_logs.provider`) | 수동 | 코드 기본값이 `n8n`(`content-ledger.js:785`)이지만 발행 handoff 경로에서 n8n을 호출하는 코드는 없다(n8n 호출은 Telegram 웹훅에만 있음). 마지막 단계는 사람의 복사·붙여넣기 |
| 성과(조회·공유·답글) | **없음** | 브랜드 탭 성과 탭은 정직한 preview(P5) |

### 3.3 마케팅

| 표면 | 상태 | 비고 |
|---|---|---|
| Campaigns 워룸(Pulse·Strategy·Surfaces·Content·Audience·Attribution·Automation) | **live 목록 / stub 상세** | `CAMPAIGN_WAR_ROOMS = {}`, 7탭 중 6탭 데이터 경로 없음. `GET /api/hub/campaigns`는 소비자 0 |
| `campaigns` 테이블 | 존재(2026-07-10 신설) | `brand_id · name · status · channels · progress · goal_label/current/target · ends_label · meta`. **목표·브랜드는 있고 소스·귀속 필드만 없다.** 마이그레이션 헤더 스스로 딥 탭 5개는 "별도 데이터 모델 결정 필요" |
| `sales_plays` · `sales_play_runs` · `campaign_runs` | **dead** | 마케팅 실행 프리미티브로 만들었지만 코드 참조 0 |
| 오디언스·구독자·리스트 테이블 | **없음** | `audience`는 이메일 발송 payload의 자유 텍스트뿐 |
| Segments | live 읽기 전용 | ClassIn 스코프에서만 노출 |
| EmailAutomation | 상태만 | Gmail/Resend 연결 상태. 규칙 엔진 없음. 회사 영업은 이메일 0이라 우선순위 낮음 |
| 리드 소스 정규화 | **partial** | 시트 경로는 됨: `leads.source`(`meta_ads`·`threads`·`google_sheets`)와 `meta.{campaign, ad_name, adset_name, form_name, form_id, created_time, intent, validity}`. DM·명함·Gmail·수동 경로는 `source` 자유 텍스트. **도착 → 첫 접촉 시간은 어디에도 없다**(`last_touch_at`은 승격 시각 `now`로 덮인다) |
| 설명회·세미나 퍼널 | **없음** | 참석자 데이터는 스프레드시트 마구잡이(프로필 §10) |
| 허락 자산(뉴스레터·카톡 채널·커뮤니티) | **없음** | 리드 마그넷·소개 자료·매뉴얼은 시스템 밖 파일 |
| 매출 히트맵(지역별) | live(파생) | 마케팅 타겟 참고용 |
| 주인 문서 | **없음** | 심화 설계에 마케팅 절 없음. 성장 계획 §9가 유일한 우선순위표. 별도 스펙이 생기기 전까지 이 문서 §3.3·§6·§8이 임시 주인 문서 역할을 한다 |

### 3.4 브랜딩

| 표면 | 상태 | 비고 |
|---|---|---|
| 브랜드 탭(목록 · 정체성 읽기 · 생성 · 주간 목표 certainty) | live(P1) | 스케줄·기록·성과 탭은 의도적으로 안 그림(P3~P5) |
| `brands.meta`(philosophy · direction · voice · cadence · keywords · rules · forbidden · channels) | live | 9+1 브랜드 시드. AI 프롬프트(`brand-context.js`)가 읽음 |
| 정체성 편집 | **미구현 + 위험** | Engine `update_brand`가 `meta`를 통째로 교체(D6). P2 전 병합으로 수정 필수 |
| 브랜드별 주간 목표 `meta.weekly_goal` | 미확정 | 전역 `goal = 5`. 브랜드 탭은 권장값으로만 표시 |
| 브랜드 → 매출 | **stub** | `RevenueOverview.byBrand = []`(`revenue.jsx:290`) |
| 브랜드 → 프로젝트 · 콘텐츠 | live(조회) | `projects.brand_id`, `content_items.brand_id` |
| 증거 원장(레퍼런스 · 후기 · 사례) | **없음** | `notes`는 `project_id`만, `brand_id` 없음(P4 마이그레이션 1줄 예정) |
| 포지셔닝 한 줄 · 브랜드 역할 | **없음** | `marketing-branding-gurus.md`는 지식 참고일 뿐 제품에 미반영 |
| 공개 증명(사례 페이지 · 운영 에세이) | 보류(Phase 4) | 30일 sticky 사용 뒤 |

### 3.5 세 엔진 사이의 다리 (현재 0개)

| 다리 | 방향 | 지금 | 필요한 최소 조각 |
|---|---|---|---|
| 콘텐츠 → 문의 귀속 | 콘텐츠 → 세일즈/마케팅 | 없음. `meta.source_ref`는 이미 시트 행 참조 키로 쓰인다. `outreach_outcomes.asset_id`는 컬럼·쓰기 경로만 있고 채우는 생산자가 없다 | 리드에 `meta.content_ref`(게시물 URL 또는 content_item id) 1키 |
| 반론·질문 → 아이디어 | 세일즈 → 콘텐츠 | 없음. Guru 프롬프트가 반론을 알지만 아이디어함으로 안 감 | 컨택 결과 시트에 `고객 질문/반론` 칩 → `content_items(status idea)` 자동 생성 |
| 성사·반응 → 증거 | 세일즈 → 브랜딩 | 없음 | `won` 딜 + 긍정 `고객 반응` → 증거 후보 태그 |
| 브랜드 → 매출 | 브랜딩 → 세일즈 | `byBrand` 스텁 | 귀속 필드가 생기면 같은 read model로 계산 |
| 소스 → 전환 | 마케팅 → 세일즈 | 시트 경로는 정규화됨, 나머지 경로는 자유 텍스트, 첫 접촉 시각 없음 | 비시트 경로 `source` 통일 + `first_touch_at`(최초 활동에서 파생) |

---

## 4. 강점

1. **세일즈 스파인이 실제로 작동한다.** 리드·딜·고객DB·팔로업·원자 RPC·stalled scan·Guru·승인 큐·시트/명함/Gmail 인테이크. 채널이 운영자의 진짜 동선(전화·문자 → 방문 → 카톡, 이메일 0)을 따른다.
2. **정직한 데이터 상태 계약.** 소스별 live/partial/preview/error, mock 혼합 금지, 브랜드 성과 탭을 빈 껍데기로 안 그리는 절제. 신뢰가 무너지면 운영자가 메모장으로 돌아간다는 걸 시스템이 안다.
3. **승인 게이트 반자동화의 골격이 이미 있다.** `work_orders(proposed → approved → executing → executed)` 스파인, 외부 실행 3종만 허용(`content_handoff · content_export · email_send`), 중복 오픈 팔로업 방지 인덱스, `decide_work_order` MCP, Daily Brief 승인 카드. chief-of-staff 크론은 실제로 "오늘 이 3개만"을 만든다. (초안 크론 2개는 §5.6 W19처럼 고장 나 있지만, 고치면 곧바로 이 골격에 얹힌다.)
4. **폰 캡처 경로가 이미 있다.** Telegram 봇이 명령을 `automation_runs`로, `/cardnews`를 콘텐츠 초안으로 쓴다. 운영자의 "급할 때 음성·짧은 메모" 습관을 받을 자리다.
5. **브랜드 정체성이 데이터로 존재하고 이제 화면도 있다.** 철학·보이스·규칙·금지어가 브랜드당 시드돼 있고 AI가 읽는다. 브랜드 탭 P1이 "AI가 보는 것 = 내가 보는 것"의 첫 발이다.
6. **콘텐츠 원장 구조가 완비.** `content_items` 상태·랭크·케이던스 주차·meta, variants, assets, `publish_logs`(channel · url · external_id). 귀속·성과를 붙일 자리가 이미 있다.
7. **두 lane을 하나의 OS에서 다룬다.** 스코프 셸, `workspace-map.js` SSOT, 개인 30일 현금흐름 로드맵. "꿈"과 "회사"를 한 화면에서 보는 구조적 전제가 있다.
8. **문서 규율.** 확정/권장/미정 분리, README 우선순위, DESIGN.md 상태 문법. 이 기획도 그 규율 안에서 쓸 수 있다.

---

## 5. 약점

### 5.1 가로지르는 약점 (가장 무겁다)

- **W1 · 중력 부재.** 매일 안 쓴다. 1B·1C가 부분 작동이라 "오늘 뭐부터"가 아직 5초 안에 안 나온다. outcome → triage, 성과 → 랭킹 같은 모든 학습 루프가 데이터 기아. 이 약점이 해결되기 전의 모든 계측은 빈 표다.
- **W2 · 다리 0개.** §3.5. 세 엔진이 각자 원장을 갖고 서로 모른다. 운영자가 머릿속에서 잇고 있다 = 인지 에너지 1/3 목표의 정반대.
- **W3 · 마케팅 필러 부재.** 주인 문서·주인 화면이 없다. 시트 경로의 소스 필드는 정규화돼 있지만 그것을 읽는 화면(소스별 전환·첫 접촉)이 없고, 리드의 95%가 오는 통로의 검토 행을 보여줄 화면이 orphan 상태다.
- **W4 · 계측 0.** 문의 수(월), 소스별 전환, 콘텐츠별 문의, 브랜드별 발행 대비 목표. 성장 계획 §9 P0 "lead source별 전환 대시보드"가 아직 없다.

### 5.2 세일즈

- **W5** 컨택 결과 기록 경로 2개 공존(원자 RPC vs 단건 insert), 정본 화면 미정 → 학습 sink 품질 저하.
- **W6** owner scope 검증(20샘플) 미완 → 집중 고객 자동 추천 게이트 잠김.
- **W7** Next Action Ledger·넛지(열린 딜 다음 행동 90%) 미구현. 팔로업은 있으나 "다음 행동 없음" 자체를 잡는 넛지가 없다(nudge layer §3.3).

### 5.3 콘텐츠

- **W8** 채널 불일치. Studio는 blog + 카드뉴스, variant 타입은 newsletter/blog/card/x_thread/reels 계열인데 실제 채널은 Threads·IG·Shorts. 운영자의 1순위 포맷(Threads 짧은 글, 3~5초 실사용 레퍼런스 영상)이 1급 객체가 아니다.
- **W9** 성과 신호 0 → flywheel의 아이디어 선택이 추측. 브랜드 탭 성과는 preview.
- **W10** 아이디어 입력이 두 갈래일 수 있음(`work_orders kind idea` vs `content_items status idea`). Q116~120 미정이라 상태 모델도 임시.

### 5.4 마케팅

- **W11** 설명회 퍼널 없음(신청 → 참석 → 상담 → 결제). 참석자 데이터 스프레드시트.
- **W12** 허락 자산 없음. 리드 마그넷·자료는 파일로만 존재.
- **W13** 캠페인은 껍데기. `campaigns`에 목표·브랜드는 있지만 소스·귀속 필드가 없고, 워룸 딥 탭을 채우는 데이터 경로가 없다.

### 5.5 브랜딩

- **W14** 9+1 브랜드 동일 취급. 역할(매출/오디언스/정체성) 없음, 주간 목표 미확정, 포지셔닝 한 줄 없음. `저빈도 고품질`과 `고빈도 확산`이 같은 `goal = 5`로 측정된다.
- **W15** 증거 원장 없음. 최고 성과 콘텐츠가 "실사용 레퍼런스 영상"인데 레퍼런스 소스(고객 사용 장면·후기·성사 사례)를 모으는 곳이 없다.
- **W16** D6 `update_brand` meta 덮어쓰기. 정체성 편집을 열면 철학·보이스·규칙이 지워진다.
- **W17** 개인 lane의 오퍼·목표 문장이 없다. 현금흐름 로드맵은 있는데 "무엇을 파는가"가 문서에 없다.

### 5.6 문서·운영·배관

- **W18** `docs/README.md` 인덱스가 2026-09-03까지 8/29 브랜드 탭·8/31 매출 로드맵을 안 담고 있었다(이 세션에서 등재, 미커밋). 개인 매출 로드맵 `design-qa.md`는 `final result: blocked`.
- **W19 · 초안 크론 2개 고장.** `apps/hub/app/api/cron/followup-autopilot/route.js:128-129`는 `data.subject/body`를, `content-flywheel/route.js:126-127`은 `data.title/body`를 요구하지만 Engine `ai/sales-mentor`·`ai/brand-mentor`는 `{status, mode, ref, model, text, reason, persistence}`를 돌려준다. 요청 모드 `followup-draft`·`content-draft`는 두 Engine `MODES`에 없어 `normalizeMode`가 `pipeline-triage`·`brand-strategy`로 조용히 바꾼다. 매일 아침 `agent_runs(result='error')`만 쌓이고 `work_orders`는 0건. 승인된 3-lane 로드맵 중 생성 lane 둘이 실제로는 한 번도 작동한 적이 없다.
- **W20 · 쓰는 사람 없는 원장.** `automations · triggers · automation_runs`는 Automations·Overview가 읽지만 Hub 어디서도 쓰지 않는다(유일한 writer는 Telegram). Automations 대시보드는 구조적으로 비어 있다. `classin_crm_snapshot`은 `crm-pipeline.js:24`가 조회하지만 어떤 마이그레이션에도 없다.
- **W21 · 읽기 라우트 무인증(확인 필요).** Hub `GET /api/hub/{revenue, daily-brief, content, agents, …}`는 쓰기 가드만 있고 읽기 인증이 없다. Vercel 크론이 있으니 배포돼 있다는 뜻인데, 배포 앞단에 접근 제한(Vercel Authentication 등)이 있는지 확인이 필요하다. 이 기획 범위 밖이지만 고객 데이터라 적어 둔다.
- **W22 · 마이그레이션 번호 충돌.** `0003·0004·0012~0018`이 두 날짜 계열에 각각 있다(예: `20260620_0012` vs `20260710_0012`). 파일명 정렬로 돌아가고 있지만 새 마이그레이션을 추가할 때 실수하기 쉽다.

---

## 6. 지금 필요한 것 (순서가 곧 우선순위)

| # | 필요한 것 | 왜 지금 | 무엇을 하지 않는가 |
|---|---|---|---|
| N0 | **1B·1C 마감** (컨택 결과 정본 화면 결정, Attention adapter, Calendar agenda, timeout/partial 계약) | 현 로드맵 그대로. 이 문서가 대체하지 않음 | 새 탭 |
| N1 | **매일 쓰는 의식 3개**: 아침 Daily Brief 3분 → 마감 outcome 10분 → 주 1회 성장 리뷰 30분 | W1. 계측은 사용 뒤에만 의미 | 자동 발송, 푸시 |
| N2 | **"오늘 연락할 리드" 화면 하나**: 기존 고객 연락(Followups)에 소스 배지 · 도착 후 경과 · SLA 정렬(구매 신호 → 미접촉 → 오늘 due) + 상단 소스별 `유입 / 24h 내 접촉률 / 미팅 수락 / 결제` 스트립. 뒤에서 `IntakeInbox` 라우팅과 계측 필드 2개(`first_touch_at` 파생, 비시트 경로 `source` 통일)가 받친다. 시트 리드의 소스·캠페인·폼·도착 시각(`meta.created_time`)은 이미 있다. 정렬 규칙은 B-5의 것 하나만 쓴다 | W1·W3·W4. 리드 95%가 오는 Google Sheet를 대체하는 유일한 화면이라 의지가 아니라 필요로 매일 열린다(§11 2차 의견) | 새 최상위 탭, 광고 집행 연동 |
| N2-1 | **초안 크론 2개 수리**(F-0) | W19. 고치기 전까지 "AI 자율 워커"는 문서에만 존재 | 자동 발송 |
| N3 | **다리 3개, 필드 3개**: `leads.meta.content_ref`(어느 글이 DM을 만들었나; `source_ref`는 시트 행 키라 이름을 나눈다) / 컨택 시트 `반론 칩 → idea` / `won + 긍정 반응 → 증거 태그` | W2. 새 테이블 0 | 그래프 재설계 |
| N4 | **브랜드 역할·주간 목표 확정 + D6 수정** | W14·W16. 운영자 10분 결정 + Engine 병합 1건 | 브랜드 추가 |
| N5 | **채널 정합**: Threads 텍스트·Shorts 스크립트를 1급 variant로, 카드뉴스는 유지 | W8. 제작 인지 에너지가 가장 큰 지점 | 직접 발행 |
| N6 | **주간 성장 리뷰 read model**: 소스별 문의·콘텐츠별 문의·브랜드별 발행/목표·딜 이동·증거 수. 마운트는 기존 현황(`dashboard/overview`) 페이지의 주간 섹션, 새 라우트 없음 | W4. 한 화면에서 세 엔진 읽기 | 차트 대시보드 |

---

## 7. 보완점 (기존 것을 고치는 일)

크기: S(반나절 이하) · M(1~3일) · L(1주+). 전부 `권장`.

| # | 보완 | 파일·원장 | 크기 | 푸는 약점 |
|---|---|---|---|---|
| **F-0** | **초안 크론 수리.** Engine `sales-mentor`·`brand-mentor`에 `followup-draft`·`content-draft` 모드를 실제로 추가하고 응답에 구조화 초안(`subject/body` 또는 `title/body`)을 포함하거나, 크론이 `text`를 파싱하도록 맞춘다. 수리 후 `agent_runs(result='error')`가 멈추고 `work_orders(proposed)`가 생기는지 회귀 테스트 1건. 출시된 크론의 수리이지 Council·Guru 설계 확장이 아니므로 README의 보류 목록과 충돌하지 않는다 | `apps/hub/app/api/cron/followup-autopilot/route.js:128-129`, `content-flywheel/route.js:126-127`, `apps/engine/app/api/ai/{sales,brand}-mentor/route.ts` MODES | S~M | W19 |
| F-1 | `IntakeInbox`를 `PAGE_MAP`·`hub-nav.js`에 등록. 경로 `dashboard/revenue/intake`(영업·매출 하위 "유입 검토"); ClassIn 스코프 `dashboard/classin/intake`를 쓰려면 `hub-data.js:112`의 alias(`→ classin/revenue`)를 먼저 제거 | `hub-app.jsx`, `hub-nav.js`, `hub-data.js`, `pages/intake-inbox.jsx` | S | W3 |
| F-2 | 컨택 결과 정본 화면은 **운영자 결정**(README §3 미정, §12 Q7). 확정되면 `followups.jsx` 인라인 폼을 `record_contact_outcome_v1`로 통일. 확정 전에는 두 경로를 그대로 두고 B-5의 결과 기록 버튼은 기존 경로를 쓴다 | `followups.jsx`, `/api/hub/revenue/contact-outcome` | 결정 + M | W5 |
| F-3 | 리드 계측: (1) 비시트 경로(DM·명함·Gmail·수동)의 `leads.source`를 시트 경로 어휘(`meta_ads · threads · existing · referral · event · manual`)로 통일. (2) `arrived_at`은 `meta.created_time`, 없으면 intake 행 `created_at`으로 fallback하고 `meta.arrived_at_source='import'` 표시. (3) `first_touch_at`은 컬럼이 아니라 read model 파생: 그 리드의 최초 `crm_activities`·`outreach_outcomes` 시각(`last_touch_at`은 승격 시 `now`로 덮이므로 쓰지 않는다). (4) 같은 사람이 시트와 DM 양쪽에서 오면 먼저 도착한 소스가 `source`, 나중 것은 활동으로 기록. **전제: 시트 import가 수동이라 도착 시각 정밀도는 import 주기에 묶인다** — 필요하면 import 크론(`vercel.json`) 1개를 선행 | `sheets-normalize.js`, `followups-ledger.js`, `leads.meta` | M | W3·W4 |
| F-3a | 고객 연락 화면에 소스 배지 · 도착 후 경과(24h 초과만 danger 레일) · B-5 정렬 규칙 + 상단 소스별 `.stat` 스트립(repository 쿼리, 새 테이블 없음) = 성장 계획 §9 P0 "lead source별 전환 대시보드" | `followups.jsx`, `followups-ledger.js` | M | W1·W4 |
| F-4 | Engine `update_brand` meta 병합. `pms-command.ts`는 REST PATCH 디스크립터를 반환하는 구조라 SQL식 `meta \|\| patch`는 불가 → Engine에서 read-merge-write 하거나 병합 RPC 1개 | `apps/engine/lib/pms-command.ts:473` | S | W16 |
| F-5 | 브랜드 `meta.weekly_goal` + 정체성 편집(P2) | `brands.jsx`, `brand-directory.js` | M | W14 |
| F-6 | 아이디어 입력 단일화: `quick_capture(idea)`가 만든 `work_orders(kind idea)`를 `content_items(status idea)`로 승격하는 경로 확정(둘 중 하나가 정본) | `20260715_0014`, `apps/hub/lib/sales-os/work-orders.js`, `content-ledger.js` | M | W10 |
| F-7 | variant 타입에 `threads_post` · `shorts_script` 1급 추가(기존 `x_thread`·`reels_script` 별칭 유지), Studio에 Threads 텍스트 모드. `content_variants_variant_type_check`(`20260602_0004`) 재생성 마이그레이션 1개 필요 | `content_variants` 계약, `content.jsx` Studio | M | W8 |
| F-8 | `RevenueOverview.byBrand` 스텁 제거 또는 귀속 필드 기반으로 실계산 | `revenue.jsx:290`, `revenue-ledger.js` | S | W14 |
| F-9 | `campaigns`에 `source_kind`·`goal_kind`만 추가(`brand_id·goal_target·channels·meta`는 이미 있음; 처음엔 `meta` 키로 시작해도 된다) 후 Pulse·Attribution 2탭만 실데이터 | `campaigns`, `content.jsx:1200-1495` | M | W13 |
| F-10 | `notes.brand_id` 마이그레이션(P4 D5) — 증거 원장의 저장소로 겸용 | `schema.sql:75` | S | W15 |
| F-11 | `docs/README.md` §4 등재분(이 세션) 커밋, 개인 매출 로드맵 design-qa 재실행 | `docs/README.md`, `design-qa.md` | S | W18 |
| F-12 | Next Action Ledger P1: 열린 딜 `next_action`(실제 컬럼) 커버리지 계산 + "다음 행동 없음" 넛지를 Daily Brief·딜 보드에 | `deals.next_action`, `daily-brief.jsx` | M | W7 |
| F-13 | Segments를 개인 스코프에도 노출(유입경로 축은 F-3 뒤에 의미가 생김) | `hub-nav.js` | S | W3 |
| F-14 | MCP에 `record_contact_outcome` · `tag_lead_source` · `create_content_idea` 도구 추가(에이전트가 다리를 건널 수 있게). 셋 다 사람의 행동·데이터를 **기록**하는 쓰기라 심화 설계 §18 기준으로 자동 허용, `source='mcp'` 표기. 외부 발송·발행은 여전히 `work_orders(proposed)`만 만든다 | `packages/mcp-server/src/tools.js` | M | W2 |
| F-15 | 배포된 Hub의 읽기 라우트 접근 제한 확인(Vercel Authentication 또는 읽기 토큰). 이 기획 범위 밖이지만 먼저 확인 | Vercel 프로젝트 설정, `hub-write-guard.js` | S | W21 |
| F-16 | dead 테이블 정리 결정: `sales_plays · sales_play_runs · campaign_runs`를 B-6·F-9의 저장소로 되살릴지, 드롭할지. 마이그레이션 번호 규칙(날짜+연속 번호) 1줄을 `supabase-db-strategy.md`에 | `supabase/migrations`, `docs/supabase-db-strategy.md` | S | W20·W22 |

---

## 8. 아예 새롭게 시도할 것 (권장 베팅)

각 베팅은 "어떤 신호가 행동이 되지 않는가"에 답한다(`master-roadmap.md` §6). 새 테이블은 B-6만 요구하고, 나머지는 기존 원장 + meta 필드다.

### B-1 콘텐츠 → 문의 귀속 (최소판)
- **무엇**: 인바운드 DM 리드를 만들 때 "어느 글을 보고 왔나"를 `leads.meta.content_ref`(Threads 글 URL 또는 content_item id) 한 칸에 적는다. `meta.source_ref`는 이미 시트 행 참조 키라 이름을 나눈다. 주간 리뷰에서 `글 → 문의 → 유효 → 결제`를 센다.
- **왜**: 성장 계획 §9 P1 "조회수보다 문의/유효/결제 기준으로 판단". 지금은 최고 성과 콘텐츠(30 → 6 → 3)를 기억으로 안다.
- **어떻게**: 새 화면 없음. 리드 생성 드로어와 Quick Capture `customer` 힌트에 URL 붙여넣기 칸 하나.
- **일부러 안 하는 것**: 글마다 가설(`앵글 × 반론 × 포맷`)을 붙이는 실험 원장은 **보류**. 2차 의견(§11)이 맞다: 월 20~40개 글, 리드의 5%, 운영자가 "복잡한 성과 분석은 후순위"로 확정한 항목이라 n이 신호를 못 만든다. `content_ref`가 월 30건 이상 쌓이면 그때 가설 태그를 올린다.
- **게이트**: 없음. F-3과 함께.

### B-2 반론 → 아이디어 브릿지
- **무엇**: 컨택 결과 시트(요약·반응·다음 행동)에 `고객 질문/반론` 칩을 추가. 선택하면 `content_items(status idea, brand classmoon, source_type meeting, meta.angle)`가 자동 생성된다.
- **왜**: 콘텐츠 병목은 소재·꾸준함(`sales-os-direction.md` §4). 상위 반론("Zoom이랑 뭐가 달라", "전자칠판 있는데 왜")이 곧 큐 신호(§5). 지금은 운영자 머릿속에서만 이어진다.
- **어떻게**: `record_contact_outcome_v1` payload에 `objection_tags[]` → 트리거 또는 Hub BFF에서 idea insert. 콘텐츠 페르소나(`02-content.md`)가 이미 "반론 깨는 1장 자료"를 생산하도록 설계돼 있다.
- **게이트**: F-2(정본 화면) 뒤.

### B-3 증거 원장 (Proof Ledger)
- **무엇**: `won` 딜과 긍정 `고객 반응`, 방문·데모에서 찍은 실사용 장면을 "증거 후보"로 모은다. 후기·사례·레퍼런스 영상 소재의 단일 출처.
- **왜**: 최고 성과 콘텐츠가 "실사용 레퍼런스 영상 3~5초"인데 소재 창고가 없다. 오길비의 "증언이 가장 강한 설득", 밀러의 "가이드의 권위"가 여기서 나온다. 세일즈 자료 제작(프로필 §4 "소개 자료·리드 마그넷·PDF")의 재료이기도 하다.
- **어떻게**: `notes(brand_id)` + `meta.kind='proof'` + `meta.consent(수집 전 고객 동의 여부)`. Customer 360과 브랜드 탭 기록 탭에서 같이 보인다. 개인정보는 동의 없이는 후보에만 두고 발행 큐로 안 넘긴다.
- **게이트**: F-10.

### B-4 브랜드 역할과 포지셔닝 한 줄
- **무엇**: 브랜드마다 `meta.role`(`revenue` · `audience` · `identity` · `hub`)과 `meta.positioning`(한 문장), 매출 브랜드에는 BrandScript-lite 5칸(영웅 · 문제 · 가이드 · 계획 · CTA).
- **왜**: 9+1 브랜드를 같은 리듬으로 재면 저빈도 고품질(시나브로)과 고빈도 확산(HolyFunCollector)이 서로를 오염시킨다. 역할이 있어야 KPI가 다르다: 매출 → 문의 수, 오디언스 → 공유·답글, 정체성 → 리듬 유지·프로젝트 마일스톤(시집 출간).
- **권장 초기 분류(운영자 확정 필요)**: `revenue` = classmoon, moonpm(개인 자문) · `audience` = studyseagull, holyfuncollector · `identity` = sinabro, gore, bridgemaker, politicofficer · `hub` = 22nomad. 이 분류는 **권장**이며 운영자가 10분 안에 바꿀 수 있어야 한다.
- **이것은 빌드 항목이 아니라 결정 항목이다.** 역할·포지셔닝 한 줄은 이번 주 문서(`brands.meta` 시드 또는 이 문서 §12 답변)에서 끝낸다. 화면 필드는 어차피 예정된 P2(정체성 편집)에 4필드로 얹히면 된다. 일정에 따로 올리지 않는다.
- **어떻게(P2 때)**: 브랜드 탭 정체성 탭에 4필드. `brand-context.js`가 포지셔닝을 AI 프롬프트에 주입. 가드레일은 힌트만, 차단 없음(브랜드 탭 스펙 §8).
- **게이트**: 결정은 즉시. 화면은 F-4·F-5.

### B-5 "오늘 연락할 리드" = 유입 SLA 보드 (첫 번째 빌드)
- **무엇**: 소스별(설명회 신청 › Threads 관심 › Meta 신규 › 기존 고객 리스크) 대기 리드, 도착 후 경과, 첫 접촉까지 시간, 소스별 `유입 → 24h 내 접촉 → 미팅 수락 → 결제`. 기존 고객 연락 화면을 확장하는 것이지 새 화면이 아니다(F-3a).
- **왜**: 성장 계획 §9 **P0**. "10분 안에 첫 접촉"(§3 `lead`)을 시스템이 재야 한다. 리드 95%의 통로에 계기가 없다. 그리고 이것이 Google Sheet를 대체하는 유일한 화면이라 **매일 열린다**(W1을 푸는 가장 짧은 길, §11).
- **정렬 규칙(하나만)**: 1순위 구매 신호(설명회 신청·데모 요청) → 2순위 미접촉(도착 후 경과 긴 순, 24h 초과만 danger 레일: DESIGN §5.2 "즉시 손실") → 3순위 오늘 due. 같은 순위 안에서만 소스 우선순위(설명회 › Threads › Meta › 기존 고객)로 가른다. N2와 F-3a는 이 규칙을 참조한다.
- **어떻게**: F-1 + F-3 + F-3a. 새 테이블 없음.
- **게이트**: 없음. 0~30일의 첫 빌드. 결과 기록 버튼은 F-2가 운영자 결정으로 확정될 때까지 기존 경로를 쓴다. §13 과제 1은 이 빌드의 게이트가 아니라 SLA 부분의 비중을 정하는 보정이다.

### B-6 설명회 퍼널 + 허락 자산 1개
- **무엇**: 행사 참석자 붙여넣기 → 전화번호·기관·이름 매칭 → 미매칭은 검토 → 참석을 활동으로 누적 → 반복 참석 = 집중 신호(프로필 §10 권장 그대로). 그리고 허락 자산을 **하나만** 정한다: 설명회 참석자 리스트 또는 카카오톡 채널 또는 Threads 팔로워 중 하나, 매달 크기를 센다.
- **왜**: 성장 계획 §9 P2. 고딘의 허락 마케팅. 지금은 "기대되는 메시지"를 보낼 명단 자체가 없다.
- **어떻게**: `crm_activities.kind='info_session'`(이미 check 제약에 있다) 재사용 + `lead_intake_raw` source check에 `event` 추가(`0009`/`0015` 패턴 마이그레이션 1건). 새 테이블은 `events`(이름·일자·유형) 하나면 충분하다.
- **게이트**: B-5 뒤. 발송은 여전히 사람.

### B-7 주간 성장 리뷰 (Weekly Growth Review)
- **무엇**: 매주 한 화면: 소스별 문의 · 콘텐츠별 문의(B-1) · 브랜드별 발행/목표 · 딜 이동/정체 · 증거 수집 수 · 이번 주 실험 결과. AI가 초안(Guru 주간 회고, 성장 계획 P2)을 쓰고 운영자가 **결정 1개 + 다음 주 베팅 3개**를 `decisions`에 남긴다.
- **왜**: 세 엔진을 잇는 유일한 사람 의식. `brand-efficiency-operating-model.md`(2026-05)가 제안했던 "주 5개 결정"의 현실판. 리뷰 없이는 실험 원장이 표로 끝난다.
- **어떻게**: Phase 1은 `work/decisions`에 템플릿 결정(`meta.kind='weekly_growth_review'`; `decisions`에 `kind` 컬럼은 없고 `meta`가 있다)으로 시작(코드 0). Phase 2에서 `growth-ledger.js` read model이 표를 채우고, 화면은 기존 현황(`dashboard/overview`) 페이지의 주간 섹션으로 마운트한다. 새 라우트 없음. 이 화면이 §6 N6이다.
- **게이트**: 없음. 이번 주부터 손으로.

### B-8 브랜드 편집장 AI (Brand Editor)
- **무엇**: content-flywheel 크론을 확장한다. 브랜드 정체성 + 실험 원장(B-1) + 증거 원장(B-3)을 읽고 브랜드별 다음 주 계획(글 3개, 각 가설 포함)을 `work_orders(proposed)`로 낸다. 발행은 사람.
- **왜**: 승인된 Advisory → Autonomous 3-lane 중 Content Flywheel lane의 다음 단계. "AI가 보는 것 = 내가 보는 것"이 데이터로 성립하는 첫 순간.
- **게이트**: N0(1B·1C 완료 — README는 Council·Guru 확장을 그 뒤로 둔다) + B-1 4주치 데이터 + B-4. 그 전에는 추측을 더 그럴듯하게 만들 뿐이다.

### B-9 개인 오퍼 한 줄 (미정, 시스템은 자리만)
- **무엇**: 개인 lane이 파는 것(코칭 · 자문 · 툴킷)을 한 문장으로. 시스템은 `deals.meta.offer_key`와 브랜드 `revenue` 역할로 자리만 둔다.
- **왜**: 현금흐름 로드맵은 있는데 오퍼 정의가 없다. 브랜딩의 절반은 "무엇을 위한 것인가"다.
- **게이트**: 운영자 답변(§12). 인터뷰 재개 전에는 만들지 않는다. 개인 lane의 세일즈·마케팅 항목이 이 문서에 없는 것은 의도적 공백이다.

### B-10 공개 증명 엔진 (Phase 4, 기록만)
22nomad·moonpm으로 결정 로그와 운영 에세이를 공개하는 것. `master-roadmap.md` Phase 4 게이트(30일 sticky) 그대로. 이 문서는 순서를 바꾸지 않는다.

---

## 9. 전제와 접근안

### 9.1 전제 (동의가 필요한 다섯 문장)

1. **브랜딩은 산출이고 세 엔진은 입력이다.** 루프가 닫히면 브랜드가 문의 획득 비용을 낮춘다. 브랜딩을 "콘텐츠의 하위"로 두는 순간 다시 필터가 된다(8/29 결정과 일치).
2. **운영자가 통제하는 레버는 "리드에 닿는 속도·횟수"와 "브랜드가 만드는 문의"다.** 문의 총량의 95%는 회사 Meta 예산이 정한다. 그래서 첫 계측은 문의 생성이 아니라 **도착 → 첫 접촉**이고, 두 번째가 브랜드 유래 문의의 귀속이다. (초안은 "병목은 문의 수"였으나 §11 2차 의견으로 수정. 증명 실험은 §13.)
3. **단일 운영자·승인 게이트 유지.** 발송·발행·CRM push·결제는 사람. 이 문서의 어떤 베팅도 하드 게이트(ClassIn 동기화·음성 AI·직접 발행)를 다시 열지 않는다.
4. **브랜드 포트폴리오는 역할 분리가 먼저다.** 역할 없이 기능을 더하면 9개 브랜드가 서로의 리듬을 망친다.
5. **새 만능 테이블 없음.** 심화 설계 전제 3 그대로. 다리는 meta 필드와 read model로 놓는다. 예외는 `events` 하나(B-6).

### 9.2 접근안

**A · 최소 계측 (리드 필드 4 + 화면 확장 1 + 다리 3 + 크론 수리)**
- 범위: F-0·F-1·F-3·F-3a·F-4·F-10, N3의 다리 3개, `growth-ledger.js`(주간 리뷰용 read model). F-2는 운영자 결정 뒤.
- 크기 S~M · 위험 낮음 · 완성도 6/10.
- 장점: 새 테이블 0, 1B·1C와 충돌 없음(오히려 1C 정본 화면 결정을 강제), 2주 안에 소스별 표가 채워지기 시작, 매일 열리는 화면이 생김.
- 단점: 콘텐츠 성과는 DM 귀속 수기. 설명회·캠페인은 그대로 비어 있음.
- 재사용: `leads.meta`, `followups.jsx`, `record_contact_outcome_v1`, `notes`, `decisions`, `brands.meta`.

**B · 성장 스파인 (Growth Spine)**
- 범위: `growth_events`(source·campaign·content·brand·lead·deal·revenue 차원) 테이블 + 캠페인 워룸 7탭 실데이터 + 설명회 퍼널 + 브랜드 편집장 + IG/Threads/YouTube 성과 수집.
- 크기 L~XL · 위험 중~높음 · 완성도 9/10(완성 시).
- 장점: 세 엔진이 한 원장에서 만난다. 브랜드 편집장이 진짜 데이터로 일한다.
- 단점: 1B·1C가 부분 작동인 상태에서 또 하나의 큰 스파인. 직접 발행 하드 게이트, 그리고 브랜드 탭 스펙이 1B·1C 뒤로 둔 성과 API 수집과 닿는다. 데이터 기아 상태에서 만들면 빈 워룸이 하나 더 생긴다.
- 재사용: A의 전부 + 캠페인 페이지 셸 + OAuth 라우트.

**C · 의식 우선 (Ritual-first)**
- 범위: 코드 0. 이번 주부터 주간 성장 리뷰를 `decisions`에 손으로 쓴다. 지난 30일 글 10개의 `글 → 문의 → 유효 → 결제` 표를 수기로 채운다. 브랜드 역할을 종이에 먼저 정한다.
- 크기 S · 위험 낮음 · 완성도 3/10.
- 장점: 어떤 계측이 실제로 읽히는지 4주 안에 드러난다. 세일즈 데일리 루프 플레이북의 "졸업" 원칙(측정 성과를 낸 플레이만 코드로)과 같다.
- 단점: 규율에 의존. 수기 표는 2주 뒤 멈추기 쉽다.

### 9.3 권장: **C로 시작해 A의 첫 조각을 2주 안에 깔고, B는 조각별로 졸업**

이유: 시스템의 최상위 약점은 기능 부족이 아니라 사용 부재(W1)다. 의식(C)이 없으면 A의 필드도 빈 채로 남고, B는 빈 워룸을 하나 더 만든다. A의 첫 조각(F-0·F-1·F-3·F-3a)은 C가 손으로 하던 일을 2주 뒤 시스템이 이어받게 하는 최소 배관이고, 나머지(N3·`growth-ledger.js`·F-10)는 31~60일에 온다. B의 조각(B-5 → B-6 → F-9 → B-8 → 성과 API)은 각각 "지난 4주 리뷰에서 이 숫자가 결정을 바꿨다"는 증거가 생길 때만 착수한다.

---

## 10. 실행 순서 (30 · 60 · 90)

전부 N0(1B·1C 마감)과 병렬 가능하되, N0가 먼저 끝나야 하는 항목은 표시했다.

| 기간 | 할 일 | 종류 |
|---|---|---|
| **0~30일** | §13 증명 실험(최근 90일 시트 리드의 도착 → 첫 접촉 시간·접촉 횟수) + 글 10개 수기 표 | 의식(30분 + 30분) |
| | 브랜드 역할·포지셔닝 한 줄 결정(B-4, 코드 0) · B-7 주간 성장 리뷰를 `decisions`에 손으로 시작 | 결정·의식 |
| | **첫 빌드 = B-5**: F-3 계측(`first_touch_at` 파생, 비시트 `source` 통일) → F-3a 고객 연락 화면 확장 → F-1 IntakeInbox 라우팅. F-2(정본 화면)는 운영자 확정 요청만(§12 Q7, N0 항목) | M |
| | F-0 초안 크론 수리 · F-4 D6 수정 · F-11 README · F-15 읽기 인증 확인 | S |
| **31~60일** | N3 다리 3개 필드 + `growth-ledger.js` + B-7 화면(Phase 2) | M |
| | B-1 최소판(`source_ref` 입력 칸) · B-2 반론 브릿지(F-2 뒤) | S·M |
| | F-5 브랜드 정체성 편집·주간 목표(P2) · B-4 역할·포지셔닝 4필드 | M |
| | F-7 Threads/Shorts 1급 variant · F-6 아이디어 입력 단일화 | M |
| **61~90일** | F-12 Next Action 넛지 · F-8 byBrand 실계산 · F-16 dead 테이블 결정 | M |
| | B-3 증거 원장(F-10) · B-6 설명회 퍼널 + 허락 자산 1개 | M·L |
| | F-9 캠페인 Pulse·Attribution 2탭 · B-8 브랜드 편집장(N0 + 4주 데이터 뒤) | M·L |
| | IG/Threads 성과 수집(P5)은 1B·1C 완료 + 게이트 재확인 뒤 | L |

### KPI (문서에 이미 있는 숫자만, 신규 2개)

| 엔진 | 지표 | 기준 → 목표 | 출처 |
|---|---|---|---|
| 세일즈 | 누락된 고객 연락·후속 | → 0건 | 프로필 §2 |
| 세일즈 | 열린 딜 다음 행동 커버리지 | → 90%+ | nudge layer §7 |
| 세일즈 | 월 계약 · 월 매출 | 6건/100k CNY → Gate 1 300k CNY | 성장 계획 §2 |
| 마케팅 | 월 문의 수, 소스별 유효리드율 | 측정 시작. 목표는 §13 과제 1 결과로 정한다(유효율 20%면 60건에 문의 600, 40%면 300) | 성장 계획 §2 |
| 마케팅 | 첫 접촉 SLA | 측정 시작 → 10분(설명회·Threads) | 성장 계획 §3 |
| 콘텐츠 | Threads 발행 | 하루 1개 기본 | 프로필 §12 |
| 마케팅 | **24h 내 첫 접촉률**(신규) | 시트 리드 중 도착 24h 안에 첫 컨택 결과가 있는 비율 → 측정 후 목표 | 이 문서 B-5, §11 |
| 콘텐츠 | **문의의 콘텐츠 귀속률**(신규) | 인바운드 DM 리드 중 `content_ref` 있는 비율 → 80% | 이 문서 B-1 |
| 브랜딩 | 브랜드별 주간 목표 달성률 | 역할별로 다른 목표, 8주 스파크라인 | 브랜드 탭 §6 |
| 브랜딩 | 증거 후보 수(동의 포함) | 측정 시작 | 이 문서 B-3 |
| 루프 | 주간 성장 리뷰 결정 기록 | 주 1건 + 베팅 3개 | 이 문서 B-7 |

---

## 11. 2차 의견 (독립 콜드 리드)

이 대화를 보지 않은 별도 에이전트에게 §1~§2의 사실과 초안 전제·권장만 주고 네 가지를 물었다. 원문 요지는 다음과 같다.

> **스틸맨.** 그가 만들려는 것은 CRM이 아니라 "영업 현장을 한 번 기록하면 그 기록이 콘텐츠 원료, 마케팅 소재, 브랜드 증거로 세 번 재사용되는 단일 원장"이다. 이미 발견한 루프가 증거다: 실사용 레퍼런스 영상 1개 → 문의 30 → 유효 6 → 결제 3, 그리고 결제 3건은 다시 레퍼런스 영상 3개의 원료가 된다. Gate 2(60건)는 "10배 더 열심히"가 아니라 "유통 중인 증거 자산 10배"다. ClassIn은 원료를 공급하는 실험실, classmoon은 그 증거가 본인 이름으로 쌓이는 계좌, 코칭·자문은 그 브랜드의 첫 독립 수익화다. 단, 9개 브랜드 중 classmoon·moonpm만 엔진이고 나머지는 정체성·취미라는 것을 인정해야 성립한다.
>
> **가장 많은 것을 드러내는 사실.** "2026-07-29 기준 매일 쓰지 않는다." 성공 기준 둘 다 매일 써야만 측정되는 행동 지표인데, 1B·1C가 6주 넘게 부분 작동인 채 브랜드 탭(8/29)과 현금흐름 로드맵(8/31)이 먼저 나왔다. 빌드가 루프 닫기보다 신규성으로 흐르는 패턴이다. 다음에 만들 것은 의지가 아니라 필요에 의해 매일 열리는 화면, 즉 Google Sheet를 대체하는 리드 작업면 하나다. "Sheet 리드 도착 → 접촉 → 결과 기록" 경로 밖의 모든 기능은 보류가 맞다.
>
> **틀린 전제: (2) "병목은 문의 수·질이지 전환이 아니다".** 문의의 95%는 회사 마케팅팀 Meta 예산이 결정하므로 그가 통제하는 변수가 아니고, 10% 전환은 최고 성과 Threads 콘텐츠 기준이지 Sheet 리드 기준선이 아니다. 퍼널의 가장 큰 손실(문의 → 유효 20%)은 "나쁜 리드"와 "제때 못 닿은 리드"를 섞어 세고 있을 가능성이 높다. 유효리드율을 20 → 40%로 올리면 필요 문의 수가 절반이 되므로 후속 품질의 레버리지가 문의 생성보다 크다. 증명: 최근 90일 Sheet 리드의 도착 → 첫 접촉 시간과 접촉 횟수 분포. 중앙값 첫 접촉이 24시간 초과거나 접촉 1회 이하 리드가 30%를 넘거나 Sheet 리드 결제율이 5% 미만이면, 문의 생성 도구보다 리드 SLA 인박스가 우선이다.
>
> **48시간 프로토타입.** 새 테이블 없이 `leads`에 4개 필드(`source_channel · source_ref · arrived_at · first_touch_at`). Sheet intake 매퍼가 앞 셋을 채우고, 고객 연락 인라인 폼을 `record_contact_outcome_v1`로 갈아끼워 비원자 경로를 삭제한다(1C의 정본 화면 미정을 프로토타입에서 그냥 결정). 화면은 하나, "오늘 연락할 리드": 구매 신호 → 미접촉(경과 분, 24h 초과만 danger) → 오늘 due. 상단 스트립에 소스별 유입 / 24h 내 접촉률 / 미팅 수락 / 결제. 건너뛰는 것: 콘텐츠 어트리뷰션, 캠페인, 브랜드 역할, AI 초안, 캘린더, 행사 퍼널. **자를 것**: `publish_logs` 기반 콘텐츠 실험 원장. 월 20~40개 글, 리드의 5%, 운영자가 "복잡한 성과 분석은 후순위"라고 확정한 항목이라 n이 신호를 못 만든다. 리드의 `source_ref` 한 칸이 필요한 어트리뷰션을 다 잡는다. 브랜드 역할은 30분짜리 문서 결정이니 일정에 올리지 말고 문서에서 끝내라.

### 11.1 반영

| 지적 | 판단 | 반영 |
|---|---|---|
| 전제 2(병목 = 문의 수)가 틀렸다 | **동의.** 95%가 그의 변수가 아니라는 점, 20% 유효율에 "늦게 닿은 리드"가 섞였을 가능성은 문서에서 확인되지 않은 채 초안이 넘어갔다 | §9.1 전제 2 수정. §13에 증명 실험 추가 |
| 첫 빌드는 Sheet를 대체하는 리드 작업면 하나 | **동의.** W1(중력 부재)을 푸는 가장 짧은 길이 "매일 열릴 수밖에 없는 화면"이라는 논리가 초안의 "의식(C)"보다 강하다. 다만 1C 정본 화면을 "프로토타입에서 그냥 결정"하자는 부분은 채택하지 않는다 — README §3이 운영자 확인 미정으로 둔 결정이라 §12 Q7로 돌린다 | B-5를 0~30일 첫 빌드로 승격, N2 재정의, F-3·F-3a 추가. 제안된 4필드 중 시트 리드의 소스·캠페인·도착 시각은 이미 있어 실제 신규는 `first_touch_at` 파생 하나 |
| 콘텐츠 실험 원장을 잘라라 | **대체로 동의.** n이 작다. 다만 `source_ref` 한 칸은 남긴다(그가 통제하는 유일한 문의 소스가 브랜드이므로) | B-1을 최소판으로 축소, 가설 태그는 월 30건 뒤로 |
| 브랜드 역할은 빌드가 아니라 결정 | **동의.** | B-4를 결정 항목으로 재표기, 화면은 기존 P2에 얹음 |
| 스틸맨 "한 번 기록 → 세 번 재사용" | **동의, 그리고 이것이 §1 프레임의 더 정확한 표현이다.** 인지 에너지 1/3 목표와 세 엔진이 충돌하지 않는 유일한 구조 | §1 프레임 그대로 유지, §14에 반영 |
| classmoon·moonpm만 엔진 | **부분 동의.** 매출 엔진은 둘이 맞다. 다만 studyseagull·holyfuncollector는 "오디언스" 역할로 남긴다(확산 실험은 그 자체가 브랜드 학습) | B-4 분류 유지, 운영자 확정 대기 |

---

## 12. 열린 질문 (운영자 답변 전까지 미정, 인터뷰 재개 시 Q121~ 후보)

1. 개인 lane이 파는 것은 무엇인가(코칭 · 자문 · 툴킷 · 출판)? 12개월 뒤 개인 매출 목표는?
2. §8 B-4의 브랜드 역할 초기 분류(매출 2 · 오디언스 2 · 정체성 4 · 허브 1)는 맞는가? 정체성 브랜드에도 리듬 목표를 둘 것인가, 프로젝트 마일스톤(시집 출간 등)만 둘 것인가?
3. 12개월 뒤 "브랜딩이 됐다"는 것을 무엇으로 확인할 것인가(문의 중 브랜드 유래 비율 · 팔로워 · 설명회 참석 · 후기 수)?
4. 허락 자산으로 무엇을 택할 것인가: 설명회 참석자 리스트 · 카카오톡 채널 · Threads 팔로워?
5. 성장 계획 §8 Q1: 월 60건과 월 300,000 CNY 중 상위 기준은?
6. Q116~Q120(콘텐츠 입력·상태·파생·발행) — 기존 큐 그대로. B-1·F-6·F-7이 이 답에 의존한다.
7. 컨택 결과 정본 화면은 어느 쪽인가: 고객 연락(Followups) 인라인 폼 vs 고객 DB 컨택 시트? (README §3, 2026-07-29 미정.) F-2·B-5의 결과 기록 버튼이 이 답에 의존한다.

---

## 13. 이번 주 과제 (The Assignment)

**1. 증명 실험(30분, 전제 2를 확정한다).** 최근 90일 마케팅팀 Google Sheet 리드를 놓고 세 숫자를 손으로 뽑는다: 도착 → 첫 접촉 시간의 중앙값, 접촉 1회 이하로 끝난 리드 비율, Sheet 리드의 결제율. 시트의 행 시각과 Outreach Log(또는 `outreach_outcomes.occurred_at`)만 있으면 된다. 중앙값이 24시간을 넘거나, 1회 이하가 30%를 넘거나, 결제율이 5% 미만이면 B-5의 SLA 부분(경과·24h 레일·소스별 접촉률)에 무게를 싣는다. 셋 다 아니면 B-5는 "오늘 연락할 리드" 최소 화면으로만 두고, 31~60일의 B-1·브랜드 유래 문의를 앞당긴다. 이 실험은 B-5의 게이트가 아니라 비중 보정이다.

**2. 글 10개 표(30분, B-1의 씨앗).** 지난 30일 Threads·Instagram 글 10개에 대해 `문의 수 · 유효리드 · 결제`를 적는다. DM을 거슬러 "이 글 보고 연락했다"를 세면 된다. 같은 자리에서 9개 브랜드에 역할 한 단어씩(매출/오디언스/정체성/허브)을 적으면 B-4의 결정도 끝난다.

(`sales-os-direction.md` §9의 과제 "반응 좋았던 글 3 + 안 좋았던 글 2 공유"가 아직 문서에 결과로 남아 있지 않다. 과제 2가 그것을 대체한다.)

---

## 14. 내가 본 것

- 운영자는 브랜드를 "콘텐츠가 되는 게 이상하다"고 했고(8/29), 그 말이 정확했다. 이 문서의 프레임은 그 지적을 세 엔진 전체로 확장한 것이다: 브랜드는 콘텐츠의 태그가 아니라 세 엔진이 쌓이는 곳이다.
- "10배 속도는 내가 10배 더 열심히 연락한다가 아니다"(성장 계획 §5). 2차 의견이 이걸 한 번 더 밀었다: 10배 계약은 "유통 중인 증거 자산 10배"다. 한 번의 영업 기록이 콘텐츠 원료·마케팅 소재·브랜드 증거로 세 번 쓰이는 구조만이 인지 에너지 1/3과 세 엔진을 동시에 만족시킨다. 그래서 첫 베팅이 편집기가 아니라 리드 한 줄의 필드 넷이다.
- 브랜드 탭(8/29)과 현금흐름 로드맵(8/31)이 1B·1C보다 먼저 나왔다. 둘 다 좋은 화면이지만, 매일 열리는 화면은 아직 없다. 이 문서가 새 최상위 탭을 하나도 제안하지 않은 이유다.
- 문서 규율(확정/권장/미정)이 이 기획을 가능하게 했다. 이 문서도 같은 규율을 따랐고, 새로 제안한 것은 전부 권장이다.
