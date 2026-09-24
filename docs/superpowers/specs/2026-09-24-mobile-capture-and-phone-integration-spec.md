# 모바일 캡처 & 폰 연동 아키텍처 스펙 (Mobile Capture & Phone Integration)

> 상태: ACTIVE SPEC · 1단계(Engine `phone-events` + MacroDroid + Hub `record-candidates`) 구현 완료, 2단계(고가용성 엣지 큐·PWA Share Target) 구현 (2026-09-24)
> 상위 정본: [`docs/operator-workflow-profile.md`](../../operator-workflow-profile.md) (인지 에너지 1/3, 누락 0건), [`2026-09-24-revenue-four-tabs-design.md`](2026-09-24-revenue-four-tabs-design.md) (오늘 연락 · 기록 후보)
> 실행 가이드: [`docs/guides/galaxy-phone-capture.md`](../../guides/galaxy-phone-capture.md)
> 관계: 텔레그램 등 서드파티 메신저 의존을 완전히 배제하고, 안드로이드(Galaxy) OS 엣지와 상시 가동 Supabase 클라우드 원장 간의 **Local-First WAL(Write-Ahead Log) + 멱등성(Idempotency) 이벤트 버퍼**를 정의한다.

---

## 1. 시스템 설계 철학 (Systems Architecture First Principles)

실리콘밸리 티어-1 분산 시스템의 제1원칙:
> **"Worker(Mac)는 일시 중단(Sleep)될 수 있지만, Cloud Ledger(Supabase)는 365일 생존하며, Edge Client(Galaxy)는 발생한 사건을 로컬에서 절대 분실하지 않는다."**

### 기존 구조의 결함과 안티패턴 해소
1. **단일점 장애(Single Point of Failure)**: 기존 `폰 → Mac Engine(:3001)` 직접 전송은 외출 중 Mac이 잠자기 상태일 때 모든 이벤트가 유실되는 치명적 결함이 있었다.
2. **서드파티 메신저(텔레그램 등) 배제**: 외부 메신저를 큐로 삼는 것은 비인가 토큰 유출 위험, 외부 서비스 다운타임, 데이터 스키마 변조, 알림 공해를 초래하므로 채택하지 않는다.
3. **온디바이스 하드웨어 가속 활용**: 오디오 전체를 클라우드로 전송해 유료 STT API를 호출하는 낭비 대신, 갤럭시 내장 NPU(삼성 키보드/Gboard 실시간 온디바이스 음성인식)를 활용하여 레이턴시 0ms, 비용 $0의 텍스트 전송을 원칙으로 한다.

---

## 2. 3-Tier 분산 토폴로지 (Distributed Topology)

```text
[1. Edge Tier: Galaxy Phone]
   ├─ 센서: 통화 종료(Call Ended), 카카오톡/SMS 알림, 시스템 공유(Share Sheet)
   ├─ 로컬 WAL: MacroDroid Dictionary / PWA IndexedDB (오프라인 버퍼)
   └─ 온디바이스 STT: NPU 가속 음성 키보드 (무지연·무비용 텍스트화)
         │
         ▼ HTTPS POST (결정론적 멱등키 `idempotency_key` 포함)
[2. Ledger Tier: Supabase Cloud (AWS Seoul)]
   ├─ `webhook_events` (Append-Only Event Store)
   ├─ `source = 'phone-capture'` / `source = 'mobile-share'`
   └─ 멱등성 보장: UNIQUE(idempotency_key) ON CONFLICT DO NOTHING
         │
         ▼ Pull / Stream / Query
[3. Control Plane: Mac Desktop (Moonlight Hub & Engine)]
   ├─ Hub `오늘 연락` → [기록할까요] (RecordCandidates)
   └─ Hub `내 작업` → [미분류 캡처함] (Inbox)
```

---

## 3. 이벤트 봉투 및 전송 계약 (Idempotent Event Contract)

모든 엣지 캡처 페이로드는 클라이언트가 계산한 결정론적(Deterministic) 멱등키를 포함하여 네트워크 재시도 시의 중복 저장을 원천 차단한다.

```json
{
  "event_id": "evt_20260924_7f8a9b",
  "idempotency_key": "sha256(type + source_number + timestamp)",
  "source": "galaxy_edge",
  "type": "call | sms | kakao | share_capture",
  "client_timestamp": "2026-09-24T23:15:00.000Z",
  "schema_version": "2026-09-24",
  "payload": {
    "target_name": "김원장",
    "number": "010-1234-5678",
    "duration_seconds": 185,
    "quick_memo": "다음 주 화요일 미팅 일정 확인 요청",
    "promise_hint": "다음 주 화요일"
  }
}
```

* **엣지 재시도 정책**: HTTP 200/201이 반환되지 않으면 폰의 로컬 FIFO 큐에 보관하고 지수 백오프(`10s → 30s → 2m → 10m`)로 재시도.
* **서버 정책**: `idempotency_key` 충돌 시 `status: duplicate` (HTTP 200)로 응답하여 엣지 큐에서 안전하게 제거.

---

## 4. 모바일 네이티브 연동 인터페이스

### ① 안드로이드 시스템 공유 시트 (PWA Web Share Target)
* **표준 명세**: W3C Web Share Target API 채택.
* **매니페스트 선언 (`apps/hub/public/manifest.json`)**:
  ```json
  "share_target": {
    "action": "/dashboard",
    "method": "GET",
    "params": {
      "title": "title",
      "text": "text",
      "url": "url"
    }
  }
  ```
* **인터랙션**:
  1. 카카오톡, 인스타그램, 크롬 브라우저에서 텍스트나 링크를 누르고 **[공유] → [Moonlight]** 선택.
  2. 문라이트 PWA가 단독 앱 모드로 기동되며, URL 쿼리 파라미터를 파싱하여 `GlobalQuickCapture` 드로어를 즉시 팝업.
  3. 운영자는 별도 타이핑 없이 `[할 일 저장]` 또는 `[정리 전 저장]` 1탭으로 완료.

### ② 통화 종료 2초 골든타임 마이크로 다이얼로그 (Call-End Micro Flow)
* **조건**: 통화 시간 15초 이상 + 주소록 매칭 대상.
* **동작**:
  1. 통화 종료 즉시 폰 하단에 반투명 플로팅 입력창 팝업.
  2. 마이크 버튼 터치 후 한마디 음성 입력 ("다음 주 견적서 발송") 또는 프리셋 탭 (`[내일] [3일뒤] [다음주]`).
  3. 5초 무입력 시 자동 소멸하되, 기본 통화 시간과 상대방 정보만 후보로 백그라운드 전송.

### ③ 상단 빠른 설정 타일 (Quick Settings Tile)
* 상단 바 드롭다운의 `[🌙 문라이트]` 타일 터치 시 클립보드 내용을 감지하여 1탭 등록 창 오픈.

---

## 5. 데스크톱 허브 수신 및 배치 (Desktop Landing)

폰에서 유입된 데이터는 무단으로 정본 엔티티(`crm_activities`, `tasks`)를 변소하지 않고, **검토 가능한 2곳의 인박스**로 연착륙한다.

1. **CRM 관련 (전화·문자·카톡)**:
   - `영업·매출` → `오늘 연락` 탭 상단의 **[기록할까요]** (`RecordCandidates`)
   - 캘린더 미기록 미팅과 함께 묶여 원클릭 확인으로 공식 활동 등록.
2. **할 일 및 아이디어 (공유 시트·빠른 메모)**:
   - `내 작업` → **[미분류 캡처함]** (`Capture Inbox`)
   - 드래그 또는 Enter 키보드 액션으로 오늘 할 일 또는 프로젝트 백로그로 할당.
