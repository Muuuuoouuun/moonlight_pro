# 모바일 캡처 & 폰 연동 아키텍처 스펙 (Mobile Capture & Phone Integration)

> 상태: ACTIVE SPEC · 1단계(Engine `phone-events` + MacroDroid + Hub `record-candidates`) 구현 완료, 2~3단계(고가용성 웹훅 버퍼·공유 시트·오프라인 큐) 기획 확정 (2026-09-24)
> 상위 정본: [`docs/operator-workflow-profile.md`](../../operator-workflow-profile.md) (인지 에너지 1/3, 누락 0건), [`2026-09-24-revenue-four-tabs-design.md`](2026-09-24-revenue-four-tabs-design.md) (오늘 연락 · 기록 후보)
> 실행 가이드: [`docs/guides/galaxy-phone-capture.md`](../../guides/galaxy-phone-capture.md)
> 관계: 갤럭시(Android)와 데스크톱 Mac(Moonlight) 사이의 현실적인 OS 보안 경계, Mac 잠자기(Sleep) 시의 웹훅 유실 방지(버퍼링), 폰 내부 정보 공유(Share Sheet, 클립보드, 통화 직후 팝업) 및 데스크톱 정착 흐름을 규정한다.

---

## 1. 배경 및 성공 기준

### 현실과 문제점
1. **모바일 단일 앱 만능주의의 실패**:
   - PWA(웹 앱)는 브라우저 보안 샌드박스로 인해 통화 감지나 타사 앱(카카오톡) 알림에 접근할 수 없다.
   - 일반 네이티브 앱도 안드로이드 OS의 배터리 최적화 정책으로 백그라운드 프로세스가 수시로 종료되며, 무리한 상시 감시는 배터리 소모와 잦은 오류를 유발한다.
2. **Mac 슬립(잠자기) 시 데이터 유실**:
   - 현재 구현(`galaxy-phone-capture.md`)은 폰의 MacroDroid가 Mac Engine(`:3001`)으로 직접 HTTP POST를 쏜다.
   - 그러나 운영자가 이동 중이거나 외출 중일 때 Mac은 잠자기(Sleep) 상태이거나 네트워크가 분리되어 있어, 이 시점의 통화·문자·카톡 사건이 버려지는 한계가 있다.
3. **입력 마찰로 인한 누락**:
   - 밖에서 좋은 아이디어나 고객 요구사항이 생겨도, "앱을 찾아서 켜고, 로그인하고, 카테고리를 고르고, 입력하는" 과정에 5초 이상 걸리면 기록을 미루게 되고 결국 잊힌다.

### 성공 기준 (Core Job-to-be-Done)
* **"밖에서는 생각 없이 1~2초 만에 던지고, 정리는 데스크톱 큰 화면에서 1클릭으로 끝낸다."**
* 밖에서 발생한 생각, 통화 메모, 카톡 문의, 할 일이 **Mac의 전원 상태나 네트워크와 무관하게 100% 분실 없이 보존**되어야 한다.

---

## 2. 웹훅 & API 고가용성 버퍼링 아키텍처

Mac이 꺼져 있어도 모바일 캡처 내용이 유실되지 않도록 **3중 수신 버퍼링(Tri-layer Ingestion Buffer)** 체계를 설계한다.

```text
[갤럭시 스마트폰]
   │
   ├─ A. 텍스트/링크 공유/빠른 입력 ──▶ [Supabase Cloud REST API] (24/7 상시 대기)
   │                                       │
   ├─ B. 통화/카톡/문자 알림 ───────▶ [MacroDroid 로컬 오프라인 큐]
   │                                       │ (연결 성공 시 Engine 전송 / 실패 시 재시도)
   │                                       ▼
   └─ C. 음성(PTT)/사진/장문 ──────▶ [Telegram 비공개 봇 버퍼] (클라우드 대기)
                                           │
   ┌───────────────────────────────────────┴─────────────────────────────┐
   │                                                                     ▼
[Mac 데스크톱 (Moonlight 실행 시)] ──▶ Supabase 원장 & Engine 수신
   │
   ├─ 고객/통화/일정 관련 ──▶ 허브 `오늘 연락` → [기록할까요] (RecordCandidates)
   └─ 일반 메모/할 일/아이디어 ──▶ 허브 `내 작업` → [미분류 캡처함] (Inbox)
```

### 계층 1: Supabase Cloud REST 직접 인제스트 (Cloud-First Primary)
* **원리**: 문라이트의 메인 원장인 Supabase는 서울 리전(`ap-northeast-2`)에 24시간 365일 상시 가동 중이다.
* **적용**: PWA 빠른 입력 창, 모바일 숏컷, 공유 시트에서 발생한 텍스트·링크 캡처는 Mac을 거치지 않고 Supabase의 `webhook_events` 또는 `journal_entries`로 직접 HTTPS REST 요청을 보낸다.
* **보안 경계**:
  - 관리자 전체 권한(`service_role`) 키를 폰에 노출하지 않는다.
  - 전용 `anon` 키 + RLS(Row Level Security) 정책을 적용하여, `source = 'mobile-quick-capture'` 형태의 **추가(INSERT)만 가능하고 타 데이터 읽기/수정은 불가능한 쓰기 전용 게이트**로 운영한다.

### 계층 2: MacroDroid 로컬 오프라인 큐 (On-Device Fallback Queue)
* **원리**: 통화 종료, SMS, 카카오톡 알림처럼 MacroDroid가 감지한 시스템 이벤트의 유실 방지.
* **동작 규칙**:
  1. MacroDroid가 Engine(`https://<Mac>.<tailnet>.ts.net/api/intake/phone-events`)으로 HTTP 요청 전송.
  2. **성공 (HTTP 200/201)**: 정상 종료.
  3. **실패 (HTTP 에러, 타임아웃, Mac 오프라인)**: 사건 페이로드를 버리지 않고 MacroDroid 로컬 배열 변수 `[v=offlinePhoneQueue]`에 JSON 문자열로 밀어 넣음(Push).
  4. **재시도 (Flush)**: 15분 주기 또는 와이파이 연결 시 큐에 대기 중인 사건들을 순차 재전송하고 성공 시 비움. (최대 보관 48시간).

### 계층 3: 텔레그램 비공개 봇 버퍼 (High-Reliability Conversational Buffer)
* **원리**: 텔레그램 서버가 영구 무료 무중단 메시지 큐 역할을 수행.
* **동작 규칙**:
  - 이동 중 운전 중일 때 폰에서 비공개 1:1 봇 방으로 음성 메시지(PTT)나 사진(명함, 화이트보드) 전송.
  - Mac Engine이 기동될 때 Telegram Bot API의 `getUpdates` 또는 롱 폴링으로 밀려 있던 메시지를 읽어와 Whisper STT 및 구조화 변환 후 Supabase 원장에 적재.

---

## 3. 휴대폰 내부 정보 공유 & 캡처 메커니즘

운영자가 스마트폰을 조작할 때 인지 부하를 최소화하는 안드로이드 OS 연동 4대 인터페이스:

### ① 안드로이드 시스템 공유 시트 (Share Sheet 연동)
* **사용자 경험**: 카카오톡 문의 메시지, 인스타그램 DM, Threads 글, 웹 기사를 읽다가 텍스트를 선택하고 **[공유] → [Moonlight]**를 탭하면 끝.
* **구현 방식 (PWA Web Share Target)**:
  - `apps/hub`의 PWA 매니페스트(`manifest.json`)에 `share_target` 정의:
    ```json
    "share_target": {
      "action": "/api/hub/capture/share",
      "method": "POST",
      "enctype": "application/x-www-form-urlencoded",
      "params": {
        "title": "title",
        "text": "text",
        "url": "url"
      }
    }
    ```
  - 공유 시 백그라운드 팝업에서 `[할 일]` / `[고객 문의]` / `[아이디어]` 라디오 버튼 3개 중 하나만 누르면 문라이트 인제스트 완료.

### ② 통화 종료 직후 10초 골든타임 팝업 (Call-End Micro Dialog)
* **사용자 경험**: 고객과 통화를 끊는 즉시 폰 화면 하단에 2초 동안 방해되지 않는 반투명 다이얼로그 팝업.
  ```text
  ┌──────────────────────────────────────────┐
  │ 📞 [해솔학원 김원장] 3분 40초 통화 완료   │
  │ 한 줄 메모: [ 다음 주 화요일 견적 발송 ] │
  │ 다음 연락: [내일] [3일뒤] [다음주] [저장] │
  └──────────────────────────────────────────┘
  ```
* **동작 규칙**:
  - 10초 동안 아무 입력이 없으면 다이얼로그는 자동으로 닫히고, 순수 통화 메타데이터만 `record-candidates`로 전송.
  - 한 줄이라도 치고 [저장]을 누르면 메모가 포함된 기록 후보로 즉시 전송.

### ③ 상단 빠른 설정 타일 (Quick Settings Tile)
* **사용자 경험**: 갤럭시 상단 바를 쓸어내려 `[🌙 문라이트]` 타일 터치.
* **동작 규칙**:
  - 클립보드에 방금 복사한 텍스트가 있으면: *"클립보드 내용을 문라이트에 등록할까요?"* 1탭 승인.
  - 클립보드가 비어 있으면: 음성 녹음 또는 1줄 타이핑 다이얼로그 즉시 팝업.

### ④ 한국 갤럭시 통화녹음(.m4a) 취급 원칙
* **원칙**: 모든 통화 녹음 파일(수백 MB)을 무조건 자동으로 전송·분석하지 않는다 (네트워크 비용, 배터리 소모, 불필요한 AI API 비용 방지).
* **선택적 캡처**: 정말 중요한 상담/미팅 통화인 경우, 통화 종료 후 음성 녹음 앱 목록에서 해당 통화 녹음 파일을 **[공유] → [Moonlight 음성 분석]**으로 명시 전송할 때만 Whisper/Gemini STT 및 3줄 요약 추출을 실행한다.

---

## 4. 데스크톱 허브 연착륙 (Desktop Landing UX)

폰에서 들어온 데이터는 운영자의 명시적 승인 없이 기존 메인 원장(`crm_activities`, `tasks`)을 바로 수정하지 않는다. **항상 전용 대기함으로 먼저 안착**한다.

| 캡처 유형 | 데스크톱 허브 도착 화면 | 사용자 확인 동작 |
|---|---|---|
| **통화 / 카톡 / 문자** | `영업·매출` → `오늘 연락` 탭 상단 **[기록할까요]** (`RecordCandidates`) | [기록 남기기] 1클릭 → 시간·고객 자동 매칭된 시트에서 확인 저장 |
| **공유 시트 / 클립보드 할 일** | `내 작업` → **[미분류 캡처함]** (Inbox) | 기한/프로젝트 지정 후 오늘 작업으로 승격 |
| **소재 / 아이디어** | `브랜드·콘텐츠` → **[아이디어함]** | 가공 채널(Threads/Instagram) 선택 |

---

## 5. 단계별 실행 계획 (Implementation Roadmap)

1. **Phase 1 (현행 안정화 & 오프라인 큐)**:
   - MacroDroid 통화 종료 매크로에 실패 시 재시도 로컬 큐(`[v=offlinePhoneQueue]`) 추가.
   - 통화 종료 직후 1줄 메모 다이얼로그 액션 추가.
2. **Phase 2 (PWA & Web Share Target)**:
   - Hub PWA 매니페스트에 `share_target` 선언 및 `/api/hub/capture/share` 엔드포인트 개설.
   - 갤럭시 Chrome에서 "홈 화면에 추가" 후 카톡/브라우저 공유 시트 연동 검증.
3. **Phase 3 (상시 클라우드 버퍼 / 텔레그램)**:
   - 외출 시 완벽한 음성(PTT) 및 오프라인 보존을 위한 텔레그램 비공개 봇 수신 리스너 연결.
