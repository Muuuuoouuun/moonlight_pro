# Moonlight Sidebar Consolidation — Frontend Design

> Date: 2026-07-14 (Asia/Seoul)
> Status: Approved direction; written-spec review pending
> Scope: Hub frontend information architecture and interaction only

## 1. Decision

Replace the current workspace-first accordion sidebar with a stable workflow-first sidebar.

The current `NAV_TREE` exposes nine top-level entries and 36 destinations:

- `Daily Brief`: 1 destination
- `ClassIn`: 7 destinations
- `Brand`: 3 destinations
- `Agents`: 4 destinations
- `Work`: 5 destinations
- `Revenue`: 6 destinations
- `Content`: 3 destinations
- `Automations`: 5 destinations
- `System`: 2 destinations

The new expanded sidebar exposes eight stable anchors:

1. 오늘
2. 할 일
3. 매출·고객
4. 연락·후속
5. 프로젝트·기획
6. 콘텐츠
7. AI·자동화
8. 설정

The first six are primary workflow anchors. `AI·자동화` and `설정` are pinned below a visual divider at the bottom. ClassIn and personal/brand are no longer competing navigation trees; they become a three-option scope control: `전체`, `ClassIn`, `개인`.

## 2. Why This Structure

The approved order matches the operator's stated mental model: 할 일 → 매출 → 메시지 → 기획 → 콘텐츠 → 기타. The current sidebar mixes two organizing principles—workspace and function—and repeats Projects, Revenue/CRM, Follow-ups, Content, and Sheets in both. That forces the operator to answer “where does this belong?” before “what am I trying to do?”

The consolidated sidebar keeps task type stable and moves organizational context into one scope control. This lowers scanning cost without deleting any current capability.

## 3. Goals

- Reduce visible navigation from 36 destinations to eight stable anchors.
- Make the first scan match the operator's real work order.
- Preserve every existing route, bookmark, and command-palette destination.
- Keep the same structure in desktop, collapsed rail, and mobile drawer.
- Make scope selection a frontend contract before adding new backend personalization or counting.
- Keep all navigation keyboard accessible with visible active and focus states.

## 4. Non-Goals

- No new Supabase tables, migrations, webhook routes, or API calls.
- No backend-persisted favorites, recents, scope preferences, or dynamic counts.
- No deletion of existing pages or route handlers.
- No redesign of page contents beyond the minimum internal tabs or query-controlled initial view needed to receive consolidated navigation.
- No change to the current Calendar integration work already present in the working tree.

## 5. Current-to-Target Mapping

| Current navigation | New sidebar anchor | Preserved inside the destination |
|---|---|---|
| Daily Brief | 오늘 | Existing Daily Brief surface |
| Work / Projects | 할 일 | Projects task view, opened with `?view=tasks` |
| ClassIn Pipeline, Revenue Deals/Leads/Accounts/Cases, ClassIn Leads/Segments/Accounts | 매출·고객 | Pipeline, 고객, 리드·결제, 세그먼트 tabs or existing scoped routes |
| ClassIn Follow-ups, Revenue Follow-ups | 연락·후속 | One representative Follow-ups route selected by scope |
| Work Projects/Calendar/Rhythm/Decisions/Roadmap, ClassIn Projects, Brand Projects | 프로젝트·기획 | Projects as the primary view; Calendar, 결정·로드맵, 리뷰 as internal or secondary navigation |
| Brand Studio/Queue, Content Studio/Queue/Campaigns | 콘텐츠 | 아이디어·제작, 발행 큐, 캠페인 tabs or existing scoped routes |
| Agents, Automations, ClassIn Sheets | AI·자동화 | AI 작업실, 작업 지시, 자동화, 실행 로그; remaining tools stay in command search |
| Evolution, Settings | 설정 | Settings primary; 변경 기록 reachable as an internal tab and command item |

“Internal tab” means frontend navigation composition, not data merging. Existing pages and URLs remain authoritative until later backend and page consolidation work is explicitly approved.

## 6. Scope Model

The scope control has three values:

- `all`: 전체
- `classin`: ClassIn
- `personal`: 개인; this includes the existing `brand` workspace routes

The selected scope is stored only in `localStorage` under `mlp.scope`. Missing or invalid values fall back to `all`. No server cookie or account preference is added in this phase.

### Scope-aware destinations

| Anchor | 전체 | ClassIn | 개인 |
|---|---|---|---|
| 오늘 | `dashboard/daily-brief` | same | same |
| 할 일 | `dashboard/work/projects?view=tasks` | `dashboard/classin/projects?view=tasks` | `dashboard/brand/projects?view=tasks` |
| 매출·고객 | `dashboard/revenue/overview` | `dashboard/classin/pipeline` | `dashboard/revenue/overview?scope=personal` |
| 연락·후속 | `dashboard/revenue/followups` | `dashboard/classin/followups` | `dashboard/revenue/followups?scope=personal` |
| 프로젝트·기획 | `dashboard/work/projects` | `dashboard/classin/projects` | `dashboard/brand/projects` |
| 콘텐츠 | `dashboard/content/queue` | `dashboard/classin/content` | `dashboard/brand/queue` |
| AI·자동화 | `dashboard/agents/chat` | same | same |
| 설정 | `dashboard/settings` | same | same |

When the operator changes scope while viewing a scope-aware anchor, the Hub navigates to the corresponding route in the new scope. On global anchors—오늘, AI·자동화, 설정—the selection changes only the scope control and affects the next scope-aware navigation.

## 7. Navigation Data Architecture

The full route catalog and the visible sidebar must be separate concepts.

### Existing catalog

`NAV_TREE` remains the complete command-palette catalog in this phase. This preserves all 36 destinations and their keywords without forcing them into the sidebar.

### New sidebar contract

Add a focused navigation module with:

- `SIDEBAR_SCOPES`
- `SIDEBAR_PRIMARY`
- `SIDEBAR_UTILITIES`
- `resolveSidebarPath(anchorKey, scope)`
- `deriveSidebarScope(activePath)`
- `isSidebarAnchorActive(anchor, activePath)`

The Sidebar consumes only this contract. The Command Palette continues to flatten the full `NAV_TREE` plus legacy destinations. This avoids duplicated route strings inside rendering code and makes the visible IA testable without breaking search coverage.

## 8. Component Design

### Expanded desktop sidebar

- Width remains within the current compact shell range: 224–232px. The implementation should prefer the existing 232px unless a browser comparison proves 224px has no label clipping.
- Brand header and collapse control remain.
- Command search remains directly below the header.
- Scope control sits below search as a three-segment control.
- Six flat primary anchors follow; no accordion is shown in the primary list.
- AI·자동화 and 설정 are pinned at the bottom.
- Existing count badges may render only from already available data. No new count request is introduced.

### Collapsed desktop rail

- Width remains 56px.
- Shows the eight stable anchor icons, not the former nine group icons.
- Each icon has an accessible name and tooltip.
- The active state uses the existing surface and moonstone stripe/tone conventions.
- Scope is not changed inside the rail; expanding or command search exposes scope control.

### Mobile drawer

- Uses the same eight anchors and scope control as desktop.
- Keeps the current inert, `aria-hidden`, Escape, focus-transfer, and focus-restoration behavior.
- Minimum touch target is 44×44px.
- Page-level tabs must not create horizontal page overflow; when needed, use a contained tab scroller with visible edge treatment.

### Active state

Active state is derived from the route catalog rather than exact representative-path equality. For example, every Revenue or ClassIn CRM descendant activates `매출·고객`, and both Follow-ups routes activate `연락·후속`.

## 9. Interaction Rules

- Scope control is a real single-select control with keyboard support and an accessible label.
- Sidebar navigation uses buttons only where the existing router callback requires them; every control exposes its current state through `aria-current`, `aria-pressed`, or the appropriate segmented-control semantics.
- Changing scope never writes to the backend and never displays a persistence-success message.
- Search remains the escape hatch for hidden destinations.
- Browser history remains intact because route changes use the existing router navigation path.
- Reduced-motion behavior and the existing theme-transition suppression remain unchanged.

## 10. Frontend States and Failure Handling

- Invalid stored scope: fall back to `all` and replace the invalid local value on the next user selection.
- Missing representative route: use the existing `LegacyPlaceholder`/redirect behavior; never show a fake successful page.
- Existing count request failure: omit the badge as today; navigation remains functional.
- Unknown active path: no primary anchor is falsely highlighted, while command search still exposes known destinations.
- LocalStorage unavailable: keep scope in React state for the current session and continue without an error banner.

## 11. Verification

### Source and unit contracts

- Exactly six primary and two utility anchors.
- Every anchor resolves for `all`, `classin`, and `personal`.
- All current `NAV_TREE` destinations remain available to the Command Palette.
- Every current route maps to no more than one active sidebar anchor.
- Invalid scope falls back to `all`.
- No new fetch, API route, or backend dependency is introduced by scope selection.

### Browser verification

- Desktop expanded and collapsed at 1440px.
- Breakpoint behavior at 900px and 901px.
- Mobile drawer at 390×844.
- Scope switching on a global anchor and a scope-aware anchor.
- Direct navigation to representative old routes highlights the correct new anchor.
- Keyboard traversal, visible focus, Escape close, inert closed navigation, and focus restoration.
- Dark and light themes.
- No horizontal overflow at 390, 768, 901, and 1440px.
- No regression to the deliberate-defocus behavior fixed in the existing responsive sidebar.

## 12. Delivery Phases

### Phase A — approved frontend consolidation

1. Add the pure sidebar navigation contract and tests.
2. Replace accordion rendering with eight flat anchors and the scope control.
3. Add the minimum query/tab receiving behavior to existing pages.
4. Preserve the full command catalog and route compatibility.
5. Run source, build, accessibility, responsive, and browser QA.

### Phase B — deferred backend and behavioral data

Only after real use validates the IA:

- server-persisted scope preference
- per-anchor counts and urgency
- recent-use ordering or favorites
- workspace-aware aggregate reads
- backend consolidation of currently separate pages

Phase B requires a separate design and implementation decision.

## 13. Acceptance Criteria

- The expanded sidebar shows eight stable anchors and no nested accordion tree.
- The first six anchors follow the approved operator workflow order.
- Scope is visible and usable without a backend dependency.
- Existing URLs and command-palette destinations remain reachable.
- Direct old-route entry activates the correct consolidated anchor.
- Desktop, collapsed, and mobile navigation share the same IA.
- No new backend resource or integration work is bundled into this change.
- The user's unrelated Calendar work remains untouched.
