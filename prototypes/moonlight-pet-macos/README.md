# Moonlight Pet Preview

macOS 가장자리에서 쓰는 네이티브 펫 위젯이다. 기존 Hub의 할 일·메모·캘린더에 연결한다. UI와 집중 차단은 아직 프로토타입 단계다.

[승인 시안 적용 스펙](../../docs/superpowers/specs/2026-09-24-pet-approved-glass-design.md)이 현재 레이아웃의 기준이다. [four-states.svg](design/four-states.svg)는 초기 배치 참고용으로 남긴다.

## 실행

macOS 14 이상과 Swift 5.9 이상이 필요하다. macOS 26 Liquid Glass로 빌드하려면 해당 SDK가 필요하다.

```bash
cd prototypes/moonlight-pet-macos
./script/build_and_run.sh --verify
```

## 조작

오른쪽 가장자리의 펫을 한 번 누르면 빠른 기능을 연다. 두 번 누르거나 헤더의 핀을 누르면 지속 위젯으로 바뀐다. 할 일·일정은 세로형 `오늘`, 메모는 가로형 입력면, 집중은 별도의 전체 화면으로 구성한다. 더보기에서 Office·Council·집중·Hub 연결 설정으로 이동한다.

빠른 기능 창은 그림자 여백을 포함해 할 일 336×504pt, 일정 336×484pt, 메모 520×440pt다. 메모는 빠른 창부터 위쪽 54pt 공간에 캐릭터가 걸치는 형태이고, 헤더에 할 일·메모 전환과 아래쪽에 접기 버튼을 둔다. 지속 위젯의 할 일·일정은 위쪽 공간 54pt를 더해 각각 558·538pt 높이이며, 메모는 빠른 창과 같은 크기다. 전환할 때 창의 위쪽·오른쪽 기준점을 유지하며 화면 경계를 넘지 않게 보정한다. 헤더 핸들로 위아래 이동하거나 접근성 이동 동작을 쓸 수 있다. 할 일 행 전체를 눌러 완료한다. Hub 항목의 자세한 편집·삭제는 브라우저에서 한다. 로컬 모드에만 우클릭 삭제가 있다.

| 단축키 | 동작 |
| --- | --- |
| ⌃⌥M | 어느 앱에서든 빠른 기능 열기 |
| ⌘1 / ⌘2 / ⌘3 | 할 일 / 메모 / 일정 |
| ⌘4 / ⌘5 / ⌘6 | Office / Council / 집중 설정 |
| ⌘Return | 현재 기능을 Hub에서 열기. 메모는 아래의 Council 동작 |
| ⌘S | 메모 화면에서 Hub에 저장. 로컬 모드에서는 Mac 저장 |
| Esc | 패널 접기. 집중 중에는 1.3초 길게 눌러 중지 확인 |

메모 더보기의 `Council에서 이어서`(⌘Return)는 내용을 클립보드에 복사하고 Council을 브라우저에서 연다. AI에게 자동 전송하지 않는다. 기본 Hub 주소는 `http://127.0.0.1:3000`이며 더보기의 `Hub 연결 설정`에서 바꾼다.

## 펫·재질·움직임

펫을 우클릭하면 이브이와 진화체 아홉 캐릭터 중 하나를 선택한다. 기본 대기 아이콘과 짧은 메시지에는 처음 제공된 얼굴 이미지를 쓴다. 빠른 메모·두 번 눌러 펼친 위젯·집중 모드에서는 팔을 걸친 별도 투명 배경 캐릭터가 유리 상단에 올라온다. 원 테두리는 없다. 블래키는 추가 제공된 일자 앞머리, 에브이는 뒤로 묶은 머리를 살린 자산이다. 원본 이미지는 보존한다. 기본값은 글레이시아이고 선택은 이 Mac에 저장된다. 메뉴 막대의 달 아이콘에는 선택한 펫이 나오는 `짧은 메시지 보기`도 있다.

macOS 26에서는 창 경계의 `NSGlassEffectView(.clear)`가 배경 재질을 처리한다. 기본·입력 상태에는 캐릭터 색상층을 넣지 않는다. 밝거나 복잡한 바탕에서도 읽을 수 있도록 제목·입력·목록·일정 설명에만 네이티브 배경 흐림과 중성 바탕을 둔다. 글자가 없는 여백과 외곽 유리는 투명하게 남긴다. 패널을 누르거나 드래그하는 동안에만 반투명 캐릭터색이 보이며, 해제하면 투명 상태로 돌아온다. 헤더 핸들과 별도 펫 아이콘 드래그 모두 실제로 움직이는 패널에 직접 시작·이동·종료 신호를 전달한다. 글자·아이콘은 화이트 계열이다. 투명도 감소·대비 증가 설정에서는 `.regular`와 불투명 테마 바탕을 사용한다. 빛 반사 윤곽과 그림자 여백을 분리하고 외곽 1~3pt에는 약한 프리즘 색 분리를 둔다. 읽기 바탕은 같은 창의 클릭·드래그 상태를 공유하며, 색상은 반응이 끝나면 사라진다. 글자와 입력창은 유리 위의 별도 호스트에 그려 번짐을 피한다. 이전 macOS는 `NSVisualEffectView(.popover, .behindWindow)`를 사용한다.

펫은 호버·누름·해제에 작게 반응한다. 패널과 본문·선택 표시가 함께 전환되며 무한 장식 모션은 없다. macOS 동작 줄이기를 켜면 장식적 전환은 즉시 완료된다. [프론트 품질 평가 및 검증](design/frontend-quality.md)에 적용 근거와 검증 범위를 기록했다.

## 저장과 연결 범위

기본 Hub 주소는 `http://127.0.0.1:3000`이다. 실행 시 읽기 연결하고, 패널을 열 때와 열린 동안 60초 간격으로 새로고침한다. 더보기 → **Hub 연결 설정**에서 HTTPS 주소와 운영자 로그인을 설정할 수 있다. 개발 서버의 loopback 인증 동작은 서버가 판정한다. 비밀번호는 저장하지 않으며 세션 쿠키도 앱 전용 메모리에만 보관한다. 운영 서버는 앱 재시작 후 다시 로그인이 필요하다.

- **할 일:** Hub 목록·빠른 추가·완료/취소. 서버 저장 확인 후 반영한다. 저장 실패 시 입력과 동일 요청 ID를 보존한다. 우클릭의 Hub 열기에서 상세 편집을 이어간다.
- **메모:** 입력은 Mac에 즉시 자동 저장된다. 아래 **Hub에 저장**을 누르면 현재 메모함(journal)에 저장·재조회한다. 후속 저장은 같은 메모의 revision을 확인하며 제목·태그·연결 문맥을 보존한다. **더보기 → 새 항목으로 Hub에 저장**은 현재 내용을 독립된 새 메모로 저장한다. 저장해도 초안은 지우지 않는다.
- **일정:** 실제 주간 일정을 가져오고 날짜를 눌러 그날의 시간·제목·장소를 확인한다. 종일 일정은 현지 날짜와 종료일 제외 규칙을 따른다. 일정 편집은 Hub에서 한다.
- **실패·부분 데이터:** 연결 오류, 로그인 필요, 일부 조회를 빈 목록이나 저장 완료로 표시하지 않는다. 저장 결과가 불확실하면 빈 입력창에서도 **저장 확인**으로 동일 요청을 재확인한다.
- **기존 Mac 기록:** 자동 업로드하지 않으며 기존 UserDefaults를 보존한다. 연결 설정에서 **이 Mac에만 저장**을 누르면 이전 로컬 할 일을 다시 볼 수 있다. 두 목록을 혼합하지 않는다.
- **브라우저·AI:** Office/Council과 상세 화면은 계속 브라우저로 연다. AI 알림이나 외부 메시지 자동 발송은 연결하지 않는다.

새 데이터베이스나 공개 API는 추가하지 않는다. 기존 Hub 세션·쓰기 경계와 API를 재사용한다. [연결 설계](../../docs/superpowers/specs/2026-09-25-pet-hub-connection-design.md)와 [검증 기록](../../docs/superpowers/plans/2026-09-25-pet-hub-connection.md)을 참고한다.

집중 모드는 각 화면 위에 불투명 차단 창을 띄우고 앱 전환·Dock·메뉴 막대를 숨긴다. `중지`를 누른 뒤 확인하거나 `Esc`를 1.3초 누르면 중지 확인이 열린다. macOS 시스템 UI와 모든 Spaces에서의 차단은 환경별 검증이 필요하다. 앱을 강제 종료하면 차단 창은 사라진다. 네트워크 수준의 웹사이트 차단기는 아니다.

## 자체 점검

격리된 UserDefaults와 메모리 응답으로 검사하므로 운영자의 로컬·Hub 기록을 수정하지 않는다. CLT에 XCTest 런타임이 없어 Hub 검사는 Foundation만 쓰는 독립 실행 파일로 컴파일한다.

```bash
cd prototypes/moonlight-pet-macos
swift run MoonlightPetPreview --self-check
./script/test_hub_transport.sh
./script/test_hub_domain.sh
# 실제 localhost Hub를 조회만 하는 선택 검사
./script/test_hub_domain.sh --live-read
```

### Optical glass comparison

The floating panels now pair native clear glass with a Metal optical rim (curved bevel lighting, a fine edge, transparent center). The Metal pipeline is cached and redraws only for changes; a native/Core Animation fallback remains available. See [research and implementation limits](design/glass-optics-research.md).

Run `./script/build_and_run.sh --glass-lab` for the optional native-vs-Metal material comparison. The sliders affect the custom material on the right; the calibration backgrounds belong to the app. Normal launch keeps the pet-only experience. `swift run -j 2 MoonlightPetPreview --self-check` also checks real GPU output for edge clipping, premultiplied alpha, Retina geometry and refractive displacement.

The default and typing state use native clear glass with zero character-wash opacity. Character tint appears only while pressing/dragging and fades out on release; Sylveon's blush wash is 60% during that interaction. White-family text stays above the material and optical rim without a readability halo. Reduce Transparency / Increase Contrast select regular glass and a solid theme body. The lab's explicit tint-preview switch is off by default and never affects the real panels or the saved pet.

Character hues are separated in lightness and saturation while keeping the existing press-only opacity (Sylveon 60%, others 76%). Local reading materials keep fixed white text usable on busy backgrounds; the outer clear glass and blank areas stay transmissive. The custom prism is an edge-reflection treatment, not a public control over macOS desktop refraction. See [reading and prism design](../../docs/superpowers/specs/2026-09-25-pet-prism-readability-design.md).
