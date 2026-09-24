# Moonlight Pet Preview

macOS 네이티브 사용감 확인용 독립 목업이다. Hub 운영 데이터와 연결하지 않는다.

네 장면의 초기 배치 그림은 [four-states.svg](design/four-states.svg)에서 볼 수 있다. 그림의 단순한 펫 표시는 초기 와이어프레임이며, 실행 앱은 제공받은 캐릭터 이미지를 쓴다.

## 실행

macOS 14 이상과 Swift 5.9 이상이 필요하다.

```bash
cd prototypes/moonlight-pet-macos
./script/build_and_run.sh --verify
```

오른쪽 가장자리 펫을 한 번 누르면 캐릭터가 함께 나오는 짧은 메시지, 두 번 누르면 빠른 기능 바가 열린다. 펫을 우클릭하면 제공받은 여덟 캐릭터 중 하나를 선택할 수 있다. 기본값은 실버이며 선택은 이 Mac에 저장된다. 어느 앱에서든 `⌃⌥M`으로 바를 열 수 있고 메뉴 막대의 달 아이콘에서도 열 수 있다. 일정·Office·Council 버튼은 브라우저에서 Hub를 연다. 기본 Hub 주소는 `http://127.0.0.1:3000`이며 바의 브라우저 화면에서 바꿀 수 있다.

바가 열려 있을 때 `⌘1`~`⌘6`으로 기능을 바꾸고 `⌘Return`으로 선택한 기능의 Hub 화면을 연다. `Esc`는 바를 닫는다.

할 일과 메모는 이 Mac의 목업 저장소에만 저장된다. 짧은 메시지도 저장된 로컬 할 일/메모 상태를 요약한다. 실제 Hub 할 일/메모 및 AI 알림과 동기화되지 않는다.

집중 모드는 각 화면 위에 차단 창을 띄우고 앱 전환·Dock·메뉴 막대를 숨긴다. `중지`를 누른 뒤 확인하거나 `Esc`를 1.3초 누르면 중지 확인이 열린다. macOS 시스템 UI와 모든 Spaces에서의 차단은 환경별 검증이 필요하다. 앱을 강제 종료하면 차단 창은 사라진다.

Command Line Tools만 설치된 Mac에서도 자체 상태 점검을 실행할 수 있다.

```bash
cd prototypes/moonlight-pet-macos
swift run MoonlightPetPreview --self-check
```
