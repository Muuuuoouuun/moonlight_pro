# 펫 렌더러 (Windows · macOS)

번들러 없는 HTML/CSS/JS. 모든 페이지는 `window.moonlightPet`(프리로드 다리)만 쓰고, 채널 이름은
`../shared/contract.js`의 `PET_INVOKE`·`PET_EVENTS`가 정본이다(`renderer-integrity.test.js`가 확인).

| 페이지 | 창 | 비고 |
| --- | --- | --- |
| `panel.html` | Acrylic, `contract.glassSize(mode)` | 헤더·탭·손잡이·키보드 + `modes/*.js`. 모드 전환 때 `pet:set-mode`를 보내고, 셸이 창 크기를 바꾼다 |
| `pet.html` | 56×56 투명 | 누름·끌기·우클릭만 알린다. 한 번/두 번 누름 판단은 셸 |
| `perch.html` | 72×72 투명, 패널 소유 | 누름·끌기는 `source:'panel'`, 움직이지 않고 떼면 `pet:collapse` |
| `bubble.html` | 326×130, 포커스 없음 | 숨긴 채 살려 두고 `pet:notice`를 보낸 뒤 보여 준다. 닫기는 `pet:collapse {surface:'bubble'}` |
| `focus.html` | 모니터마다 불투명 전체 창 | 주 모니터 외에는 `?controls=0`(한 줄 표시만) |

- 모듈 등록: 계약 → `window.PetContract`, 순수 모델(`model/*.js`, Node 테스트 겸용) → `window.PetModel.*`,
  모드 → `window.PetModes.*`. 페이지 스크립트 순서는 각 HTML 이 정한다.
- 로컬 보관 키(렌더러가 `pet:store-*`로 씀): `petPreview.memo`·`petPreview.capturedMemos`·`petPreview.taskDraft`
  (`{title,id}` — 불확실한 추가를 같은 ID 로 재시도)·`petCouncil.draft`·`petCouncil.source`·
  `petHub.pending.v1.<origin>`(`{memo, savedMemo, memoConflict}` — 메모 저장 재확인용).
- 플랫폼: `model/platform.js`(`window.PetModel.platform`)가 navigator 로 win/mac 을 가려 `<html data-platform>` 을 달고, 주 수정키(Ctrl/⌘)·단축키 표시(`Ctrl+S`/`⌘S`, `Ctrl+Enter`/`⌘Return`)·기기 명사(`이 PC`/`이 Mac`)를 준다. 모든 함수가 platform 인자를 받고, 생략하면 렌더러는 현재 창·Node 테스트는 win. 유리 반경은 `--radius` 8px(win) / 10px(mac).
- 유리 층(`glass.css`, 패널·말풍선 공용, 아래 → 위): `veil`(mac 전용, 라이트 .48 / 다크 .24 — 글자 열에서 짙고 가장자리 9px 안에서 55%로 옅어짐) →
  `shade`(중앙 9%) → `wash`(누름·드래그 때 캐릭터 색 — 가장자리 1 → 48px에 걸쳐 면 35%) → 곡면 단면 `section`(어깨 1.5–4.8px, 흐림 1.2px) ·
  `section-fine`(안쪽 반사 5–6.2px + 안쪽 감쇠 6.6–7.6px) · `prism`(분광 두 띠, 위·왼쪽은 바깥이 붉고 아래·오른쪽은 반대, 모서리에 모임) → `rim`(1px 입술).
  단면 띠는 변을 따라 한 번 밝아졌다 잦아든다(반사된 광원 하나). 출처는 `prototypes/moonlight-pet-macos`의 `GlassOptics.metal`·`PetGlassTheme.swift`·
  `GlassCenterDiffusion.swift`이고 값은 `contract.js` `GLASS`와 `renderer-integrity.test.js`가 고정한다. 투명도 줄이기·대비 높이기(`html.opaque`)와 강제 색에서는
  베일·단면을 끄고 불투명 면이다. 옮기지 않은 것: 화면 캡처 굴절(ScreenCaptureKit, 화면 기록 권한 필요 실험), 포인터를 따라 움직이는 빛, 짙은 글자(운영자 미승인).
- 글꼴: `fonts.css`가 `../fonts/*.woff2`(패키징)를 먼저, `../../../hub/public/fonts/*.woff2`(개발 트리)를 다음으로 찾는다.
- 자산: `node apps/desktop/scripts/pet-assets.mjs`(검사만: `--check`)가 `../assets/portrait-*.png`·`cutout-*.png`를 만든다.
- 테스트: `npm --workspace @com-moon/desktop test`.
