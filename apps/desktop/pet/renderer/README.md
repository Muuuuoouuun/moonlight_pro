# 펫 렌더러 (Windows)

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
- 글꼴: `fonts.css`가 `../fonts/*.woff2`(패키징)를 먼저, `../../../hub/public/fonts/*.woff2`(개발 트리)를 다음으로 찾는다.
- 자산: `node apps/desktop/scripts/pet-assets.mjs`(검사만: `--check`)가 `../assets/portrait-*.png`·`cutout-*.png`를 만든다.
- 테스트: `npm --workspace @com-moon/desktop test`.
