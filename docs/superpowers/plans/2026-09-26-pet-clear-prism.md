# Clear prism and glyph contrast

**승인:** 2026-09-26, 3번 프리즘 시안 → 반사 띠 10% 축소 → 작은 글자 보강 목업 → 운영자 `진행`.
**관계:** 2026-09-25 continuous-glass 설계의 공통 HUD 읽기 면을 대체한다. 기존 레이아웃·데이터·입력·드래그 계약은 유지한다.

## 구현

- [x] `GlassPanel.swift`: companion의 `.hudWindow` 덧면을 제거한다. 배경은 네이티브 `.clear`, 본문은 형제 호스트로 유지한다. 접근성은 `.regular` + 기존 불투명 색상층을 유지한다.
- [x] `GlassTextRendering.swift`: TextRenderer로 글리프 그림자만 먼저 그리고, 원본 글자는 필터 없이 그린다. 표면 전체 shadow는 금지. 네이티브 입력은 배경을 숨긴 입력 뷰에만 짧은 그림자를 적용한다.
- [x] `CalendarCompanionContent.swift`, `CompanionPanelView.swift`, `CaptureContent.swift`: 작은 날짜·메타·하단 문구를 medium/semibold로 보강한다. 글자는 화이트 계열을 유지한다.
- [x] `GlassOptics.swift`, `GlassOptics.metal`: 반사 곡면 폭 10→9pt. 광학 반사 띠 위치·폭도 같은 비율로 축소하고 중앙 알파 0을 유지한다.
- [x] `GlassLabView.swift`: 실제 companion과 같은 글자 보호 방식을 비교 화면에도 적용한다.

## 검증

- [x] `swift build -j 2` 및 `swift run -j 2 MoonlightPetPreview --self-check`: 실제 Metal 출력·중앙 투명·접근성·드래그 해제 검사.
- [x] `.app` 실행 뒤 할 일·Office·재질 비교 창 시각 확인. 캡처는 독립 창을 흰 바탕에 합성하므로 실제 다른 앱 배경에 대한 명암 평가는 별도로 남긴다. 재질 비교 창의 자체 명암 배경에서는 글자와 중앙 투명도를 확인했다.
- [x] 변경 파일만 커밋하고 공유 브랜치에 통합. 메인 경로에서 실행 후 작업 폴더 정리.

## 구현 경계

실제 다른 앱 배경의 굴절은 NSGlassEffectView가 담당한다. 공개 API에는 사용자 지정 IOR/굴절 맵이 없으므로 Metal 반사 띠 조정과 구분한다. 실험실의 자체 배경 굴절을 데스크톱 전체 굴절 조정으로 설명하지 않는다. 화면 캡처 권한이나 private API를 추가하지 않는다. 생성 목업과 픽셀 단위 동일성을 주장하지 않는다.

참고: [Apple TextRenderer](https://developer.apple.com/documentation/swiftui/textrenderer), [NSGlassEffectView contentView](https://developer.apple.com/documentation/appkit/nsglasseffectview/contentview).

## 검증 기록

- Swift build 및 self-check 통과. Metal 중앙 알파 0, 색 분리 peak 18/255, 광학 실험실 중앙 배경 drift 0.00/255. 실제 데스크톱 굴절률 측정값은 아니다.
- 새 텍스트 래스터 검사 통과: 1x/2x, 원본 흰 글자 내부 보존, 글자 주변에만 그림자, 그림자 off와 기본 Text 렌더 일치.
- 실제 CUA 캡처: 할 일(실제 Hub 항목), Office, 1040×660 Glass Lab. 큰 검정 읽기 띠가 없는 것을 확인. Lab 명암 배경 위 작은 설명·하단 읽기 확인.
- 빌드된 .app 실행 파일 경로와 프로세스 확인. 별도 업무 데이터 쓰기·AI 전송 없음.
- 생성 이미지와 네이티브 배경이 동일하지 않으므로 픽셀 일치·모든 배경 WCAG AA 달성은 주장하지 않는다. 실제 다른 창의 배경은 macOS clear 재질이 처리한다.

### 통합 확인

- 구현 커밋 `0e4df091`을 작업 브랜치에 fast-forward 통합하고, 메인 경로의 `.app`를 새로 빌드·실행했다(pid 28743, 실행 파일 일치 확인).
- 통합 뒤 self-check 재통과. 별도 작업 폴더 제거 완료.
- 최종 실행본에서 할 일 입력→검사용 입력 지우기(저장 없음)→일정 선택→⌘2 메모 가로 전환→⌘3 일정 복귀를 CUA로 확인했다. 실제 할 일 개수와 메모 초안은 유지했다. 일정 위젯을 열어 둔 상태로 전달한다.
