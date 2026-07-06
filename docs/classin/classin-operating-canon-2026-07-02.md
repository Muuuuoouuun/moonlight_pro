# Classin 운영 캐논 — 세일즈/마케팅/콘텐츠 자동화 소스 오브 트루스

> **생성일: 2026-07-02**
> **이 문서는 자동화 소스 오브 트루스다.** 세일즈 자동화·마케팅 자동화·콘텐츠 자동화 에이전트/시스템이 참조할 '사실과 규범의 단일 소스'다. 서술적(descriptive)이며 실행 가능하게 쓴다. 처방(전략 제안)은 넣지 않고 **사실·구조·규칙만** 기록한다. **사실이 바뀌면 이 문서가 갱신 대상이다.** 수치·값은 각 SSOT(`lib/classin-positioning.ts`, company-facts, `lib/docs.ts`, `data/lead-magnets.json` 등)가 정본이고, 이 문서는 그것을 요약·연결한다.

---

## 1. Classin 한 줄 정의 & 무엇을 파는가

**한 줄 정의:** Classin은 "전자칠판 한 대"가 아니라 **한 학원의 수업이 돌아가는 방식 자체를 하나로 묶는 '수업 시스템 OS'**다. 한국 1차 카테고리명은 **"수업 시스템 OS"**로 확정("학원 시스템 OS" 폐기), 글로벌 표현 "올인원 하이브리드 학습 플랫폼"은 보조 설명어로만 쓴다.

**코어 명제(코퍼스 22회 반복):** *"좋은 수업이 에이스 강사 개인기에 의존하면 안 된다 → 시스템으로 표준화."* 모든 표면은 이 명제로 수렴한다.

**한 문장 기준 정의:** *"Classin은 전자칠판, 수업 녹화, EDB 교안, LMS, 학생 관리, 관리자 데이터를 한 흐름으로 묶는 수업 시스템 OS입니다."* 기능 나열이 아니라 **"수업 전 준비 → 실시간 판서 → 녹화 → 복습 → 과제·시험 → 관리자 데이터"** 운영 흐름으로 설명하는 것이 홈/제품/블로그/가이드/챗봇/상담 전 표면의 규칙이다.

### 회사 사실 (EEO 공식 미러 — 임의 하향 금지)

| 항목 | 값 | 주의 |
|------|-----|------|
| 법인명 | EEO = **Empower Education Online**(翼鸥教育 / Beijing EEO Education Technology) | "Education Everywhere Online" 아님 |
| 설립 | 2014 | |
| 창업자/CEO | Song Junbo(宋军波) | 덱의 "Robert Huang"은 오류 |
| CTO | He Qian(贺骞) | |
| 한국 법인 | 이이오클래스인코리아(EEO Classin Korea), 2022-10 설립, 서울 목동 | 본사 주소 = 양천구 목동동로 233-1 806호(강남구는 오류) |
| 투자/밸류 | 시리즈 D 유니콘, 누적 $500M+(≈2021, classin.com/careers) | 외부 DB의 2020 시리즈 C $265M은 내부 참고용 맥락. **$30B/30조원 밸류는 거짓 — 절대 금지** |
| 스케일 | 교육자·학습자 5,000만+, 서비스 160+개국, 교육기관 6만+, 월간 수업 3,000만+ 세션, 누적 2억+ 세션 | classin.com 공식 |
| 미확정(과장 주의) | "12개 언어"(공식 사이트 5개 노출), "8만+ 글로벌 파트너", "15,000 공교육" | "EEO 공식 소개 기준" 출처 캡션 붙여서만 |
| 파트너(공개 확인) | New Oriental, TAL, Pearson, Sony Global Education, British Council, Peking Univ, NTU/NUS, Cornell, Waseda | Google·Microsoft·Canvas·Moodle 파트너십은 미확인 |

**표시광고법 안전장치(2026-06-29):** 회사 수치엔 "전 세계 누적·EEO 공식 소개 기준" 캡션 부착. 국내 도입 기관·보드 수는 단정 금지 → 상담 확인.

### 제품 라인

**5제품군(EEO):** ClassIn · ClassIn X(HW = Classin Board) · NOBOOK(가상실험) · TeacherIn(코스웨어, 2023-11) · FlowIn. 글로벌 위상으로 노출 유지하되 **한국 실판매 = 전자칠판 + SW(구독/충전)**.

**하드웨어(Classin Board):** 한국 시장 5개 모델 — **S65 / S75 / S86 / S98 Pro / S110**. 세대: 2.0 = S65/S75/S86/S110, 3.0 = S65/S75/S86/S98 Pro.

| 차별점 | 내용 |
|--------|------|
| OPS PC 내장 | 외장 PC·HDMI·터치 케이블 불필요 |
| OS 표기 | 챗봇/문서에서 `내장 OPS(Windows OS)`로 표기(내장 시스템은 Android 11이나 OPS 내장이 핵심 강점) |
| 기타 | 무선 미러링, 클라우드 연결. iF Design Award = ClassIn Board MAX110 |
| 주변기기 | ClassIn Cam T1(교사 추적)·S1(학생 정위) 카메라, ClassIn Mic DT2 Pro(MS21A) 천장 마이크(32개 어레이, 수음 5~8m) |

치수 SSOT는 `app/product/hw/page.tsx` 스펙표: BS110A/BS86A/BS75A/BS65A = 110/86/75/65인치, 베젤 22mm.

**소프트웨어(콘텐츠 무게중심 순):** ① 녹화·복습 흐름(단일 최다 언급) ② 실시간 수업 운영 ③ EDB 교안(살아있는 칠판 파일, 최대 50p) ④ 하드웨어+OPS ⑤ 관리자 콘솔·권한 데이터 ⑥ LMS 활동 9종(수업/숙제/시험/녹화수업/학습자료/일일과제/토론/OMR/SCORM + AI 따라읽기·받아쓰기·외워말하기) ⑦ 30+ 교실 도구(타이머·랜덤 선택·개인칠판·퀴즈·그룹토론·STEM 가상실험) ⑧ AI 보조(채점·출제·튜터 — 항상 "보조"로 hedge).

**진짜 도입 레버(백엔드):** EDB 교안 + 50p 칠판 + OPS + **녹화→LMS→상담 데이터 연속성의 "끊김 없음"**. EDB가 진짜 레버이지 하드웨어가 아니다.

---

## 2. 고객 원장 프로파일 — 세그먼트, 통증/니즈/불안, 도입 전 질문·반론 매트릭스

### 타깃 세그먼트

**1순위:** 한국 학원 원장·관리자·실장·캠퍼스 운영 책임자·교육기관 의사결정자.

| 페르소나 | 관심사 | 행동 |
|----------|--------|------|
| A 학원 원장 | 재등록률·강사 관리·학부모 만족도 | 제품 소개 확인 후 문의 제출 |
| B 운영 책임자(다지점) | 지점 표준화·데이터 통합·리포트 자동화 | 제품/요금 비교 후 데모 요청 |
| C 마케팅 담당자 | 캠페인 유입 성과·CTA 효율·전환 정확도 | |

1차 사용자엔 다지점 운영 책임자·교육 사업 본부장·학부모 커뮤니케이션 담당자 포함, 2차는 마케팅/영업·CS/내부 운영팀.

### 원장의 통증·니즈·불안

- 수업 준비·녹화 배포·보강 안내·과제 관리가 여러 도구에 흩어짐("학생 한 명 보려면 도구 다섯 개").
- 전자칠판은 있지만 녹화·자료 재사용·학생 관리·LMS와 이어지지 않음.
- 구형 전자칠판은 외장 PC·HDMI·터치 케이블·별도 녹화 프로그램·라이선스 만료로 운영 손이 계속 감.
- "Zoom이랑 뭐가 달라요?", "기존 전자칠판이랑 뭐가 달라요?"라 물음(제품 인지 낮음).
- 가격이 일반 전자칠판보다 높게 느껴짐.
- 좋은 수업이 강사 개인기·개인 자료에 의존("에이스가 나가면 그 반은").
- 수업 품질·특이사항·네트워크 문제·녹화/복습 제공 상태를 늦게 인지.

**실제 원장 문의 톤(챗봇 세션 수집):** "전원 나가면 판서하던 거 다 날아가요?", "전자칠판에 분필 써도 돼요?", "에듀테크 바우처·정부지원금으로 살 수 있어요?", "교육청 입찰 견적서 양식 맞춰줘요?", "리스로 쓰다 학원 망하면 반납?" — 한국 학원 특화 우려(정부지원·환불·폐업·프라이버시)가 반복.

### 도입 전 objection·질문 매트릭스 (22문항)

현장 선생님의 22개 질문을 **기능 설명표가 아니라 도입 전 리스크 체크리스트**로 다룬다. 답변 4레벨: **즉답 / 조건부 / 확인 필요 / 쇼룸 검증**.

| 레벨 | 항목(번호) |
|------|-----------|
| 즉답 가능 | LMS 웹 콘솔(1), 리포트 다운로드(2), 온보딩 교육 순서(7), 녹화 저장·권한(10), 마이크(14), 과제/LMS 활동(15), 앱 회원가입(16), 가입 개인정보=전화번호 또는 이메일(17), OPS 내장·외부 PC(20), 오프라인 칠판 필기(22) |
| 확인 필요(단정 금지) | 무료/유료 관리자 권한(3,5), 유료 전환·사용 기간(4,6), 정기결제 포함 항목(8), 콘텐츠 소유권(11), 스토리지 용량·단가(13, 메모상 30GB/500GB로 보이나 최신성 확인), 개인정보 처리(18), 서버 위치(19, 메모 "중국"처럼 보이나 단정 금지), 펜 팁 가격(21) |

**규칙:** "가능"이라 답할 때도 **"누가 볼 수 있는가"(관리자/권한 교사/학생)**를 반드시 붙인다. 개인정보·마케팅 추적·학생 학습 데이터는 절대 섞지 않는다. 상세 SSOT = `pre-adoption-faq-22-questions` DocArticle + `classin-pre-adoption-question-matrix-2026-06-18.md`.

**대표 반론 3종:** "Zoom이랑 뭐가 달라요?" / "전자칠판 있는데 왜 또 바꿔요?" / "가격이 비싼 이유가 뭔가요?" — 기능표 아닌 운영흐름·운영비·리소스 관점으로 답.

---

## 3. 소구 포인트(Value Props) — 제품별·세그먼트별, 경쟁 포지셔닝

### 4대 가치 기둥

모든 콘텐츠는 최소 하나에 연결한다.

1. **강사 리소스 절감**
2. **수업 품질 표준화**
3. **학생 경험 확장**
4. **관리자 운영 가시성**("감이 아니라 기준으로 운영을 보는 장치")

### 경쟁 포지셔닝 (운영 흐름 기준 비교)

| 대비 | 우위 논지 |
|------|-----------|
| Zoom | Zoom은 화상회의 중심, Classin은 준비→판서→녹화→LMS→관리자 데이터까지 잇는 수업 운영 시스템. "줌은 이 흐름을 못 남긴다" |
| 일반 전자칠판 | 화면 출력·판서에 머묾 vs Classin Board는 OPS·SW·EDB·녹화·복습까지 연결. "칠판이 아니라 칠판 뒤 운영을 바꾸는 결정" |
| 학원 관리 프로그램 | 결제·오프라인 출석 전부 대체한다고 말하지 않음, 수업·학습 데이터 중심으로 연결 범위 정의 |
| 별도 LMS | LMS만이 아니라 실시간 수업·EDB·녹화·복습·관리자 데이터가 함께 작동 |

**경쟁사 비교 규칙:** 브랜드명 비노출(넥소 등 구체 브랜드 언급 대응 요구가 있으나 챗봇 `getComparisonAnswer`는 브랜드 인식 없이 일반론만 — 이는 갭). 차별점(내장 OPS·EDB·녹화/복습/LMS·관리자 데이터·카메라/마이크 내장)만 언급.

### 세그먼트별 포지셔닝

- **엔터프라이즈/다지점:** 가격표 대신 기관 맞춤 견적(HW+SW+온보딩 번들), "다지점 기관을 위한 맞춤 설계", 도입 단계(파일럿→확산) 표. 가치축: 게임화로 손이 움직임 / 끊기지 않는 학습 자산 / 자동화된 운영(출결·학부모 리포트·채점) / 라이브 교실 역량.
- **소형 단일 학원:** data-automation류 리드마그넷은 대형/데이터 학원 MOFU 대상이므로 과잉 — `bestUsedWhen` 분기.

### 정직한 한계 (신뢰 무기)

**대놓고 인정할 것 = 신뢰 무기.** 아래는 "별도/연동/API"로 분리:
결제·정산 / 오프라인 출입·출석 / 고급 경영 리포트 / 자체 CRM·ERP 세부 연동 / 모델별 정확한 가격·재고·설치 가능 여부 / 미확인 하드웨어 스펙 / "AI가 정서·뇌파·학습이전을 자동 측정" 같은 표현. 만능 학원관리 프로그램처럼 말하지 않는다.

---

## 4. 브랜드 보이스 & 톤 가드레일

**코어 보이스:** 차가운 SaaS가 아니라 **수업 품질을 안정적으로 표준화하도록 돕는 프리미엄 운영 파트너**처럼 말한다. ① 기능명보다 수업 전·중·후 운영 흐름과 줄어드는 업무로 설명 ② 과장하지 않음 ③ 불안을 남기기보다 다음 행동 안내 ④ 따뜻함은 어조로만, 답을 길게 늘이지 않음.

### 핵심 원칙 — 톤은 표면에 따라 다르다(의도된 분기)

마케팅 표면(홈·랜딩·블로그)은 문제를 직시해 긴장·손실 프레이밍을 써도 되지만, **지원·제품·문서·챗봇 표면은 반드시 안심시키고 행동을 안내한다.** 긴장은 구매 전 인식 환기에만, 운영 중 사용자 표면엔 쓰지 않는다.

| 표면 | 톤 규칙 |
|------|---------|
| 홈/랜딩 | 긴장·손실("에이스 강사 퇴사","연간 손실") 허용, 문제→시스템 해법→CTA |
| 제품 | 자신감 있는 차별화 + 정직한 한계 |
| 블로그 | 관점 전환·반론 대응 + 말미 리드마그넷 연결 |
| 문서센터 | 안심·행동 안내(불안 유발 금지, TBD/준비 중 금지) |
| 이메일 | 개인화 + 옵트인 동의 문구(법적 필수), 홈 공포소구 복붙 금지 |
| 챗봇 | 따뜻한 상담원, 짧은 공감→기준→다음 행동, 이모지·가격 단정 금지 |

### 공통 금지 표현

"모든 학원 관리 기능을 대체합니다" / "결제와 오프라인 출석까지 모두 해결" / "AI가 학생 상태를 자동으로 완벽하게 파악" / "가장 싸다","무조건 절감" 같은 보장형 / 미확인 기관·보드·가격·모델 스펙.

**권장어:** "수업 운영 흐름 · 강사 리소스 절감 · 수업 품질 표준화 · 감이 아니라 기준으로".

### 디자인 팔레트 규범

Notion 구조 × Apple 공백 × Classin Green.

| 토큰 | 값 |
|------|-----|
| 유일한 포화 컬러 | Classin Green `#084734` (**파랑/보라 절대 금지**) |
| Hover | `#065c41` |
| 페이지 배경 | `#FAFAF8` |
| 텍스트 | `#111110` |
| 그린 서피스 | `#ECFDF5` / `#D1FAE5` |
| 웜 뉴트럴(블루-그레이 금지, 노란-갈색 언더톤) | `#F6F5F4` / `#615D59` / `#A39E98` |
| 섹션 배경 교차 | `#FFFFFF` ↔ `#F6F5F4` ↔ `#ECFDF5` |
| 보더 | **whisper `1px solid rgba(0,0,0,0.08)`** (두껍게 금지) |
| 섀도 | 4~5레이어, opacity 0.01~0.05 |
| letter-spacing | 헤딩 클수록 더 음수(64px→-2.125px) |
| radius | 버튼 6px, 카드 12px, 히어로 16px, 뱃지 9999px |

어드민 운영 화면 한정 신호색(Danger `#B43E3E`/Warning `#A8741A`/Success `#084734`)은 상태 표시에만, CTA는 여전히 그린 하나. UI는 DESIGN.md 팔레트만 사용.

### 캐논 운영 원칙

관심사 1개 = SSOT 1개, 규칙(positioning-guidelines) vs 값(`lib/classin-positioning.ts`) 분리, 표면은 참조만, 수치 단정 금지(company-facts 등급/상담 확인), 회사 수치 임의 하향 금지.

---

## 5. 세일즈 모션 — 파이프라인, CRM 데이터 모델, 자동 vs 수동

### 파이프라인 단계

세일즈 흐름: **익명 방문 → 리드 식별 → 딜(Deal) → 견적(Quote) → 계약(Contract) → 오더/설치 → 수금 → 갱신/CS**.

- **리드 라이프사이클:** `subscriber → MQL → SQL → SAL → opportunity → customer`. 전환은 자동이 아니라 단계 기준: 문의만=`Lead`, 상담 가능성 확인=`Lead-contacted`, 데모/견적 가능성=`Deal`, 학원 운영단위 확인=`Customer`, 기존고객 추가구매/갱신=새 lead 아닌 `Deal`/`Success Motion`.
- **Deal Lite 단계:** 상담 → 데모 → 견적 → 의사결정 → 오더/설치 → 완료/실패. Full Opportunity는 무거워 1차는 Deal Lite로 시작.
- **CRM 퍼널(운영 관제):** 신규→연락중→상담예약→데모완료→견적발송→협상중→계약대기→계약완료→보류→실패. 공통 상태 체계=신규/진행중/대기/지연/위험/완료/실패.
- **견적 라이프사이클:** `draft → shared → accepted → expired → archived`. `QuoteDocument`(업무단위) / `QuoteDocumentVersion`(외부 전달 스냅샷) / `QuoteDocumentShare`(버전별 공개링크) 3계층. 고객 확인/진행요청은 문서 전체가 아니라 **버전 기준** 기록.
- **계약 전환 우선순위:** ①명시적 `quote_document_version_id` ②latest accepted interaction version_id ③document.current_version_id ④최신 version_number. 새 버전 만들어도 이전 share는 살아있음.

### 상담 세일즈 플로우 6단계

①리스크 3개 선정 → ②즉답 제공 → ③확인 필요 분리 → ④쇼룸 검증(목동 쇼룸) → ⑤견적 범위 확정 → ⑥90일 파일럿. **목동 쇼룸이 가장 강한 CTA**("우리 학원 대표 수업 자료를 가져와 EDB·판서·녹화 흐름 확인").

### 견적/계약 규칙 (파트너 포털 로직)

- **용어:** 파트너=파트너사 대표 1인(role admin, 서명·결정권), 고객=소속 매니저(role member, 조회+변경요청, 서명 불가), 어드민=ClassIn 내부 운영자. "파트너"를 협력사 전체로 쓰지 말 것.
- **Admin과 Partner는 동일 기능**(견적/계약/영수증/고객/딜 CRUD 공용). 유일한 차이=Admin만 마케팅·리드 접근. 대표(파트너)도 견적 작성·영수증 발행·고객 추가 직접 수행. 데이터 범위만 권한으로 제어.
- **제품 카탈로그 고정:** 전자칠판 CB-86/CB-75, 카메라 CAM-T1(교사 트래킹 기본)·CAM-S1(초대형 학원 학생 촬영), 거치 3종(스탠드/벽걸이/매립). 1교실 표준세트=칠판1+CAM-T1×1+거치1. 듀얼·초대형은 SKU 없이 수량 입력.
- **버전:** 견적번호(Q-2026-001) 고정·version 증가. 외부 수신자는 최신 버전만, 내부는 전 버전. 계약 수정 시 재발행+대표 재서명.
- **추가 납품:** contracted=기존 계약 버전업+재서명 / completed·동일건물=신규 계약 / completed·다른 관=기존 고객사에 신규 계약 추가(**새 파트너 생성 금지**).
- **서명은 대표만.** 알림은 인앱 중심, 대표에게. 모든 변경은 audit log(before/after JSON).
- **공유링크:** `/share/{quote,contract}/[token]`(파트너 UI 제거 후 admin 흡수). 공개 CTA=`검토 완료`/`이 견적으로 진행 요청`. Activity Log: `public_quote_view` / `public_quote_review_confirmed` / `public_quote_accepted`. V2에 전용 컬럼 부재로 `activity_logs.after_json` 운영기준. **현재 /share 뷰어는 placeholder("준비 중")** — 뷰어 구현이 선행 과제.

### CRM 데이터 모델 (소유권 3계층)

| 계층 | 내용 |
|------|------|
| ClassIn-owned | `leads`, `crm_customer_events`(활동/회의록/녹음 메타), `crm-recordings`(private bucket), 다음 액션(Phase1=이벤트 JSON, Phase2=`crm_tasks`), `admin_profiles`+CRM assignment, `crm_source_links`(매칭), `crm_write_requests`(외부수정 큐) |
| External-owned(read-mostly) | NEO/OCRM/샤오셔우이(销售易) 스냅샷=`external_crm_records`, 시트(목표/실적/매출), HQ CRM. 직접 수정 금지 → 승인 큐로 |
| Derived | 우선순위 점수, 리스크 상태, 헬스 등급, 인사이트 집계 |

- **담당자 모델:** 별도 테이블 대신 `admin_profiles` 확장 — `crm_team_role`(branch_director/manager/admin/ops), `crm_assignable`, `crm_owner_key`, `crm_owner_aliases`, `neo_owner_id`, `branch_name`. 지사장 1명+매니저 8명 초기값(하드코딩 금지). `내 담당`=`owner=__me`.
- **탭 IA(동결):** 현황 → 고객 → 기록 → 돈흐름(Revenue) → 인사이트 → 연동. 새 top-level 탭 금지(Tasks/Customer360/Meetings/External CRM/Revenue는 기존 탭 흡수). 4탭 위계로 재구성 완료.

### 리드 스코어링·매칭 규칙

- **리드스코어링(2축, 설계):** Fit(정적 최대50: source demo_modal 25/contact_page 18/meta_lead_ads 15, size 300+ 20, hasPhone +8, hasOrg +5) + Engagement(행동 최대50, 30일 반감기 감쇠: pricing_view +6, demo_video +8, material_download +12, demo_request +20, repeat_visit +4). 등급 A≥70/B 50-69/C 30-49/D<30. 엔진은 서버(서비스롤)에서 `client_events` 읽어 계산→leads 영속, 클라 보드는 저장값만 렌더. 현행은 `calcScore()`(출처+연락처만)이 한계.
- **우선순위 큐(실구현, `lib/crm/priority.ts`):** LLM 아닌 룰엔진. `clampScore` 0~100, `severityFromScore`(critical/high/medium/low), bucket(today/renewal/watch/stale_recovery). `RESPONSE_TARGET_SOURCES={demo_modal, contact_page, meta_lead_ads}` base가중, 48h+ 미응답·만료 D-day·잔액·미수업일·태스크 due 가중. reason은 일수·건수만(금액 금지=통화 안전).
- **매칭 자동확정 티어:** confidence ≥ 0.92 AND 2위와 갭 ≥ 0.15 → 자동 confirm(`metadata.auto_confirmed=true`). **customer/partner_account만 자동, deal은 항상 수동.** 정책=`crm_source_priorities.auto_confirm_*`, migration 미적용 시 조용히 비활성. `/admin/crm/matching` 인박스(일괄확정/제외/되돌리기). 소스 우선순위 app_v2>xiaoshouyi>lead>branch_rev_sheet.

### 매출 원장 (REV/DSH)

- **자체DB 소유율:** 활동/라벨/할일 100%, 리드 95%, 고객 ~30%, **매출 0%**(외부 의존). 성과분석은 `branch_rev_deals`(지사 시트, CNY)를 읽음.
- **확도 3단계:** 예정 / 고확도 / 확정(`metadata.confidence`). REV 그룹핑=customerGroupKey. 정본=crm_orders(NEO 고객매출), 지사시트=파이프라인 보조. 이중계상 제거=`crm_source_links` status=confirmed로만 합산.
- **NEO→crm_orders 적재(설계, 미구현):** `external_crm_records` 정제 → owner 해소(중국팀 is_excluded 제외=한국팀만), status 정규화(续费→renewal/新签→new_sign, won/renewal/new_sign만 집계), CNY 태깅, 미래날짜 이상치(2035/2028) 제외.

### 통화 규범 (최대 함정)

**통화가 객체별로 다르다 — "전부 CNY" 단정은 틀림.**

| 객체 | 통화 | 표기 |
|------|------|------|
| 오더(opportunity) | **USD** | `$` 네이티브. 오더는 확정 임박 매출로 매출과 동급 취급(2급 격하 금지) |
| 매출/수금/잔액/미수/REV 목표 | **CNY** | `¥` 만단위 2자리(예 `¥24.42만`). ₩·won 가정·반올림 만단위 금지 |
| 딜 예상 | **KRW** | `₩` |

서로 다른 통화 grand total 절대 금지. 홈 대시보드·매출추이 차트에 CNY를 ₩로 찍던 활성 버그 → Phase 0 소급교정(`formatCNY`/`formatKRWAbbrev`/`CRM_CURRENCY_BADGE`). (내부 CRM 지표 표기 규범이며 한국 고객 판매가와는 별개.)

### 자동 vs 수동

| 자동화됨 | 수동/미완 |
|----------|-----------|
| 매칭 자동확정(customer/partner), 우선순위 큐 룰스코어링+실 mutation, 싱크 체이닝(sync→후보→알림), NEO sync cron(01:00 UTC), 리드 미응답 알림 크론, 동의 기반(P0 배너+Consent Mode v2+cln_aid) | 매출 자체DB 적재(설계만), 리드스코어링 2축 엔진(설계), 공개 소셜로그인(Google/Naver, 설계), 자료 게이팅 3단(설계), crm_tasks 정식 승격, deal 매칭 확정, STT/AI 요약/통화분석(LLM 보류), 이메일 발송(코드 완성·서비스 대기) |

---

## 6. 마케팅 엔진 — 채널 인벤토리와 각 역할·현황

**운영 철학(Growth OS, 2026-03-20):** 관리자 앱은 CMS가 아니라 `콘텐츠+리드+캠페인+사이트전환`을 묶는 운영 시스템. 핵심 퍼널: **Campaign → Landing/Blog/Event → CTA → Form Submit → Lead Pipeline → Follow-up → Outcome → Report**(끊기면 단순 CMS로 전락). 제품 비중 CMS 30%/CRM-lite 25%/Site Control 20%/Campaign Ops 15%/Reports·Settings 10%. 2.201 세일즈 옵스=개인 TODO 앱 아닌 **팀 전체가 같은 숫자·상태를 보는 운영 관제실**, 급한 것은 지연·위험·실패·누락 리스크로 표시. AI는 전역 어시스턴트 아닌 캠페인 문구·견적 문안 생성 보조에만 제한(자동 의사결정·우선순위 추천 제외).

| 채널 | 위치 | 역할·현황 |
|------|------|-----------|
| 행사·오프라인 | `/admin/campaigns` | 행사 캠페인 대시보드(2026-04-28 빌드 완료): 노출→리드→신청→유효리드→참석→딜 전환률+ROI/CPL/CPD, 캘린더 타임라인. 메트릭 `data/event-metrics.json` 폴백. Meta/Google Ads 연동=Phase 2(미완, Supabase 마이그레이션 선행) |
| /l 세그먼트 랜딩 6종 | `public/l/{enterprise,online,managed}/` 정적 + `app/l/test{1,2,3}` React | online·enterprise=전면 디벨롭 완료(섹션 통폐합, 인라인 SVG, `.reveal` 모션, 한자 제거), managed=원본 유지+히어로만, test1/2/3=컴포넌트 미완. 폼=`/api/lead`+`sourceDetail: landing_segment:{page}`. kids·omo1 제외. 히어로 이미지=Gemini `gemini-3.1-flash-image`("나노바나나2")에 실제 보드 사진 레퍼런스 투입 |
| 리드 마그넷 13종 | `data/lead-magnets.json` | 휴먼터치·실질정보 리뉴얼 4 Phase 완료(2026-06-27): 1인칭 현장장면·바이라인(`expertVoice`)·복붙문구·계산표(`worksheet`)·익명사례(`caseCards`)·스크립트(`scriptSamples`). 본문 가격 금액 노출 금지(전부 상담/계산기로), 익명 실사례 OK(성과수치 별도). 남은 것: PDF 재생성(폰트 환경), 신규 4필드 admin 편집칸 없음(저장 시 유실 위험) |
| 이메일·SMS | `/admin/marketing` 3탭(구독자/발송/이력) | 옵트인 리드에 `{name},{org},{role}` 개인화 태그별 발송. 수신거부=삭제 아닌 status 변경(법적 증빙). 발송 코드 완성(`app/api/admin/email/send/route.ts`), `EMAIL_WEBHOOK_URL` or `RESEND_API_KEY` 채우면 즉시 동작(**홀딩**). 우선순위: 이메일(Resend, 비용0원 최광커버) → 카카오알림톡(심사 1~2주) → SMS(건당 8~10원) → 인스타DM 보류 |
| CTA | `cta_configs`/`form_presets` | "버튼 문구 수정" 아닌 전환 객체. 링크·폼·다운로드·모달·비디오 액션 타입 + 추적 이벤트명(`click_cta`,`download_materials`)·연결 캠페인·UTM 자동 부착 |
| 블로그 | Supabase+JSON 듀얼 | B1 저장소 단일화·B2 인기글·B3 RSS(`/blog/rss.xml`)·B5 공유 완료. B4 리드마그넷 CTA 미착수 |
| 노션 캘린더 | 라이브 읽기전용 | Marketing Operations Calendar를 서버토큰 라이브 읽기(5분 TTL). Supabase 복제·양방향 쓰기·토큰 노출 금지. 4번째 소스로 머지만 |

**행사 Attribution 토큰:** `LeadRecord.source`/`notes`에 `event:<event.id>`(UUID) 또는 `event:<event.slug>` 삽입(스키마 변경 없이 동작). 0건이면 행사 기간 내 리드 수 fallback. 후속=리드폼 hidden field 자동 삽입, `utm_campaign === event.slug` 자동 attribution.

**스키마 함정:** `LeadMagnet` 새 필드는 `lib/lead-magnets.ts`(타입) + `lib/repositories/lead-magnets.ts`의 `normalizeLeadMagnet`(화이트리스트) **둘 다** 고쳐야 함. 누락 시 렌더 안 될 뿐 아니라 admin 저장 순간 JSON에서 영구 유실.

---

## 7. 콘텐츠 엔진 — 자산·발행 규칙·챗봇 지식베이스 플라이휠

### 지식베이스 구조 (SSOT·파이프라인)

- **SSOT:** `lib/docs.ts`의 `DocArticle[]`. 파이프라인: `lib/docs.ts → scripts/seed-docs.ts(Supabase 적재) → scripts/embed-docs-chunks.ts(Gemini 임베딩) → 하이브리드 검색`.
- **검색:** 하이브리드 — 벡터(Gemini `gemini-embedding-001`, 1536d + Supabase pgvector) + 키워드(ILIKE) + 임베딩 미적용 시 정적 폴백.
- **챗봇 조회 조건:** `status=published`, `visibility ∈ {public, unlisted}`, `noindex=false`.
- **인벤토리(2026-06-17):** `lib/docs.ts` 56→**61개**(신규 5종 추가; start 6→11, software 5→6). 채널톡 헬프센터 동기화본=`docs_articles`(slug `channel-talk-document-{id}`) 54문서/297청크 임베딩, `visibility=unlisted` 기본. 고객후기 7·케이스 7·공개 FAQ 18·리드마그넷 13은 코드/데이터 전용, 챗봇 직접 색인 안 함, 신규 DocArticle 1차 원천으로만 사용.
- **신규 5종:** `customer-stories`, `why-classin-needs`, `value-and-cost-framing`(unlisted·하드 금액 단정 금지), `adoption-journey-90days`(진단→파일럿→온보딩→정착, 평균 도입 3개월), `app-capabilities-map`. + `pre-adoption-faq-22-questions`(2026-06-18).

### 콘텐츠 발행 규칙·금지사항

| 규칙 | 내용 |
|------|------|
| 중국어 한자 절대 금지 | `lib/docs.ts` 한국어 전용. channel.io/중국 원문 기반이라 한자 잔재(`特写`→클로즈업, `板书`→판서, `投屏`→미러링) 섞임. 하드웨어 문서(cam/mic/board-s-series) 작성·수정 후 한자 스캔(`[一-鿿]`) 필수. 조사 깨짐(클로즈업를→클로즈업을)도 점검 |
| 미완성 콘텐츠 | `TBD`/`placeholder`/`준비 중`/`확인 필요` 내부 메모 금지. 미확정은 (1)공개 안 함 (2)더 일반적으로 씀 (3)내부 분리 중 택1 |
| 공개 전 필수 확인 | 요금/할인/환불/세금계산서, 지원시간/SLA/장애대응, HW 사양/설치/A-S, 화면명·권한명, 릴리즈 날짜, 개인정보·보안·계약 문구 |
| 문장 톤 | 불안 유발보다 행동 안내("문제가 발생하면"→"수업 중에는 먼저 빠르게 복구합니다"). "반드시"는 법적/계약 기준 확실할 때만 |
| 가격 표현 | 정확한 금액·계약조건은 항상 상담 연결. 견적 구성요소·비교 관점만 정성적으로. 하드 금액 단정 금지 |

**문서센터 카테고리:** 빠른시작/운영가이드/기능매뉴얼/도움말/문제해결/업데이트 6역할. 운영가이드는 대상→언제→목표→권장순서(3-7단계)→체크리스트→복사문구→흔한실수→관련문서→챗봇요약 9단계 틀.

### 챗봇 (세그먼트 라우팅 2단계)

- **파이프라인:** Stage1 UNDERSTAND(휴리스틱 우선, 모호 시 flash 1콜 ≤1.2s) + Stage2 RESPOND(세그먼트 파라미터화). 엔진 Gemini(fast=gemini-2.5-flash, reasoning=gemini-2.5-pro).
- **4 세그먼트:** prospect(신규 검토) / pricing(가격·견적) / existing_ops(기존 운영·사용법) / support_complaint(기술지원·장애+컴플레인). precedence: **critical/complaint > pricing > existing_ops > prospect**.
- **절대 방어선:** raw-chunk 누출 방지, gemini-2.5-flash thinkingBudget:0, 최종금액·견적 단정 금지→상담, 민감분기(가격/계약/환불/계정/장애) "가능/지원" 단정 금지, 큐레이션=final(Gemini 재작성 스킵), 공개답변 sanitize(URL/마크다운/출처 누출 0).
- **성공기준:** 첫토큰 p50≤600ms/p95≤1200ms, 세그먼트 분류 정확도 ≥92%, CSAT ≥80%, faithfulRate ≥0.97/hallucination ≤0.02. 하드 게이트=결정론적 guardrails(judge는 자문).
- **support_complaint 핸드오프:** 감정만으로 핸드오프 안 함. 긴급 운영장애(수업 끊김·로그인 불가·접속 장애)=즉시 사람 연결(학원이 수업 중일 수 있어 최우선) / 비긴급=셀프서브 실패 시 escalate / angry=부차 가속기.
- **가격 해결률** = "클린한 상담 라우팅" 성공으로 집계(가격 답변은 정책상 금지).

### 채널톡 플라이휠 & 회원 영상

- `lib/channel-talk-mining.ts` `mineFaqSuggestions`가 category(`detectChatbotCategory` 재사용)+sampleQuestions(군집 내 verbatim 최근순 최대 3개) 반환 → `/admin/channel-talk` FAQ 플라이휠 패널에 카테고리 배지+유사질문 노출.
- 후속(미착수): 마이닝 결과 question_clusters 영속화 → chatbot_recommended_questions 초안 자동생성(**어드민 검토 후 게시, 자동게시 금지**) → 채널톡 sync 크론. Supabase 마이그레이션 필요.
- 채널톡 자동 sync 없음(수동 `lib/docs.ts` 재반영). 이미지는 channel.io CDN(cf.channel.io) 의존.
- 회원 전용 행사 다시보기: `/events` 하단 통합, 재생=`/events/videos/[slug]`(force-dynamic·게이트). 카탈로그=`lib/seminars/catalog.ts`(DB 없음). 비회원엔 youtube ID 미출력(유출 0). 프리미엄 영상은 리드마그넷과 분리(스트리밍+로그인 전용).

### 콘텐츠 로드맵 현황

블로그 B1/B2/B3/B5 완료, B4 미착수. 행사 E1/E2/E3(.ics) 완료, E4 리마인더 cron 미착수. 가이드 D2(JSON-LD)/D3(조회수)/D6(상담 CTA) 완료, D1(문서 Supabase 이관)=어드민 수기편집본 덮어쓰기 리스크로 보류. **최우선 = D1(문서 Supabase 단일화)→E1→B1.**

---

## 8. 일하는 방식 — 6파트 분담, 품질 게이트, 함정, 결정 vs 미해결

### 6파트 분담 (소유권 매트릭스 + 담당 에이전트)

| 파트 | 에이전트 |
|------|----------|
| ①홈·랜딩 | `home-front` |
| ②어드민 코어 | `admin-core` |
| ③컨텐츠 발행 | `content-pub` |
| ④마케팅/그로스/CRM | `growth-crm` |
| ⑤챗봇 | `chatbot` |
| ⑥플랫폼&데이터 | `platform-data` |

**표준 5단계:** (1) 소유권 매트릭스로 파트 판별 → (2) 전담 에이전트(`.claude/agents/`) 위임 → (3) 파트 가이드(`docs/active/playbook/0N-*.md`) 정독 → (4) 공통 철칙 7개 적용 → (5) 검증. 크로스컷 의존성(콘텐츠↔챗봇 KB, 그로스↔플랫폼 스키마, 프론트↔그로스 계측·동의, 어드민이 3·4·5 화면 호스팅) 확인.

### 품질 게이트

기본 게이트 딱 두 명령: `npx eslint app components lib --max-warnings=0` + `npm run build`(build에 `check:vercel-crons`/`check:public-content` 훅 포함). 스키마 변경 시 마이그레이션까지. `npm run lint`는 범위 넓어 기본 진실 소스로 안 봄. 신뢰 순서: **실제 코드+검증 결과 > 이 문서 > 제품/아키텍처 문서 > `docs/archive/` 역사기록.**

### 공통 철칙 7 (위반 시 무음 사고)

1. 검증 게이트 통과. 2. **어드민 API = `verifyAdmin()` 가드 + `createSupabaseAdminClient()`(service-role, RLS 우회)** — server 클라이언트를 어드민 경로에 쓰면 `auth.uid()=null` → RLS false → 빈 배열 무음 반환. 3. 마이그레이션 규율: 컬럼 추가 시 `supabase/migrations/YYYYMMDD_*.sql`(`ADD COLUMN IF NOT EXISTS`) 동반+적용, 누락 시 INSERT 무음 실패. 4. 동의·PII: 마케팅 픽셀은 `consent.marketing` 없이 발화 금지, 내부 이벤트는 allowlist+PII redaction, raw IP는 sha256만. 5. 노션 캘린더=라이브 읽기전용. 6. 포지셔닝 SSOT(`lib/classin-positioning.ts`), 가격·기관수 단정 금지→상담. 7. UI는 DESIGN.md 팔레트만.

**어드민 인증:** 3중(dev bypass / 레거시 HMAC 쿠키 / Supabase `admin_profiles.status=ACTIVE`) → `verifyAdmin()` → admin Supabase 클라이언트 → `lib/repositories`. bypass는 dev+non-Vercel 한정. 권한 캐시 60초 TTL. 계정=`ADMIN_USERS`/`ADMIN_PASSWORD` 환경변수(`/admin/users`는 읽기전용). 2026-07-02 감사: 178개 라우트 전수 가드 존재(무가드는 의도적 공개 auth 2개). 단 심층방어 부재로 라우트 1개 실수=전체 노출 리스크.

### 반복 함정 (gotchas)

- RLS/admin 클라이언트 트랩(빈 배열 무음).
- 마이그레이션 누락 INSERT 무음 실패.
- JSON 파일 저장소가 서버리스 읽기전용 FS에서 쓰기 유실(channel-conversations·lead-magnets·event-metrics).
- 하드웨어 원장 파일임포트↔라이브싱크 상호 덮어씀(둘 다 source='sheet_import' replace). 시트임포트 replace/merge 두 RPC 컬럼(unit_price/amount_usd)·source_digest 해시 패리티 필수(원가 NULL 유실은 빌드가 못 잡음).
- 출고→딜 매출 미반영(HW 시트 `3.출고 현황`에 매출 USD+CNY 실존하나 USD만 캡처·CNY 유실).
- convert-v2 멱등성이 notes 텍스트 마커 의존.
- **NEXT_PUBLIC_ 동적 접근 금지**(`process.env[name]`는 브라우저에서 undefined, 항상 리터럴).
- API 키 하드코딩 금지(항상 `process.env.GEMINI_API_KEY`; 모델=gemini-3-pro-preview[blog]/gemini-2.5-pro[marketing·automation]).
- CSS Grid bare `1fr` 금지→`minmax(0,1fr)`+`min-w-0`(포털 홈 우측 탭 오버플로우).
- 애니메이션은 framer-motion(`animate-in`/`slide-in-*` tailwind 유틸 plugin 미설치 no-op).
- body `overflow-x:hidden`이 sticky 깨뜨림(어드민은 app-shell로 회피).
- 새 이벤트는 `EventNames`+`ALLOWED_EVENTS` 양쪽 등록 안 하면 무음 드랍.

### ERP 블루프린트 (지사 운영 OS)

새 탭이 아니라 **흩어진 3개 장부(구글시트 목표·실적 / Portal V2 딜 / 샤오셔우이·NEO 리뉴얼)를 하나의 학원(Account) 360 스파인으로 합쳐 매출 한 번만 집계하고 "오늘 할 일"을 띄운다. 8명이 25명처럼 일하게.** 두 실존 리스크: HW 매출 상위10사=~70~77% 편중, SW 활성화 ~12%(97대 도입, 12대 사용). 키스톤 리스크=전부 `crm_source_links` 커버리지 의존(낮으면 매출 절반 무음 누락→커버리지부터 측정). 원칙=자동 산출 우선·수기 최소(오너 없는 테이블 안 만듦).

### 결정됨 vs 미해결

| 결정됨 | 미해결/보류 |
|--------|-------------|
| /partner UI 제거(2026-05-14), portal→admin 흡수. 공유링크 발급은 나가나 뷰어 placeholder. CRM 개요 스냅샷 RPC 운영 적용(2026-06-13). EDB MAKER는 별개 프로젝트(레포 혼합 금지). 탭 IA 동결. 오더=확정 임박 매출(2급 격하 금지, 2026-06-12) | 이메일 발송(Resend) 서비스 선택 대기. 카카오알림톡·SMS 사업자 심사 후, 인스타 DM 제외. 세금계산서/영수증 구분 미확정. HW 제품 페이지 이미지 생성 대기. 리드마그넷 admin 편집칸 미완. CEO 거버넌스 3결정 대기(매출 book-of-record 시트 vs Portal / 귀속 단일오너+자문형 / 목표 소스 시트→DB). HW 라인업 불일치(챗봇 S98 Pro vs 제품페이지 65/75/86/110) 보류 |

**대표 최상위 가치:** 본질 우선 — 화려한 차트보다 주차별 수치·목표 대비 '숫자' 가시성이 먼저. 한 화면 정보 밀도. mock/live 혼합 금지.

---

## 9. 자동화 훅 맵 — [데이터소스 → 트리거 → 산출물]

### 세일즈 자동화

| 데이터소스 | 트리거 | 산출물 |
|-----------|--------|--------|
| `leads.assigned_to` + `lead_contact_logs` | 48h+ 무응답 감지 크론(`app/api/cron/lead-response-alerts`) | 담당자 알림 + 우선순위 큐 상단 배치(가동, priority.ts 룰가중) |
| `client_events` 행동 이벤트 | Fit+Engagement 엔진 증분 계산, MQL/SQL 임계 도달 | 자동화(`lib/repositories/automation.ts`) + 영업 배정 알림(설계) |
| `external_crm_records`/REV 시트 sync | 후보생성(confidence≥0.92·갭≥0.15) | customer/partner 자동 confirm + `/admin/crm/matching` 인박스(sync-chain.ts, 가동) |
| NEO sync cron(01:00 UTC) 직후 transform | `external_crm_records` 정제(owner/status/통화/날짜) | `crm_orders` upsert → 성과분석 재소스(설계, 구현 대기) |
| `/share/quote/[token]` Activity Log | `public_quote_accepted` | 담당자 '계약 전환' 액션 큐 카드 + 리마인드 후속(quote-lifecycle P2) |
| `crm_customer_events.next_actions` | Phase2 승격 | `crm_tasks` 자동 materialize + 홈 우선순위 큐 통합 |
| `getCrmUnifiedCustomers` 전 고객행 | `computeCustomerHealth` SSOT | 안전/주의/위험 도넛 + 위험 고객 우선순위 큐(가동) |
| `external_crm_records.expireAt` | D-90/60/30 도래 | `/admin/crm/customers/renewals` 리뉴얼 캘린더 + CSM 액션카드 |
| quotes 테이블 version 증가 | 버전업 | `/share/quote/[token]` 최신 버전 재발급(단, 뷰어 구현 선행) |
| InstallationEvent/branch_hw_outbound + lastClassAt | 설치 후 30일 내 SW 활동 없음 | 'Early Success at risk' HW→SW 활성화 리스트(과사람 12% 공략) |

### 마케팅 자동화

| 데이터소스 | 트리거 | 산출물 |
|-----------|--------|--------|
| DemoModal/Contact/뉴스레터 폼(`/api/lead`) | 리드 유입 | 구독자 DB upsert → 태그 세그먼트 분류 → `{name},{org},{role}` 개인화 웰컴 이메일(EMAIL_WEBHOOK_URL/Resend) |
| `data/lead-magnets.json` intentScore(22→37) | 점수 임계 도달(37='도입 전 22질문') | 영업 알림 + 목동 쇼룸 초대 시퀀스 |
| 리드마그넷 다운로드(`sourceDetail=lead_magnet:{slug}`, download_materials) | intent score 세그먼트 태깅 | 자료별 후속 시퀀스(calculator=ROI 리드→견적 가이드 등) |
| `classin-pre-adoption-questions-checklist` 다운로드 | intent:pre_adoption_risk_check 태그 | D+0 즉답/확인 분리, D+1 쇼룸 데모, D+3 견적, D+5 90일 로드맵 드립 |
| `event:<id>|<slug>` 토큰(source/notes) | 행사 funnel 집계 | 노출/리드/신청/참석/딜 전환률 + CPL/CPD/ROI |
| `utm_campaign === event.slug` | 랜딩 폼 hidden field 토큰 주입 | 리드↔행사 자동 attribution |
| Meta/Google Ads insights API(cron 일배치) | `public_events` campaign_id 매핑 | `event_metrics.adSpendEntries` 누적 → spend/CPL/오버스펜드 경보 |
| `leads` UTM 컬럼 | 채널 정규화(meta/naver/kakao/youtube/google) | 채널 리드 KPI 대시보드(목표 Meta20/N15/K10/Y5, CPL≤$10) |
| 노션 Marketing Operations Calendar | `NOTION_API_TOKEN` 서버 라이브 읽기(5분 TTL) | `/admin/calendar` 4번째 소스 '마케팅(노션)' 칩 머지 |

### 콘텐츠 자동화

| 데이터소스 | 트리거 | 산출물 |
|-----------|--------|--------|
| `lib/classin-positioning.ts` + voice-charter | 콘텐츠 생성 시스템 프롬프트 주입 | 표면(홈/문서/챗봇/이메일)별 톤 자동 분기 + 금지 표현 lint + 발행 전 보이스 위반 리포트 |
| company-facts 수치 등급표 | 회사 수치 언급 감지 | '$30B'·미확정 수치 차단, '공식 소개 기준' 캡션 자동 삽입 |
| software-feature-inventory 금지 명칭('슬롯머신','포커스 모드','수식 입력기') | 챗봇/문서 생성물 스캔 | 정식 명칭('랜덤 선택' 등) 자동 치환 + 검토 플래그 |
| 신규/수정 DocArticle(`lib/docs.ts` 저장) | 저장 훅 | 한자(`[一-鿿]`) 스캔 검증 + `chatbot-golden-set.json` 케이스 추가 + vitest 게이트 |
| 채널톡 헬프센터 상담 로그 | `mineFaqSuggestions` 군집화 | `chatbot_recommended_questions` 초안(어드민 검토 후 게시, 자동게시 금지) + 신규 DocArticle 주제 후보 |
| channel.io 공식 가이드 문서 | 업데이트/신규글 감지 | `scripts/sync-channel-documents.ts`+embed로 `docs_articles` 재동기화(수기편집본 `updated_by=classin-admin` 보존) |
| `docs_articles` 발행 | 서버측 reindex 훅(현재 클라 best-effort `.catch(()=>null)` 무통보) | `docs_ai_chunks` 재색인으로 챗봇 KB 최신화 |
| `chatbot_answer_events`(segment/first_token_ms/feedback) | 세그먼트별 해결률·CSAT·핸드오프 집계 | `/admin/chatbot` 성과 대시보드 + golden-eval 회귀 게이트(guardrails 회귀 시 적색 배너) |
| 블로그 published 글 | 발행 이벤트 | RSS(`/blog/rss.xml`, revalidate 3600) → 뉴스레터·포털 수집기 |
| eventSlug 리드 | 행사 D-1 cron(vercel.json) | Resend 리마인더(거래적, 마케팅 동의 무관)(E4) |
| 22질문 매트릭스 | 상담 전 리드 태깅 | 답변가능/확인필요 분리 + CRM 태그 + 후속 흐름(즉답/확인/쇼룸/견적/90일) |
| DESIGN.md 팔레트 토큰 | UI 생성/리뷰 자동화 | non-green 포화색(파랑/보라)·두꺼운 보더 감지 → 위반 컴포넌트 자동 플래그 |

---

*끝. 값의 정본은 각 SSOT 파일이며, 이 문서는 사실이 바뀌면 갱신 대상이다.*
