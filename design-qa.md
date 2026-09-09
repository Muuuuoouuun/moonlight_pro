# Project Portfolio Workspace Design QA

## Comparison target

- Source visual truth: `/Users/clmagi/.codex/generated_images/01a06ae6-fa1c-7042-baac-4d1b0601b1d2/exec-bdae48df-c778-47e1-babb-faaf18916d8e.png`
- Source pixels: `1487 × 1058`
- Implementation route: `/dashboard/work/projects`
- Implementation screenshot: Codex in-app Browser tab 1 inline capture, captured from the implementation route above
- Implementation pixels and CSS viewport: `1440 × 1024` at device scale factor `1`
- Density normalization: source aspect ratio `1.405` and implementation aspect ratio `1.406`; both full frames were fit side by side without cropping in a temporary comparison canvas. The implementation iframe used its native `1440 × 1024` CSS viewport and was scaled uniformly for the combined view.
- State: dark theme, live populated project ledger, all-project scope, default List view, first project selected, all three operational rows collapsed

## Full-view comparison evidence

- A temporary local comparison canvas placed the selected source image and the browser-rendered implementation together in one `1600 × 640` screenshot.
- Both views use the same major composition: global navigation, dedicated multi-project index, wide selected-project workspace, oversized progress value, next-action region, progress ruler, and three collapsed summary rows.
- The implementation intentionally retains Moonlight's existing expanded global navigation and live ledger content. The source's slim icon rail is therefore not copied into this page-local change.
- A second same-input comparison was captured after moving the portfolio metrics below the title and adding mini progress/schedule visuals to the collapsed rows.

## Focused-region comparison evidence

- The selected project hero and collapsed summary stack were inspected at the native `1440 × 1024` viewport. The final capture shows the complete hero, next-action copy, CTA, progress ruler, and all three collapsed rows without horizontal clipping.
- A `390 × 844` CSS viewport was captured separately. The project index becomes a bounded top section and the selected-project workspace stacks below it; controls remain readable and do not overlap.
- No content imagery is present in the source. Visible icons use the existing Moonlight icon library; the generated source image is not embedded into the product UI.

## Required fidelity surfaces

- Fonts and typography: the existing Moonlight sans/mono families are preserved. The oversized numeric progress, compact mono metrics, Korean hierarchy, and long live next-action wrapping remain readable at desktop and mobile sizes.
- Spacing and layout rhythm: the index-to-stage ratio, hero split, hairline borders, large negative space, and collapsed-row heights match the source direction. The existing expanded app navigation makes the project workspace narrower than the mock, but the layout remains balanced and unclipped.
- Colors and visual tokens: all new surfaces use Moonlight `--bg`, `--surface*`, `--line*`, `--fg*`, and Moonstone tokens. Danger red appears only on the single overdue/risk channel; normal completion and no-risk states stay neutral.
- Image quality and asset fidelity: no raster imagery, illustration, logo replacement, handcrafted SVG, emoji, or placeholder art was introduced. Icons come from the product's canonical icon set.
- Copy and content: labels are coherent with the live model (`하위 아이템`, `체크리스트`, `일정`). A fake project-parent relationship was not invented; the app continues to treat linked tasks as the actual child items.

## Findings

- No actionable P0, P1, or P2 findings remain.
- [P3] The existing global navigation is expanded while the source shows an icon-only rail. This is an intentional project-scope constraint; changing the global shell for one tab would be broader than the selected implementation.
- [P3] Long English live next-action text wraps to three lines where the Korean source copy fits more compactly. It remains fully visible and is expected dynamic-content variation.

## Primary interactions and console checks

- Project index selection updates the focused project without opening a drawer.
- Checklist disclosure expands and collapses with correct accessibility state.
- Project search and the risk quick filter update the index and focused workspace.
- `프로젝트 열기` opens the existing project detail inspector, and `상세 닫기` returns to the workspace.
- List, Table, Board, Timeline, and To-dos routes were exercised. Table preserves the prior dense operational list instead of merging it into the minimal default view.
- Browser console warnings/errors checked after the interaction pass: none.

## Comparison history

### Pass 1 — blocked

- [P2] Portfolio metrics were visually detached at the far right of the title row, unlike the compact source hierarchy.
- [P2] The three collapsed operational rows were text-heavy and lacked the source's at-a-glance micro progress visuals.

Fixes made:

1. Moved the four clickable portfolio metrics directly under the workspace title.
2. Added status bars, checklist progress, and schedule marks to the collapsed rows using Moonlight tokens.
3. Reduced next-action display sizing and hero padding slightly so long live copy remains composed in the narrower existing shell.

### Pass 2 — passed

- The revised combined comparison shows the title/metric hierarchy grouped correctly and the three rows carrying visible, low-density progress signals.
- Native desktop and mobile captures show no clipped persistent controls, overlapping content, or broken hierarchy.
- No actionable P0/P1/P2 visual differences remain after accounting for the existing global shell and live data.

## Implementation checklist

- [x] Match the selected master-detail composition.
- [x] Preserve live project, task, detail, and mutation behavior.
- [x] Keep Board, Timeline, To-dos, and the previous dense Table surface available.
- [x] Verify desktop and mobile responsive behavior.
- [x] Verify primary interactions and browser console.
- [x] Run the production build and the full 711-test suite.

final result: passed

## 2026-09-09 메모 연결 적용 QA

- 범위: 이미지 시안의 메모→업무 전환·원문 역참조·칸반 패널 요소를 기존 Projects에 통합. 전체 앱 외형 1:1 복제는 아님.
- 비교: 이미지 시안의 원문/전환 폼과 실제 MemoWorkspace 가상 데이터 렌더(1440×1024). 목록 왼쪽·원문과 폼 오른쪽 구조를 유지. 390×844에서는 한 열로 전환.
- 수정: Hub 공통 button reset이 목록 padding을 덮어쓰던 문제를 컴포넌트 CSS 범위로 해결. Drawer가 열렸을 때 배경 단축키를 비활성화.
- 기능 검증: 필수 프로젝트 안내, 생성 후 관계 재조회, 기존 업무 연결, 본문 검색, 연결 없음 필터, 실제 칸반 패널 열기/닫기·포커스 복귀 확인.
- 캡처: `artifacts/memo-links-2026-09-09/memo-workspace-desktop.png`. 캡처가 흐려 세부 픽셀 충실도는 확정하지 않음.
- 로컬 기능 검증: passed. 운영 적용: blocked — Supabase 관리 API 401, 신규 테이블/RPC 미적용. 운영에서 end-to-end 저장 검증 필요.
- final result: blocked (운영 적용·세부 시각 충실도 최종 확인 전)
