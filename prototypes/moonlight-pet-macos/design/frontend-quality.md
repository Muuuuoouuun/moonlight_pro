# 펫 위젯 프론트 품질 검토

2026-09-24 · 네이티브 목업 · 승인된 Today / Memo / Focus 시안 반영

## 승인 시안 적용 후 추가 검증

현재 구현은 [승인 스펙](../../../docs/superpowers/specs/2026-09-24-pet-approved-glass-design.md)을 따른다. 아래 기존 8.0점은 이전 Edge Spine 단계의 정성 평가이며 이번 변경의 새 점수로 재사용하지 않는다.

- **재질:** 밝은 실버 외관의 네이티브 regular 한 층, 1px 빛 반사 윤곽, 8pt 그림자 여백. Clear와 비교했으나 밝은 배경에서 글자 대비가 부족해 채택하지 않았다. 앱 단독 캡처는 창 뒤 배경을 포함하지 않으므로 투과·굴절량을 입증하는 자료로 쓰지 않는다.
- **구조:** 할 일·일정은 336pt 세로형, 메모는 560pt 가로형. 헤더의 두 탭과 더보기로 정리하고 목록은 평평한 행으로 표현한다. 실제 앱에서 ⌘1/2/3/6 전환과 한 번 클릭·두 번 클릭·위젯 고정을 확인했다.
- **집중:** 짙은 불투명 전체 화면 위에 펫과 중앙 타이머, 진행선, 중지·Esc 안내를 배치했다. 실제 시작→중지 확인→펫 복귀를 검증했다. 이번에는 Esc 장시간 누름과 다중 화면을 다시 실기 검증하지 않았다.
- **자산:** 아홉 투명 배경 자산의 알파를 검사했다. 블래키 일자 앞머리와 에브이 뒤 묶음 머리를 확인했다. 추가 지시에 따라 기본 52pt 대기 아이콘은 원본 얼굴로 복원하고, 펼친 위젯의 72pt·집중의 80pt 포즈만 투명 배경으로 유리 상단에 배치했다. 실제 대기→펼침→가로 메모 전환을 확인했다.
- **저장:** 격리 UserDefaults SelfCheck로 기존 기록·메모 자동 저장·할 일 초안 재실행 복원, 세로↔가로 앵커, 타이머 고정 총시간·진행률을 검사했다. 실사용 기록을 테스트 레코드로 덮어쓰지 않는다.
- **수정한 회귀:** 더블 클릭 때 숨겨진 빠른 바가 위젯 입력 포커스를 가져가던 경합을 실제 타이핑으로 재현했다. 현재 보이는 패널만 지연된 포커스를 요청하도록 바꾼 뒤 첫 입력을 확인하고 시험 초안을 비웠다. Hub 설정에서 ⌘1로 같은 모드에 복귀하는 동작도 확인했다.
- **범위:** 일정은 실제 주간 날짜와 미연결 안내만 표시한다. Hub 상세는 브라우저에서 이어지며 자동 동기화나 네트워크 수준의 사이트 차단을 구현했다고 표시하지 않는다.

## 이전 단계 평가

정성 디자인 평가다. 10점은 밝고 어두운 배경·접근성 설정·다중 화면까지 일관되게 확인한 수준으로 잡았다. 아래 값은 이번 코드 검토와 실제 macOS 조작·캡처를 바탕으로 한 판단이며, 벤치마크나 사용자 조사 결과가 아니다.

| 항목 | 현재 평가 | 근거 / 한계 |
| --- | --- | --- |
| 글래스 재질 | 7.5 / 10 | 시스템 regular 재질 한 층으로 정리. 실제 배경의 명도 경계·흐린 내용이 비치고 전경 글자는 선명하다. 단색 배경에서는 넓은 회색 면이 여전히 보이며 굴절량은 측정하지 않았다. |
| 클릭·드래그 반응 | 8.5 / 10 | 첫 클릭, 누름 피드백, 이동 핸들 검증. 194pt 드래그에 창 Y가 580→386으로 이동. FPS·입력 지연은 측정하지 않았다. |
| 레이아웃 전환 | 8.5 / 10 | 탭 고정, 선택 표시 이동, 본문/창 크기 전환. 실제 할 일↔메모 왕복과 초안 유지 확인. 최소 화면·음수 좌표 화면은 계산 검증이고 실장비 다중 화면 검증은 남았다. |
| 키보드·접근성 | 7.5 / 10 | 입력 포커스·⌘1/2 전환·접근성 위로 이동 확인. 둥근 입력 포커스, ⌘S, 시스템 대비/모션 대응 구현. VoiceOver 전체 탐색과 접근성 설정을 바꾼 실화면 검증은 남았다. |

동일 가중 평균 **8.0 / 10**. 실제 성능 점수로 인용하지 않는다. 이전 상태의 동일 절차 측정이 없으므로 이전 종합 점수를 소급해서 만들지 않았다.

## 적용 판단과 출처

- [Apple Meet Liquid Glass](https://developer.apple.com/videos/play/wwdc2025/219/): regular의 가독성·접근성 적응, 겹치는 글래스 대신 얇은 상부 채움, 조작과 연속되는 움직임을 기준으로 삼았다. 임의 틴트나 자체 광학 셰이더를 넣지 않았다.
- [NSGlassEffectView](https://developer.apple.com/documentation/appkit/nsglasseffectview): AppKit 창 경계에 배치하고 정식 `contentView`로 SwiftUI를 넣는다. 실제 설치된 SDK 헤더로 지원 속성을 확인했다.
- [NSView acceptsFirstMouse](https://developer.apple.com/documentation/appkit/nsview/acceptsfirstmouse(for:)): 활성화용 첫 클릭부터 조작할 수 있게 네이티브 클릭 뷰와 호스트에 적용했다.
- [LiquidGlass 공개 프로젝트](https://github.com/metneo/LiquidGlass): 최신 OS에는 시스템 재질, 이전 OS에는 폴백을 사용하는 방식을 비교했다. 외부 코드를 복사하거나 라이브러리를 추가하지 않았다.
- UI/UX Pro Max 검색: 목적에 맞는 공통 모션 토큰, 장식용 무한 애니메이션 배제, SwiftUI FocusState 패턴을 참고했다.

## 검증 기록

- SwiftPM 빌드 및 고립된 UserDefaults SelfCheck 통과: 최초 드래그 임계값, 연속 0.5pt 이벤트, 반대 방향 이동, 드래그 종료, 창 기준점, 화면 경계, 기존 할 일·메모·캐릭터 저장.
- 실제 앱: 한 번 클릭 빠른 바와 입력 포커스, 두 번 클릭 전용 위젯, 할 일↔메모 클릭·⌘1/2 전환, 미저장 입력 왕복 유지, 드래그, 접근성 24pt 이동. 시험 입력은 저장하지 않고 빈 초안으로 복원했다.
- 실제 데스크톱 전체 캡처로 `popover 0.78 + clear`와 `regular` 단독 재질을 같은 위치에서 비교했다. 현재 단일 재질은 과도한 밝은 안개가 줄고 글자 대비가 명확하다. 일반 앱 창만 캡처하면 창 뒤 배경이 빠지므로 그 이미지 하나로 투과 여부를 판단하지 않았다.
- 병합 후 실제 작업 경로에서 다시 빌드·실행 바이너리 일치·단일 프로세스·SelfCheck를 확인했다. 최종 앱에서 빠른 바, 일정 세로형, 전용 할 일 위젯을 다시 열어 확인했다.
- 비교 캡처는 임시 로컬 파일로만 보관했다. 다른 앱의 화면이 포함되므로 저장소 문서에 넣지 않았다.

## 남은 한계

macOS 14~25 폴백, 밝은 OS 외관으로 변경한 상태, VoiceOver 전체 동선, 대비 증가·투명도/동작 줄이기 실화면, 다중 모니터·Spaces는 이번 실화면 검증 범위 밖이다. 성능·광학 품질을 더 수치화하려면 프레임 프로파일과 배경별 대비 측정이 필요하다.

## Optical glass refinement — 2026-09-24

- Native glass is retained for desktop backdrop compositing. The old uniform outer gradient is replaced by an event-driven Metal bevel/specular rim; its center is exactly transparent. Focus card shares the same edge renderer.
- Added `--glass-lab`: identical analytic silver-fold/grid backgrounds, native material on the left, refracted background on the right. Lens strength/bevel are adjustable. Custom backdrop luminance is compressed for readable dark text. The lab never stores records.
- GPU verification runs the production Metal pipeline offscreen: compilation, clipped corner, visible rim, premultiplied alpha, transparent center, Retina coordinates, and edge-only refraction changes. Final calibration run observed 546 changed edge pixels with the flat center unchanged. This is a rendering assertion, not a design quality score.
- Code review fixed app-wide shortcut leakage into the new lab and changed readback to a private texture plus aligned shared-buffer blit. Apple Silicon run passed; Intel/AMD hardware execution was not available.
- Native CUA verification: one-click quick panel and double-click perched widget each accept the first typed character; memo switches wide and schedule switches tall; Escape returns to the original portrait. Temporary test characters were removed and the user's existing task was preserved.
- Native CUA comparison: grid switch and bevel slider change the output. A clipboard timeout exposed missing Cocoa edit-menu routing in the accessory app; adding standard responder-chain Edit commands fixed Korean paste and Cmd+A/Delete in the lab.
- Limits: window-only screenshots do not capture the desktop behind floating panels, so they are not proof of desktop transmission quality. The in-window lab does show its full owned background. No claim of screenshot-identical quality or measured FPS is made. macOS Reduce Transparency/Increase Contrast are respected by the custom shader and native material; system preferences were not changed during QA.


## Clear material correction — 2026-09-25

User rejected the milky appearance. Floating panels now default to NSGlassEffectView.clear (regular only for Reduce Transparency/Increase Contrast). The custom lab removes its whole-panel white floor and center blur. The earlier contrast-compression choice above is superseded. The initial one-point content halo was removed in the subsequent text correction; the glass itself has no added white sheet.

GPU backdrop-preservation test failed against the previous implementation (75.42/255 mean drift), passed after correction (0.00/255). Native comparison inspection confirms transmitted background patterns and working input. A transparent panel over a plain white background naturally remains white; its appearance must be judged over the actual background, not a window-only screenshot that omits the desktop.

## Sharp text correction — 2026-09-25

The operator's screenshot showed thick headings and outlined small text. Removing the full-content light shadow reduced the outlines. Native lab headings remained distorted until the SwiftUI content host became a sibling above the glass material and edge renderer. Native-vs-Metal inspection then showed sharp headings and Korean field input. This preserves clear material, accessibility material switching, foreground geometry and first-mouse handling. Text contrast over arbitrary dark desktop backgrounds is a separate remaining limitation; this correction does not claim universal contrast.

## White text and character tint — 2026-09-25

The operator subsequently chose white-family text and subtle character-colored translucent panels. All three floating hosts observe the selected character; the foreground host is preserved during updates. The theme wash attenuates transmitted lettering and supports white text. Input/action fills use a separate dark token. This deliberately reduces body transparency without adding a white haze or glyph halo. Sylveon's tint was first strengthened to rose pink, then softened to a lighter blush pink after live operator feedback.

Native/Metal lab inspection confirmed the revised pink tint, transmitted folds, sharp title/body text and Korean paste in the native field. The lab picker is local and does not modify the saved pet. Shader/self-check results remain valid for the underlying optics; they do not measure contrast of the new wash. The wash is a visual calibration, not a claim of WCAG compliance over every desktop background.

## Clear resting state restored — 2026-09-25

The operator rejected the permanent colored body above. Default and typing now use zero wash opacity; only an active press/drag shows character color, with Sylveon's interaction wash reduced to 60%. Release, key loss, app deactivation and detachment clear the tint. A timer exists only during the press to cover mouse-up consumed inside native tracking loops. Accessibility solid mode still takes priority. The material lab has an explicit preview switch, off by default, for inspecting the temporary color without holding the pointer.

Build and self-check passed, including the new press/release-to-clear state regression. Native widget inspection showed the resting body without the prior persistent pink fill. These checks do not establish contrast over every desktop image or an exact match to the native compositor's inactive appearance.
