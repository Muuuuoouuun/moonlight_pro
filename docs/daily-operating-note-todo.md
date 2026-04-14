# Daily Operating Note Todo

이 문서는 `캘린더 + 일정 + 데일리 인사이트 + 메모 + Obsidian 연결`을
Com_Moon Hub 안에서 실제 구현 순서로 내리기 위한 실행용 체크리스트다.

원칙:

- 캘린더 앱을 따로 만드는 게 아니라, 하루를 정리해 주는 운영 노트를 만든다.
- `Hub`를 source of truth로 두고, `Obsidian`은 처음엔 export destination으로만 다룬다.
- 양방향 sync보다 `daily usefulness`가 먼저다.
- 일정, 메모, 프로젝트 변화, 루틴 체크가 한 화면에서 만나야 한다.

## Product Goal

- 아침에는 오늘 무엇을 밀어야 하는지 바로 보인다.
- 낮에는 생각과 관찰을 10초 안에 메모로 남길 수 있다.
- 밤에는 오늘 한 일, 배운 점, 내일 첫 액션이 자동으로 정리된다.
- 원하면 같은 내용을 Markdown으로 Obsidian에 보낼 수 있다.

## P0

### 1. Daily Note 화면 신설

상태:
- `todo`

목표:
- `/dashboard/work/daily`에서 하루 운영 정보를 한 화면으로 본다.

MVP:
- 오늘 일정
- 오늘 할 일 3개
- 최근 프로젝트 변화
- 최근 메모
- 오늘의 첫 액션

후속:
- morning / midday / evening 모드 분기
- founder snapshot

### 2. Quick Capture 메모 입력

상태:
- `todo`

목표:
- 허브 안에서 메모를 10초 안에 남긴다.

MVP:
- 짧은 텍스트 입력
- 저장 성공 피드백
- 프로젝트 연결 optional
- 태그 optional
- 모바일에서도 바로 입력 가능

후속:
- 음성 메모
- 스크린샷/링크 첨부

### 3. Shared calendar horizon 정리

상태:
- `todo`

목표:
- Google Calendar 이벤트와 허브 내부 일정성 데이터를 같은 타임라인으로 본다.

MVP:
- Google Calendar events
- `projects.due_at`
- `tasks.due_at`
- `routine_checks`
- 최근 `project_updates` 기반 일정 문맥 반영

후속:
- 일정별 우선순위 tone
- 프로젝트와 이벤트 자동 연결

### 4. Morning Brief 생성

상태:
- `todo`

목표:
- 아침 첫 화면에서 오늘 판단에 필요한 것만 보여준다.

MVP:
- 오늘 일정 요약
- 어제 미완료
- 오늘 리스크 2개
- 오늘 첫 액션 1개

후속:
- 개인화된 brief
- 요일별 브리프 포맷 분기

## P1

### 5. Evening Review 초안 생성

상태:
- `todo`

목표:
- 밤에 오늘의 활동을 자동 회고 초안으로 만든다.

MVP:
- 오늘 완료한 것
- 오늘 막힌 것
- 오늘 배운 점
- 내일 첫 액션

후속:
- 회고 템플릿 선택
- AI 문장 다듬기

### 6. Insight tagging

상태:
- `todo`

목표:
- 메모를 그냥 쌓지 않고 재사용 가능한 인사이트로 바꾼다.

MVP:
- `project`
- `content`
- `lead`
- `risk`
- `idea`
- `follow-up`

후속:
- 자동 태그 추천
- 반복 패턴 감지

### 7. Obsidian Markdown export

상태:
- `todo`

목표:
- 허브의 daily note를 Markdown으로 Obsidian vault에 보낸다.

MVP:
- 파일명 `YYYY-MM-DD.md`
- Morning Brief
- Timeline
- Quick Memos
- Evening Review

후속:
- export template presets
- 특정 vault/folder 선택

## P2

### 8. Weekly pattern view

상태:
- `todo`

목표:
- 한 주 단위로 일정과 메모에서 반복 패턴을 본다.

MVP:
- 집중 잘 된 시간대
- 자주 밀린 일정 유형
- 반복 등장한 메모 태그
- 프로젝트/콘텐츠/리드 전환 패턴

후속:
- weekly briefing
- 개선 제안 자동 생성

### 9. Daily automations

상태:
- `todo`

목표:
- 사람이 누르지 않아도 아침/저녁 정리 루프가 돈다.

MVP:
- 오전 브리프 생성
- 저녁 리뷰 초안 생성
- 일정 종료 후 메모 프롬프트

후속:
- 주간 회고 자동 생성
- Slack / Telegram 알림

### 10. Obsidian selective import

상태:
- `todo`

목표:
- 허브 밖에서 쓴 메모 일부를 허브 문맥으로 다시 읽는다.

MVP:
- 지정 폴더만 import
- frontmatter 기반 매핑
- read-only ingest

후속:
- 양방향 sync 검토
- 충돌 해결 규칙

## Open Questions

- `notes`와 `memos`를 통합할지, 역할을 분리할지
- daily note를 저장형으로 둘지, 실시간 조합형으로 둘지
- Obsidian export를 파일 시스템 직접 쓰기로 할지, 다운로드 방식으로 둘지
- 저녁 회고를 rule-based로 시작할지, AI draft로 바로 갈지

## Exit Rule

다음 라운드에서 이 영역 작업을 시작할 때는 새 기능을 넓게 벌리지 말고,
이 문서의 가장 높은 `todo`부터 처리한다.
