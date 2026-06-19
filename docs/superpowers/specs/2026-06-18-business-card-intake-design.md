# Spec: 명함 → 자동 리드/고객 (Business Card Intake)

Status: APPROVED (brainstorming 2026-06-18)
Branch: codex/moonlight-p0-hardening
관련: `docs/sales-os-direction.md` (Sales OS SSOT), 메모리 `sales-os-project`

## 문제

영업자(문준혁)가 방문/대면에서 받은 **명함**을 손으로 리드 목록에 입력하는 잡무를 없앤다.
명함 사진을 올리면 이름·회사·전화·이메일·직책을 자동 추출해 **리드/고객 목록에 즉시** 들어가게 한다.

## 확정 결정 (인터뷰)

1. **추출 = Gemini 비전.** 기존 `apps/engine/lib/gemini.ts` 패턴(raw fetch)을 Hub로 옮긴 비전 헬퍼로
   처리. 새 제공자/의존성 없음. Hub는 이미 `GEMINI_API_KEY`/`GEMINI_MODEL` 환경변수 보유.
2. **즉시 자동 추가.** 추출되면 확인 단계 없이 바로 리드 목록에. 단 **중복 방지(match_key)**는 유지하고,
   비전 실패·저신뢰는 staging `review`로 빠져 조용한 오류를 막는다.

## 접근 (A 채택)

- **A. Hub 네이티브 (채택):** 기존 `lead_intake_raw` staging + `sheets-sync.js`의 `promoteStagedLeads`
  (companies/leads 생성·dedup) + `sheets-normalize`(전화 정규화·match_key)를 **재사용**. Hub가 이미
  GEMINI 환경변수와 promote 로직을 가져 가장 작다. sheets-sync 선례와 동일 패턴.
- B. Engine 경유(기각): engine `lib/gemini` 재사용은 되나 Hub→Engine 홉 + promote 로직(Hub 소재) 중복.

## 아키텍처 / 데이터 흐름

```
[Hub UI] Revenue › Leads "명함 추가" → 사진(file/camera) 선택
   │  POST multipart/base64 image
   ▼
[Hub API] /api/hub/cards (POST, hub-write-guard)
   │  1. lib/google-vision.js — Gemini :generateContent + inlineData(image)
   │       + 엄격 추출 프롬프트 → { name, company, phone, email, title, address } (불확실 필드 null)
   │  2. sheets-normalize: normalizePhone + computeMatchKey(phone > name+address)
   │  3. lead_intake_raw insert (source='business_card', raw, normalized, match_key)
   │  4. 필드 완성도(§중복/안전) → 자동 promote : status='review' (확인 필요)
   │  5. promoteStagedLeads(확장): dedup → companies (생성/링크)
   │                                      + contacts (이름/직책/이메일)
   │                                      + leads (source='business_card', company+contact 링크)
   ▼
[응답] { lead, company, contact, status: 'promoted'|'review'|'rejected' }
[Hub UI] 새 리드를 Leads 목록에 즉시 표시 + 토스트("추가됨 · 수정" / "확인 필요")
```

## 컴포넌트 (생성/변경)

**생성**
- `apps/hub/lib/google-vision.js` — Gemini 비전 호출(raw fetch, `inlineData`). `extractBusinessCard(imageBase64, mimeType)` → 구조화 JSON. engine `gemini.ts`의 env/엔드포인트 패턴 차용. JSON 강제(응답 파싱·검증).
- `apps/hub/lib/repositories/card-intake.js` — 오케스트레이션: normalize → `lead_intake_raw` insert → promote 호출. `sheets-normalize`·`sheets-sync` 빌딩블록 재사용.
- `apps/hub/app/api/hub/cards/route.js` — POST(hub-write-guard, 이미지 크기 제한). GET(최근 명함 intake 로그, 선택).
- `apps/hub/components/hub/pages/...` — Leads 페이지에 "명함 추가" 버튼 + 업로드 시트(모바일 file/camera input → 미리보기 → 진행 상태 → 결과). 토큰만, primitives 사용.
- `supabase/migrations/20260618_0008_business_card_source.sql` — `lead_intake_raw.source` 체크에 `'business_card'` 추가.
- `scripts/check-card-intake.mjs` (+ `check:cards` npm script) — 명함→intake 매핑·match_key 노드 셀프테스트.

**변경**
- `apps/hub/lib/repositories/sheets-sync.js` — `promoteStagedLeads`를 contacts 생성/링크까지 확장(또는 공용 `promoteIntakeRow` 추출). 명함은 인물 정보(직책/이메일)가 있어 `contacts` 생성이 가치.
- `supabase/schema.sql` — source 체크 동기화.
- `apps/hub/components/hub/pages/revenue.jsx`(Leads) — 진입점 버튼.

## 데이터 모델

- 신규 테이블 없음. `lead_intake_raw`(source='business_card', raw=추출+이미지참조, normalized, match_key,
  status), `companies`(name), `contacts`(company_id, name, email, title), `leads`(company_id, contact_id,
  source='business_card', status='new')를 재사용.
- 마이그레이션 0008: `source` 체크 확장만(추가적). 라이브 DB 적용은 `npm run db:migrate`로 사용자 승인 후.
- 이미지 저장: v1은 추출 필드 + (선택) 이미지 data URL/storage path를 `lead_intake_raw.raw`에 기록.
  실제 Supabase Storage 업로드는 vNext(스펙 out-of-scope).

## 중복/안전

- **dedup:** `computeMatchKey`(전화 > 정규화 상호+주소). 매칭 시 기존 company/lead에 링크, intake는
  'merged'. 프랜차이즈 동명/전화재사용은 기존 sheets-sync와 동일 정책.
- **감사:** 즉시 자동 추가여도 raw 명함은 staging 행으로 남김.
- **조용한 오류 방지:** 자동 promote 조건 = `{name, company, phone}` 중 **2개 이상** 파싱됨. 미만이면
  `status='review'`(확인 필요). Gemini는 네이티브 confidence를 주지 않으므로 *필드 완성도*로 판정하고,
  프롬프트에서 불확실 필드는 `null`로 반환하도록 강제(추측 금지).
- **거부:** 전화·이름 둘 다 없으면 식별 불가 → `rejected`(명확한 메시지).

## 에러 처리

- Gemini 미설정/실패/타임아웃 → 502 유사 응답 + "추출 실패" 메시지. intake 행은 안 만들거나 review로.
- 이미지 과대(예: > 4MB) → 클라이언트 리사이즈 또는 거부(크기 안내).
- Supabase 미설정(preview) → 명시적 preview 응답(목·라이브 혼합 금지, DESIGN 원칙).
- JSON 파싱 실패(Gemini가 비정형 반환) → review로 폴백 + raw 보존.

## UI

- Revenue › Leads 상단에 **"명함 추가"** 버튼(primary, icon). 클릭 → 시트/모달:
  - `<input type=file accept="image/*" capture="environment">` (모바일 카메라 우선)
  - 미리보기 → "추출 중…" 상태 → 결과(새 리드 요약: 회사·이름·전화·직책) + "수정"(Studio/lead 편집 링크).
  - review/rejected는 톤 구분(warning/danger) + 사유 표시.
- 다크 네이티브, `hub-tokens.css` 토큰만, `hub-primitives`(Button/Badge/Card/Input). 모바일 우선.

## 테스트

- `scripts/check-card-intake.mjs`: 샘플 추출 JSON → normalize → match_key/매핑 단언(전화 정규화,
  phone>name+address, 필드 부족 시 review/rejected 분기). 비전 호출 자체는 목(고정 JSON).
- 빌드(typecheck + next build) + preview 라이브 검증(업로드 플로우 렌더·에러 0).

## 범위 밖 (vNext)

- 실제 이미지 파일 Supabase Storage 업로드/썸네일.
- 일괄(다중 명함) 업로드, 배치 OCR.
- 자동 발송/팔로업 연결(v1.2 팔로업 엔진에서).
- 회사 CRM(Xiaoshouyi) 동기 반영(v1.4 결합 이후).

## 완료 기준

- 명함 사진 1장 업로드 → 30초 내 리드 목록에 회사+연락처+리드가 생성/링크됨(타이핑 0).
- 같은 학원 명함 재업로드 시 중복 리드 안 생김(match_key 링크).
- 저신뢰·필드부족은 review로, 식별불가는 rejected로 — 조용히 잘못 들어가지 않음.
- 빌드·셀프테스트·preview 검증 통과.
