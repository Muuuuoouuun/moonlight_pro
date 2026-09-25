# Guru 카드별 요약 인포그래픽 제작 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkboxes for tracking.

**Goal:** Guru·Legend 내부 글 26편 각각에 실제 내용을 읽고 복습할 수 있는 한국어 2D 인포그래픽 한 장을 연결한다.

**Architecture:** Markdown 글은 내용의 정본이다. 카드별 JSON 요약에서 이미지 모델 입력 문구와 화면의 의미 있는 HTML 대체 표현을 함께 만든다. 검수된 WebP만 private Hub 경로로 제공하고, 화면 폭이 좁거나 이미지가 실패하면 같은 JSON 요약을 HTML로 보여 준다.

**Tech Stack:** Next.js App Router, React, 카드별 Markdown·JSON, built-in image model, WebP, Node `--test`.

**상태:** 2026-09-25 로컬 제작·연결·검수 완료. 운영 반영은 별도다.

---

## 기존 이미지 처리

- 이전 결과물은 글 내용 요약이 아닌 **개념 일러스트**다. 앱과 Git에서 제거한다.
- 원본 26장과 당시 생성 설명은 로컬 전용 `/Users/bigmac_moon/dev/moonlight_pro-local-assets/guru-concept-illustrations-2026-09-25/`에 별도 보관한다. 이 경로는 앱 런타임·Next 추적·커밋 대상에 넣지 않는다.
- 훗날 다른 콘텐츠에서 구도나 분위기를 참고할 수 있지만, 그 콘텐츠의 문맥과 문구를 기준으로 **새로 생성**한다. 기존 파일을 이번 인포그래픽으로 이름만 바꿔 넣지 않는다.

## 파일 계약

| 역할 | 경로·형식 | 판정 기준 |
| --- | --- | --- |
| 내용 정본 | `apps/hub/content/guru/<card-id>.md` | 해당 인물·카드의 주장과 적용 경계 |
| 요약 문구 | `apps/hub/content/guru/infographics-sales.json`, `apps/hub/content/guru/infographics-other.json` | 합쳐서 26개, 카드 ID당 정확히 하나 |
| 최종 이미지 | `apps/hub/content/guru/infographics/<card-id>.webp` | 원본 크기 문자·의미 검수를 통과한 경우만 배치 |
| 내부 이미지 경로 | `/api/hub/guidance-articles/[id]/infographic` | 카드 ID 허용 목록·private/no-store·`image/webp`; 실패는 이미지로 위장하지 않음 |
| 읽기 화면 | `apps/hub/components/hub/guru-article-infographic.jsx`와 `guidance-detail.css` | 데스크톱 이미지, 모바일/이미지 실패 시 의미 구조가 있는 HTML |
| 배포 포함 | `apps/hub/next.config.mjs` | 최종 WebP 26장만 파일 추적 |

JSON 한 항목의 필드는 `id`, `title`, `takeaway`, `layout`, `nodes: [{label, detail}]`, `boundary`다. `layout`은 `path`(시간·행동 순서), `compare`(두 관점의 대조), `layers`(확인해야 할 층위), `filter`(판단을 통과시키는 질문) 중 해당 글의 논리에 맞는 하나를 고른다. 도식 유형은 장식 패턴이 아니라 **관계의 의미**를 결정한다.

## 제작 기준

1. **글을 압축한다.** 글·검수된 카드 주장·출처 품질 점검을 먼저 읽는다. JSON의 `takeaway`는 한 주장, `nodes`는 2~4개의 짧은 단계/비교 항목, `boundary`는 실제로 적용하지 않을 조건이다. 원자료에 없는 인용·고객 사례·수치·성공 보장은 새로 넣지 않는다.
2. **이미지 모델에 정확한 문구를 전달한다.** 이미지에는 JSON의 한국어 제목·노드 라벨/설명·경계 문장을 지정하고, 핵심 주장(`takeaway`)은 이미지 바로 아래의 실제 텍스트 캡션에 둔다. 이미지에 핵심 주장이 함께 들어가도 같은 문구여야 한다. 가로 3:2의 평면 인포그래픽, 넉넉한 여백, 강한 글자 대비, 짧은 연결선·구획을 요구한다. Moonlight의 차콜·실버·차가운 청색만 사용한다.
3. **도식은 글마다 다르게 한다.** 순서가 핵심이면 `path`, 두 관점의 차이가 핵심이면 `compare`, 확인 항목을 쌓아야 하면 `layers`, 통과/보류 조건이 핵심이면 `filter`로 시각화한다. 인물 얼굴·상징적 풍경·3D·사진·가짜 차트·로고는 만들지 않는다. 빈 장식 공간보다 핵심 문구의 읽기 크기를 우선한다.
4. **한 장씩 검수한다.** 이미지에서 제목·노드·순서·연결 관계·경계 문장을 실제로 읽고 JSON 및 Markdown에 대조한다. 한글 획이 깨지거나, 자모가 바뀌거나, 임의 문구가 들어가거나, 도식의 인과 관계가 달라지면 실패다. 실패본은 앱에 복사하지 않고 다시 생성한다.
5. **내부에만 둔다.** 통과본을 WebP로 최적화해 카드 ID 이름으로 저장한다. 원본 생성물과 중간 실패본은 앱에 넣지 않는다. 앱 `public/`이나 외부 URL로 공개하지 않는다.

### 카드별 이미지 모델 프롬프트 틀

아래 `{...}`는 대상 JSON 값으로 치환한다. 모델 출력 글자는 별도 수작업 대조 전까지 신뢰하지 않는다.

```text
Create one 3:2, flat 2D Korean editorial INFOGRAPHIC for a private reading article.
This is a visual summary, not a conceptual illustration or decorative poster.
Use a calm charcoal, cool silver, and muted blue palette. High-contrast Korean
typography, large enough to read at normal desktop article width. Generous margins.
No photo, portrait, 3D object, logo, fictional metrics, charts, extra quote, or icon
that could imply an unsupported fact.

Use the {layout} relationship: {layout-specific description matching the article}.
Place exactly these Korean strings, with no paraphrase or added text:
Title: “{title}”
Nodes in this order:
1. “{nodes[0].label}” — “{nodes[0].detail}”
...one line per remaining node...
Boundary label: “적용 경계”
Boundary: “{boundary}”

The application renders this exact main claim below the image: “{takeaway}”.
Make nodes and boundary visibly distinct. Never show a checked item,
arrow, or result that contradicts the wording. Keep every Hangul syllable legible.
```

## 작업과 검수 게이트

### 1. 문구·구조 감사

- [x] 두 JSON의 ID 합집합이 카드 목록 및 Markdown 26편과 정확히 일치하고 중복이 없다.
- [x] 각 `takeaway`·`nodes`·`boundary`를 해당 글과 대조해 귀속 오류·과장·근거 없는 수치가 없다.
- [x] `layout`이 실제 관계를 설명하며, 단순히 모든 카드를 같은 화살표 도식으로 만들지 않는다.

### 2. 생성·이미지 QA

- [x] 카드별로 built-in 이미지 모델을 사용해 26장 각각 생성한다. 공통 그림을 재활용하지 않는다.
- [x] 최종 후보 26장 각각을 원본 크기로 판독해 **이미지에 표시된 모든 한국어 문구가 JSON과 동일**하고 자모 오류·누락·추가 단어가 없다. 핵심 주장은 이미지 아래 캡션에서 같은 JSON 문구로 읽힌다.
- [x] 노드의 순서·연결선·강조가 주장과 적용 경계를 뒤집지 않는다. 글자 크기와 대비가 상세 Drawer에서 읽힌다.
- [x] 통과한 WebP 26장만 앱에 두고 카드 ID 파일명, 3:2 비율, 파일 크기를 확인한다.

### 3. 연결·접근성·실패

- [x] 이미지 API는 등록된 카드 ID만 허용하고 인증된 Hub 범위에 머문다. 성공은 `image/webp`, 실패는 이미지로 위장하지 않는 오류 응답이며 둘 다 private/no-store다.
- [x] 데스크톱은 이미지, 390px 화면은 같은 JSON의 제목·핵심 주장·노드·경계를 순서대로 읽을 수 있는 HTML이다. 화면 읽기 도구에도 동등한 내용이 전달된다.
- [x] 이미지 누락·손상·요청 실패에서도 HTML 요약과 Markdown 글이 정상적으로 보인다. 글 열기 자체가 AI 요청·알림·업무를 만들지 않는다.

### 4. 로컬 확인

- [x] 관련 단일 테스트, `npm test`, `npm run typecheck`, Hub 빌드, `git diff --check`를 실행해 결과를 기록한다.
- [x] 개발 서버에서 `sales-gap`, 영업 비교형, 마케팅·콘텐츠·Legend 대표 카드를 확인하고, 밝고 어두운 화면과 데스크톱·390px 읽기를 점검한다.
- [x] Hub 빌드의 이미지 라우트 파일 추적에 최종 26장만 포함되는지 확인한다. 운영 반영은 개발 서버의 실제 읽기 경험을 확인한 뒤 별도 결정으로 다룬다.

**검증 기록:** 이미지 26/26은 제작 담당과 별도 시각 검수 담당이 최종 문구·순서·대비를 판독했다. 26/26이 1536×1024 WebP이고, 관련 단일 테스트 8/8 통과, 전체 `npm test` 3,262건 중 3,249 통과·실패 0·skip 13, `npm run typecheck`와 Hub 프로덕션 빌드 통과. 빌드 파일 추적에는 고유한 신규 WebP 26장, 이전 일러스트 0장. 개발 서버에서 분야별 대표 글과 모바일 두 유형을 확인했고, 이미지 파일을 일시 제거한 실험에서도 HTML 요약과 본문이 이어짐을 확인한 뒤 파일을 복원했다.
