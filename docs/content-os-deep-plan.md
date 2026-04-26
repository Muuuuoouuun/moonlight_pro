# Moonlight Content OS 심화 기획

## 1. 본질

Content 탭은 일반 CMS나 글쓰기 도구가 아니다.

Moonlight의 Content는 1인 운영자를 위한 콘텐츠 생산 OS다. 하나의 원본 생각을 만들고, 그것을 Newsletter, Blog/Insight, Card News, X Thread, Reels Script로 변형한 뒤, n8n을 중심으로 외부 실행 레이어에 넘기고, 성공/실패와 제작 이력을 남기는 조종면이다.

핵심 질문은 다섯 가지다.

1. 지금 어떤 콘텐츠가 멈춰 있는가?
2. 원본 생각과 각 채널별 변형은 어디까지 준비됐는가?
3. 자동 저장과 브라우저 로컬 저장은 정상인가?
4. n8n으로 넘긴 실행은 성공했는가, 실패했는가?
5. 제작, export, handoff, 발행 이력은 신뢰할 수 있게 남았는가?

## 2. 사용자와 운영 전제

- 1차 사용자는 1인 founder/operator다.
- 팀 협업보다 개인 속도, 복구 가능성, 실행 로그가 더 중요하다.
- 발행은 Hub가 직접 소유하지 않는다. Hub는 준비, export, handoff, 기록을 소유한다.
- 실제 채널 실행은 n8n, Resend/Gmail, 외부 블로그 플랫폼, 이후 X API 같은 provider layer가 담당한다.
- 저장은 기본적으로 자동이다. 브라우저 로컬 저장은 조용한 mirror로 둔다.

## 3. 정보 구조

현재 `Studio / Queue / Campaigns`를 유지하되, 역할을 명확히 나눈다.

### Studio

Studio는 작성 화면이 아니라 Variant Workshop이다.

구조:

```text
Master Draft
  -> Newsletter Variant
  -> Blog / Insight Variant
  -> Card News Variant
  -> X Thread Variant
  -> Reels Script Variant
  -> Export / Handoff
  -> Logs / History
```

필수 UI:

- 콘텐츠 제목, 상태, 저장 상태
- 자동 저장 토글
- 브라우저 로컬 mirror 토글
- variant selector
- variant editor
- preview panel
- export / handoff action
- history panel

저장 상태는 큰 배너가 아니라 조용한 아이콘 중심으로 표시한다.

예:

- Cloud saved
- Local mirror on
- Cloud failed, local saved
- Restored from browser

### Queue

Queue는 목록이 아니라 다음 행동을 고르는 운영 상태판이다.

권장 lane:

```text
Inbox -> Drafting -> Ready -> Handed off -> Watch
```

`Review`보다 `Ready`가 적합하다. 혼자 쓰는 제품에서 핵심은 승인받는 것이 아니라 넘길 준비가 됐는지 판단하는 것이다.

### Campaigns

Campaigns는 개별 콘텐츠 편집면이 아니다. Content, Revenue, Automations, Decisions를 캠페인 기준으로 묶는 war room이다.

Campaigns가 보여야 할 것:

- 캠페인의 목표와 리스크
- 관련 콘텐츠 묶음
- n8n handoff 상태
- 성공/실패 로그
- revenue/lead attribution 연결

### Publish

후속 단계에서 `Publish` 탭은 되살리는 편이 좋다.

단, 역할은 직접 게시가 아니라 distribution watch다.

필수 블록:

- n8n handoff queue
- provider success/failure timeline
- retry candidates
- exported packages
- channel history

## 4. 콘텐츠 타입

MVP부터 5개 variant type을 지원한다.

### Newsletter

- Markdown editor
- HTML preview
- subject/preheader
- CTA block
- n8n handoff

### Blog / Insight

- Markdown editor
- external platform handoff
- slug suggestion
- excerpt
- web article preview
- SEO title/description은 후속

### Card News

브랜드별 템플릿을 기본으로 한다.

운영 비중은 Card News가 가장 커질 수 있다. 따라서 Card News는 후속 장식 기능이 아니라 Content OS의 주요 생산 레인으로 본다. Newsletter와 Blog/Insight가 원본 서사를 잡고, Card News가 반복 생산과 배포 패키지의 중심이 되는 구조를 열어둔다.

MVP export:

- 1080x1080 PNG export
- 전체 ZIP export
- 슬라이드별 구조 저장
- export 결과를 Google Drive에 업로드
- Google Drive 파일 메타데이터를 `content_assets`에 기록

후속:

- PDF export
- Instagram carousel package
- brand-specific visual presets
- thumbnail preview

### X Thread

초기에는 copy/export 중심으로 둔다. 자동 게시는 후속.

MVP:

- thread block split
- character count
- copy all
- `.txt` export
- n8n handoff log

후속:

- X API posting adapter
- 예약 발행
- 실패 재시도

### Reels Script

단순 textarea가 아니라 구조형 editor가 필요하다.

권장 구조:

```text
Hook
Scene 1
Scene 2
Scene 3
B-roll
Caption
On-screen text
CTA
Notes
```

Scene 필드:

- visual
- spoken line
- subtitle
- duration
- shooting note

이 구조는 이후 영상 생성, 편집 지시서, shorts/tiktok 변환으로 확장 가능하다.

## 5. 저장과 복구

### 기본 저장

Supabase autosave가 기본이다.

저장 대상:

- `content_items`: 원본 콘텐츠 운영 단위
- `content_variants`: 채널별 산출물
- `content_assets`: export 결과
- `publish_logs`: handoff/provider 결과

### 로컬 저장

브라우저 안 저장이면 충분하다.

권장 구현:

- IndexedDB 사용
- content item + variant draft mirror
- autosave 실패 시 조용한 아이콘으로 local-only 상태 표시
- Studio 진입 시 cloud version과 local version 비교
- 사용자가 명시적으로 local restore 가능

localStorage는 긴 글, 카드뉴스 JSON, reels script 구조를 담기에는 약하다.

## 6. Handoff 원칙

1순위 handoff 대상은 n8n이다.

Hub는 실행을 직접 소유하지 않고, 실행 요청과 결과 기록을 소유한다.

n8n은 Content 전용 단일 자동화가 아니라 여러 자동화 recipe 중 하나로 취급한다. Content는 variant type, brand, target channel에 맞는 n8n recipe를 선택해서 handoff한다. 즉, "n8n으로 넘긴다"는 하나의 버튼처럼 보이지만 내부적으로는 newsletter send, card export upload, blog platform handoff, thread queue, reels script package 같은 자동화 경로 중 하나를 탄다.

권장 이벤트:

```text
handoff_requested
handoff_success
handoff_failed
provider_sent
provider_failed
manual_exported
asset_exported
```

n8n handoff payload에는 최소한 다음 정보가 필요하다.

- workspace_id
- content_item_id
- content_variant_id
- automation_recipe_id
- variant_type
- brand_key
- title
- body or structured payload
- export asset ids
- target channel
- correlation_id

## 7. History 우선순위

History는 실패/성공 로그를 가장 먼저 보여준다.

우선순위:

1. 성공/실패 로그
2. handoff/export/publish 이력
3. 제작 이력

권장 표시:

```text
Latest outcome
- n8n handoff failed · missing webhook url · 14:22
- Card news ZIP exported · 14:20
- Newsletter variant updated · 14:18
- Local mirror saved · 14:17
```

큰 타임라인보다 현재 상태를 빠르게 판단하는 status ledger가 먼저다.

## 8. 데이터 모델 매핑

### `content_items`

원본 콘텐츠 운영 단위.

필드:

- title
- source_idea
- status
- next_action
- brand_id or brand_key
- scheduled_at
- published_at
- visibility
- meta

### `content_variants`

채널별 산출물.

variant_type:

- newsletter
- blog_insight
- card_news
- x_thread
- reels_script

body 저장:

- newsletter/blog: markdown + optional html preview cache
- card_news: structured slide JSON
- x_thread: block array JSON
- reels_script: structured scene JSON

### `content_assets`

export 산출물.

asset examples:

- card PNG
- card ZIP
- thread TXT
- reels script package
- HTML preview snapshot

1차 저장소는 Google Drive다.

권장 필드:

- file_name
- mime_type
- size_bytes
- provider: `google_drive`
- storage_path or drive_folder_id
- external_id: Google Drive file id
- target_url: Google Drive share/view URL
- variant_id
- content_id
- export_kind
- checksum

### `publish_logs`

handoff/provider 결과.

필드:

- variant_id
- channel
- provider
- status
- target_url
- external_id
- attempt_count
- correlation_id
- created_at

### `sync_runs`

Engine/n8n/provider 실행 세부 기록.

Content 화면에서는 `publish_logs`를 먼저 보고, 필요한 경우 `sync_runs`로 drill-down한다.

## 9. 브랜드별 템플릿

Card News와 Newsletter는 처음부터 브랜드별 템플릿을 열어둔다.

브랜드 템플릿은 코드에 박아 넣는 고정값이 아니라, 별도 skill/template pack으로 주입할 수 있게 설계한다. 사용자가 이후 제공할 skill 형태와 예시를 기준으로 `brand_key`, `variant_type`, `template_id`, `export_profile`을 읽어 Studio의 template selector에 노출한다.

브랜드 템플릿은 다음을 포함한다.

- tone
- forbidden phrases
- primary channel
- CTA style
- card layout preset
- color preset
- typography preset
- export filename prefix
- Google Drive folder mapping
- n8n automation recipe mapping

초기 UI는 많은 템플릿 관리 화면보다 Studio 안의 template selector가 낫다.

초기 구현은 최소 한 개의 built-in fallback 템플릿을 두되, 실제 운영 템플릿은 사용자가 제공할 skill/template pack을 우선한다.

## 10. 파일명 규칙

export 파일명은 안정적이고 사람이 읽을 수 있어야 한다.

권장 패턴:

```text
YYYY-MM-DD-{brand-key}-{slug}-{variant-type}.{ext}
YYYY-MM-DD-{brand-key}-{slug}-cardnews.zip
YYYY-MM-DD-{brand-key}-{slug}-slide-01.png
```

예:

```text
2026-04-26-moonlight-decision-note-cardnews.zip
2026-04-26-moonlight-decision-note-slide-01.png
2026-04-26-moonlight-decision-note-x-thread.txt
```

## 11. MVP 구현 순서

### Slice 1: 저장 루프

- Studio에서 master draft 저장
- `content_items` 생성/수정
- `content_variants` 생성/수정
- IndexedDB local mirror
- 저장 상태 아이콘
- Queue row 클릭 후 Studio 재진입

완료 기준:

- 새로고침 후에도 draft가 복구된다.
- Supabase 실패 시 local mirror가 남는다.
- Queue에서 같은 콘텐츠로 돌아갈 수 있다.

### Slice 2: Variant Workshop

- 5개 variant type 추가
- Blog/Insight markdown + web article preview
- Newsletter markdown + HTML preview
- X thread block editor
- Reels structured script editor
- Card news structured slide editor

완료 기준:

- 하나의 item 안에 여러 variant를 만들고 전환할 수 있다.
- Blog/Insight는 web article preview를 먼저 제공한다.

### Slice 3: Card News Export

- 브랜드별 card template selector
- 1080x1080 PNG export
- ZIP export
- Google Drive 업로드
- Google Drive file id/share URL을 `content_assets`에 기록
- export history 표시

완료 기준:

- 최소 하나의 브랜드 템플릿으로 PNG/ZIP 산출물이 나오고, Google Drive에서 열 수 있다.

### Slice 4: n8n Handoff

- n8n automation recipe 설정
- handoff dry-run
- handoff request
- `publish_logs` 기록
- 실패/성공 status ledger 표시

완료 기준:

- Hub에서 선택된 n8n recipe로 payload가 넘어가고, 성공/실패가 Content History에 뜬다.

### Slice 5: Distribution Watch

- Publish/Watch surface 추가
- failed handoff retry candidate 표시
- provider status와 sync_runs drill-down

완료 기준:

- 오늘 실패한 콘텐츠 실행을 5초 안에 찾을 수 있다.

## 12. 아직 남은 결정

1. 첫 브랜드 템플릿 skill/template pack의 파일 구조와 예시는 사용자가 별도로 제공한다.
2. n8n은 Content 전용 단일 webhook이 아니라 여러 자동화 recipe 중 하나로 운영한다.
3. export asset은 Google Drive에 업로드하고, `content_assets`에는 Google Drive 메타데이터를 기록한다.
4. Blog/Insight 외부 플랫폼의 1순위는 아직 미정이다.
5. HTML preview는 web article preview를 먼저 구현하고, email-style preview는 Newsletter 강화 단계에서 붙인다.

## 13. 추천 첫 실행

첫 구현은 Newsletter 하나만 저장하는 작은 기능으로 시작하면 부족하다.

추천 첫 실행 단위는 다음이다.

```text
Master Draft
  -> Blog/Insight web article preview
  -> Card News structured draft
  -> X Thread variant
  -> n8n dry-run handoff
  -> success/failure log
  -> IndexedDB local mirror
```

이 단위가 닫히면 Content 탭은 단순 editor가 아니라 운영 루프가 된다.
