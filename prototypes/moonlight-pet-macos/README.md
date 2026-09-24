# Moonlight Pet Preview

macOS 네이티브 사용감 확인용 독립 목업이다. Hub 운영 데이터와 연결하지 않는다.

[승인 시안 적용 스펙](../../docs/superpowers/specs/2026-09-24-pet-approved-glass-design.md)이 현재 레이아웃의 기준이다. [four-states.svg](design/four-states.svg)는 초기 배치 참고용으로 남긴다.

## 실행

macOS 14 이상과 Swift 5.9 이상이 필요하다. macOS 26 Liquid Glass로 빌드하려면 해당 SDK가 필요하다.

```bash
cd prototypes/moonlight-pet-macos
./script/build_and_run.sh --verify
```

## 조작

오른쪽 가장자리의 펫을 한 번 누르면 빠른 기능을 연다. 두 번 누르거나 헤더의 핀을 누르면 지속 위젯으로 바뀐다. 할 일·일정은 세로형 `오늘`, 메모는 가로형 입력면, 집중은 별도의 전체 화면으로 구성한다. 더보기에서 Office·Council·집중·Hub 주소 설정으로 이동한다.

빠른 기능 창은 그림자 여백을 포함해 할 일 336×504pt, 일정 336×484pt, 메모 560×300pt다. 펼친 지속 위젯은 캐릭터가 위로 올라오는 투명 공간 54pt를 더해 각각 558·538·354pt 높이를 쓴다. 전환할 때 창의 위쪽·오른쪽 기준점을 유지하며 화면 경계를 넘지 않게 보정한다. 헤더 핸들로 위아래 이동하거나 접근성 이동 동작을 쓸 수 있다. 할 일 행 전체를 눌러 완료하며 삭제는 우클릭 메뉴에 있다.

| 단축키 | 동작 |
| --- | --- |
| ⌃⌥M | 어느 앱에서든 빠른 기능 열기 |
| ⌘1 / ⌘2 / ⌘3 | 할 일 / 메모 / 일정 |
| ⌘4 / ⌘5 / ⌘6 | Office / Council / 집중 설정 |
| ⌘Return | 현재 기능을 Hub에서 열기. 메모는 아래의 Council 동작 |
| ⌘S | 메모 저장. 자동 저장도 적용됨 |
| Esc | 패널 접기. 집중 중에는 1.3초 길게 눌러 중지 확인 |

메모의 `Council에서 이어서`는 내용을 클립보드에 복사하고 Council을 브라우저에서 연다. AI에게 자동 전송하지 않는다. 기본 Hub 주소는 `http://127.0.0.1:3000`이며 더보기의 `Hub 주소 설정`에서 바꾼다.

## 펫·재질·움직임

펫을 우클릭하면 이브이와 진화체 아홉 캐릭터 중 하나를 선택한다. 기본 대기 아이콘과 짧은 메시지에는 처음 제공된 얼굴 이미지를 쓴다. 두 번 눌러 펼친 위젯과 집중 모드에서는 팔을 걸친 별도 투명 배경 캐릭터가 유리 상단에 올라온다. 원 테두리는 없다. 블래키는 추가 제공된 일자 앞머리, 에브이는 뒤로 묶은 머리를 살린 자산이다. 원본 이미지는 보존한다. 기본값은 글레이시아이고 선택은 이 Mac에 저장된다. 메뉴 막대의 달 아이콘에는 선택한 펫이 나오는 `짧은 메시지 보기`도 있다.

macOS 26에서는 창 경계의 `NSGlassEffectView(.clear)`가 배경 재질을 처리한다. 2026-09-25 운영자 결정에 따라 반투명 본문에는 캐릭터별 색이 은은하게 들어가고, 글자·아이콘은 화이트 계열이다. 투명도 감소·대비 증가 설정에서는 `.regular`와 불투명 테마 바탕을 사용한다. 빛 반사 윤곽과 그림자 여백을 분리하고 입력·버튼에는 얇은 중립 채움만 둔다. 글자와 입력창은 유리 위의 별도 호스트에 그려 번짐을 피한다. 이전 macOS는 `NSVisualEffectView(.popover, .behindWindow)`를 사용한다.

펫은 호버·누름·해제에 작게 반응한다. 패널과 본문·선택 표시가 함께 전환되며 무한 장식 모션은 없다. macOS 동작 줄이기를 켜면 장식적 전환은 즉시 완료된다. [프론트 품질 평가 및 검증](design/frontend-quality.md)에 적용 근거와 검증 범위를 기록했다.

## 저장과 연결 범위

할 일과 메모는 이 Mac의 목업 저장소에만 저장된다. 메모는 입력 즉시 저장하고 할 일 입력 초안도 재실행 때 복원한다. 짧은 메시지는 저장된 로컬 할 일/메모 상태를 요약한다. 실제 Hub 할 일/메모 및 AI 알림과 동기화되지 않는다. 일정은 현재 날짜·실제 주간 날짜와 미연결 상태를 표시하며 예시 일정을 넣지 않는다. 일정·Office·Council의 상세 작업은 브라우저에서 이어진다.

집중 모드는 각 화면 위에 불투명 차단 창을 띄우고 앱 전환·Dock·메뉴 막대를 숨긴다. `중지`를 누른 뒤 확인하거나 `Esc`를 1.3초 누르면 중지 확인이 열린다. macOS 시스템 UI와 모든 Spaces에서의 차단은 환경별 검증이 필요하다. 앱을 강제 종료하면 차단 창은 사라진다. 네트워크 수준의 웹사이트 차단기는 아니다.

## 자체 점검

격리된 UserDefaults로 검사하므로 운영자의 로컬 기록을 수정하지 않는다.

```bash
cd prototypes/moonlight-pet-macos
swift run MoonlightPetPreview --self-check
```

### Optical glass comparison

The floating panels now pair native clear glass with a Metal optical rim (curved bevel lighting, a fine edge, transparent center). The Metal pipeline is cached and redraws only for changes; a native/Core Animation fallback remains available. See [research and implementation limits](design/glass-optics-research.md).

Run `./script/build_and_run.sh --glass-lab` for the optional native-vs-Metal material comparison. The sliders affect the custom material on the right; the calibration backgrounds belong to the app. Normal launch keeps the pet-only experience. `swift run -j 2 MoonlightPetPreview --self-check` also checks real GPU output for edge clipping, premultiplied alpha, Retina geometry and refractive displacement.

The default uses native clear glass with a dark, translucent character-colored body (2026-09-25 operator decision). White-family text stays above the material and optical rim without a readability halo. Reduce Transparency / Increase Contrast select regular glass and a solid theme body. The lab has no white luminance floor or center blur; its character picker compares the same body treatment on both renderers without changing the saved pet.
