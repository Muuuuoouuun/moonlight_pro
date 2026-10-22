# Accessibility follow-up evidence — 2026-10-23

Environment: authenticated local production preview at localhost:3037 for diagnosis; separate development worktree at 127.0.0.1:3043 for patched behavior. No live business reads or writes. Chromium 151 / axe 4.14.0. Browser plugin skill was unavailable; bundled Playwright was used. This is not VoiceOver or cross-browser validation.

## Shortcut names

The production Daily Brief shortcut labels showed `내 작업` and `기록 확인` in two rows, but aria-label injected `내 작업: 기록 확인`. There was no keyboard-shortcut text. Removing the redundant aria-label allows the native button to derive its name from its visible children. Chromium AX now exposes `내 작업 기록 확인`, `하루 리뷰 18:00 회고`, `캘린더 일정 배치`, `프로젝트 진행 확인`, `오늘 연락 후속 조치`, `콘텐츠 소재·제작 확인`.

The six buttons received keyboard focus in DOM order through Tab. Their focused AX names matched the rendered text. Enter on 내 작업 navigated to /dashboard/work/my. This verifies the browser accessibility tree and keyboard behavior, not spoken screen-reader output. Evidence: jump-before.json, jump-after.json, jump-focus.json. Commit a75fdb80.

## Axe incomplete review

The dark desktop run across home, daily-brief, work/my, agents/office-council returned 16 aria-prohibited-attr nodes (4, 8, 3, 1). These are aria-label on generic span/div wrappers, including TruthBadge and panel wrappers. Representative Daily Brief nodes were inspected through Chromium's Accessibility.getPartialAXTree in both themes: the generic node's supplied name is present and the visible StaticText/heading/navigation descendants remain exposed. No observed content loss in this Chromium tree. Generic-role naming is not a portable supported ARIA contract; other assistive technologies remain unverified. This was historical semantic compatibility debt. Commit a7145e41 removed unsupported generic names from TruthBadge and Daily Brief wrappers; existing visible text/headings/navigation remain. The meaningful focus card is explicitly a group. Renderer behavior tests cover the semantics.

The color-contrast incomplete entries were keyboard glyphs `⌘` and `↵` and a decorative `·` separator. Browser canvas conversion of the glyphs' computed foreground/background colors gave 6.49:1 in light (#54585d / #f1f4f6) and 8.57:1 in dark (#b4b8bc / #191c1f). Both exceed 4.5:1. The separator uses --line-strong with opacity .6 and axe measured 1.33:1; it is punctuation decoration between independently readable content, not a meaningful label. Evidence: incomplete-details.json, manual-ax-contrast.json.

## Narrow and enlarged text observations

At 320 CSS px, four key preview routes retained document scrollWidth 320. My Work's quick-add button initially crossed its row boundary (right 341.73 vs row right 308), while two later deadline filters were inside an intentional horizontal segmented-control scroller. The quick-add input's intrinsic min-width caused the overrun; minWidth: 0 is the narrow fix. Patched regression checks cover 320/390/1440, the row containment of all three controls, mobile 44px target heights, and N focus. See quick-add-after.json and quick-add-after-*.png. Production integration measurements are recorded in the companion evidence.json; development checks alone are not a production pass.

A separate stress probe doubled every element's computed font size through temporary CSS at 1440px. It showed fixed-height sidebar search overflow (height 34 / scrollHeight 47), ClassIn scope width pressure, and some small buttons whose text exceeded their fixed height. This method is not browser zoom and is not an authoritative WCAG resize-text test. No global style changes were made from this synthetic result. Evidence: reflow-results.json and reflow-*-1440-text2.png. At the time, real browser 200% zoom, text-only zoom, and screen-reader speech were untested. The later browser-zoom follow-up below covers 200%; text-only zoom and speech remain untested.

## Integrated production follow-up

At `caa200cf`, build `x2R7y2GNe4yPedk6--9eU`, five routes (Home, Daily Brief, My Work, canonical Office Council, Customers) × 1440/390px × light/dark =20 settled conditions returned zero confirmed axe violations and zero aria-prohibited-attr incomplete nodes. The additional customer scan found a visible-name mismatch in the mentor trigger; the single component changed redundant aria-label to title. Actual Chromium AX exposes name `멘토 관점 열기` and description `전체 고객 멘토 관점 열기` at both widths. Enter opens its dialog, Escape closes it, and focus returns to the trigger. This checks the browser tree and keyboard, not VoiceOver speech.

## Real browser 200% zoom

The same caa200cf production Preview build was checked using Chromium automatic page zoom through the official [chrome.tabs.setZoom API](https://developer.chrome.com/docs/extensions/reference/api/tabs#method-setZoom) in a temporary isolated browser profile. getZoom returned2 and CSS viewport width became exactly720/640 for1440/1280 browser viewports; computed font sizes were not manually changed. Five routes ×two widths ×two themes=20 conditions had no document horizontal overflow or page errors. At both widths and themes (four interaction conditions), customer search accepted text, N opened the customer dialog and focused its input, Escape closed it, M opened quick memo, two lines remained editable, and Escape closed the memo. No business save was invoked.

Ten direct CDP viewport screenshots cover the1280 viewport in both themes. Initial Playwright fullPage capture cropped the zoomed viewport, so those captures are excluded from visual evidence. The CDP images correctly retain1280×1000 pixels. Raw measurements and interaction results are in `/tmp/moonlight-quality-20261022/zoom-200-production.json` and `zoom-200-interactions.json`. This is Chromium Preview reflow and representative interaction evidence, not all controls, real phone behavior, text-only zoom, VoiceOver speech, or full WCAG certification.

## Coarse-pointer checkbox target

The actual390px production database workflow found bare Checkbox buttons with14px faces and a30px computed pseudo-element hit region. Commit64569953 (integrated2efb3c3d) centers a44px minimum pseudo-element on `button.hub-checkbox` only. CheckboxRow retains its existing whole-row target. Related24 tests, actual source-component hit tests and four desktop/mobile/light/dark visual comparisons passed with zero pixel or DOM geometry changes. Actual DB tests with the candidate CSS confirm a right-edge tap completing the task and Undo retaining todo. The bottom-left corner of the last row can still be clipped by the existing rounded Card overflow; the other corners and centerline extents were verified. This evidence does not certify every possible parent clipping context. The unrelated immediate-Undo animation race discovered during this work is separately fixed in e2cc44d8.


## 최종 통합 확인

`2efb3c3d` / build `iZ8NrCtJituF7IygMkERY`에서5경로×2폭×2테마20조건을 다시 검사해 확정 위반0건·generic ARIA 보조 확인0건이다. axe의 color-contrast incomplete는 자동 판정 불가능한 항목으로 남으며 전체 수동 WCAG 인증이 아니다. 체크박스44px 변경은 CSS 주입 단계 뒤 실제 production으로 재빌드했다. 같은 소스의 오른쪽 중심+21px touch가 PATCH1회 HTTP200 saved·SQL done으로 이어졌고, 빠른 Undo5회에서는300ms·3.6초 뒤에도 행이 유지됐다([실제 DB 후속 검증](mobile-roundtrip.md)). 둥근 Card 마지막 행의 좌하 외곽 모서리 clipping은 남아 있다.
