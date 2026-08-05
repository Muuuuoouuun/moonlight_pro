# Moonlight Design System

> Current version — reflects the Moonlight Pro bundle now shipped in `apps/hub`.
> Existing token names below match `apps/hub/components/hub/hub-tokens.css` verbatim.
> Contracts marked **target** are approved design direction and remain implementation work until the
> corresponding token or primitive is added to code.
> Previous "Com_Moon / Moonstone Command Deck" naming is retired.

## 1. Product Read

Moonlight is not a generic SaaS dashboard.

It is one operating system with two active layers:

- `apps/hub`: private operating surface that turns signals into decisions, routines, and execution.
- `apps/engine`: intake and execution layer that validates inputs, writes ledger records, and triggers actions.

The public web surface has been detached from this workspace. The design job now is to make the Hub feel operational, calm, and fast while keeping Engine feedback visible through status, logs, and next actions.

## 2. Brand Thesis

The brand should feel like this:

- A strategist's desk, not a startup template.
- Korean-first, mobile-first, decision-first.
- Quietly premium, with discipline instead of noise.

If the product feels "busy", "crypto-like", or "default SaaS blue", we missed.

## 3. Experience Principles

1. **Show signal first.** The first screen answers "what matters right now?" in under 5 seconds.
2. **Make action obvious.** Every section has a primary next step, not just density.
3. **Close the loop.** Intake, ledger state, and operator action should feel like one system.
4. **Respect mobile reality.** The founder checks numbers, captures ideas, and triggers workflows from a phone.
5. **Restraint wins.** One accent, a small surface vocabulary, deliberate typography.

## 4. Visual Direction — Moonlight Pro

Working direction: **Moonstone Command Deck** — the cool precision of a flight instrument
panel or a surgical console. Premium because it is calibrated, not decorated.

**Reference blend:** Linear (dark operational density) × Apple Pro (cool silver machining) ×
Bloomberg (command-deck rhythm: status / count / next action).

- `apps/hub`: dark-native. Void surfaces, moonstone silver accents, hairline borders.
- `apps/engine`: invisible by default, surfaced through health, status, run logs, and webhook outcomes.
- `Content / Studio` surfaces: slightly lower density inside Hub so drafting and review have breathing room.

**Do not reintroduce:**
- Warm gold / amber / champagne accents
- Jewel tones or Web3 metallic sheen
- Colored radial gradients as backgrounds
- Bright blue, green, or purple as brand accents
- Dark mode produced by inverting a light theme (hub is dark-native)

## 5. Color System

The palette has **two theme modes** (dark is the hub default, light is available) sharing one
cool moonstone accent stack. Color does not classify product domains or ordinary workflow
stages. It communicates only interaction emphasis and true urgency; certainty and lifecycle
use line style, shape, icon, label, and luminance instead.

### 5.1 Canonical tokens (CSS custom properties)

Defined in `apps/hub/components/hub/hub-tokens.css` and scoped under `.hub-app`.

```css
.hub-app[data-theme="dark"] {
  /* Surfaces — void-black stack */
  --bg:            oklch(0.155 0.005 250);
  --surface:       oklch(0.195 0.006 250);
  --surface-2:     oklch(0.225 0.007 250);
  --surface-3:     oklch(0.255 0.008 250);
  --elevated:      oklch(0.285 0.009 250);

  /* Hairlines */
  --line:          oklch(0.30 0.008 250 / 0.6);
  --line-soft:     oklch(0.30 0.008 250 / 0.3);
  --line-strong:   oklch(0.40 0.009 250 / 0.8);

  /* Moonstone accent stack (cool blue-silver) */
  --moon-50:       oklch(0.96 0.004 250);
  --moon-100:      oklch(0.92 0.005 250);
  --moon-200:      oklch(0.86 0.006 250);
  --moon-300:      oklch(0.78 0.008 250);   /* brand anchor */
  --moon-400:      oklch(0.68 0.009 250);
  --moon-500:      oklch(0.58 0.010 250);
  --moon-600:      oklch(0.48 0.009 250);
  --moon-700:      oklch(0.38 0.008 250);

  /* Text */
  --fg:            var(--moon-100);
  --fg-muted:      var(--moon-400);
  --fg-dim:        var(--moon-500);
  --fg-faint:      var(--moon-600);

  /* Semantic — muted on purpose */
  --success:       oklch(0.74 0.11 155);
  --warning:       oklch(0.80 0.12 85);
  --danger:        oklch(0.68 0.16 25);
  --info:          oklch(0.72 0.08 230);

  /* Labeling — Personal vs Company */
  --personal:      oklch(0.76 0.05 200);
  --company:       oklch(0.78 0.04 290);
}

.hub-app[data-theme="light"] {
  --bg:         oklch(0.985 0.003 250);
  --surface:    oklch(1 0 0);
  --surface-2:  oklch(0.965 0.004 250);
  --surface-3:  oklch(0.935 0.005 250);
  --fg:         oklch(0.20 0.008 250);
  --fg-muted:   oklch(0.42 0.008 250);
  /* …moonstone + semantic stacks shift accordingly */
}
```

### 5.2 Usage rules

- **Accent anchor:** `--accent` is the theme-stable Moonstone `#5274a8` alias. Accent means current position, selection,
  focus, or the single primary action. It never means a category.
- **Primary CTA:** use `--moon-200` fill with `--moon-100` border. Keep one visually dominant
  primary CTA per view; global and page-level create actions must not compete.
- **Surface order:** `--bg` → `--surface` → `--surface-2` → `--surface-3` for nested elevation.
- **Borders:** always `1px`. Never thicken. Use `--line-soft` for hairlines, `--line` for dividers,
  `--line-strong` only for pressed/emphasized states.
- **Gradients:** reserved for the brand mark and the moonstone CTA rim. Never fill a hero, card,
  or section background with a colored gradient.
- **Danger red:** reserved for immediate-loss states: overdue/missed, a blocker that prevents the
  next action, persistence/sync/automation failure, urgent KA, and destructive actions. It lives on
  an icon, direct label, or 1px left rail. A low-alpha background is allowed only for a compact
  error/critical banner; never fill ordinary cards or rows red.
- **No warning-by-default:** today, due soon, waiting, new changes, high scores, hot leads, and
  partial data are not red. Use order, weight, a clock/pause icon, and direct copy instead.
- **Legacy semantic tokens:** `--success`, `--warning`, and `--info` remain temporarily for existing
  call sites. New surfaces must not use them to classify categories or ordinary workflow stages.
  Completion uses a check icon plus neutral text; partial/preview uses explicit truth-state labels.
- **Identity tokens:** `--personal` and `--company` are legacy compatibility tokens. New surfaces use
  neutral `Personal` / `Company` labels and glyphs; do not introduce new teal or purple identity color.
- **Status color is never sufficient alone:** pair every colored signal with a label and an icon or
  geometric marker. Never rely on a dot whose meaning is available only from its color.

### 5.3 Multi-channel state grammar

Each visual channel owns one meaning. Do not let one `tone` value stand in for urgency,
certainty, lifecycle, and source truth at once.

| Dimension | Primary channel | Values | Rule |
| --- | --- | --- | --- |
| Interaction | Moonstone | current · selected · focus · primary action | One accent meaning; hover stays neutral |
| Urgency | danger red | normal · urgent · critical | Red only when delay or failure causes real loss |
| Certainty | edge pattern + marker + label | confirmed · recommended · unknown | Solid / dashed / dotted; never semantic color |
| Lifecycle | icon + direct text | queued · active · waiting · blocked · done · cancelled | Only blocked may inherit danger |
| Source truth | truth badge + copy | live · partial · preview · error | Error is danger; the rest remain neutral |

#### Certainty

| State | Edge | Marker | Copy and luminance |
| --- | --- | --- | --- |
| `confirmed` | solid 1px | filled circle or verification glyph | normal foreground; say `확정` where ambiguity exists |
| `recommended` | dashed 1px | outline diamond | `권장` label in `--fg-muted` |
| `unknown` | dotted underline or open edge | question mark / open circle | `미정` or `확인 필요` in `--fg-dim` |

Do not lower opacity on the whole component. That reads as disabled and can reduce text contrast.
Reduce only the edge, marker, and supporting metadata luminance; keep the title and available action legible.

#### Lifecycle

| State | Required cue | Color |
| --- | --- | --- |
| `queued` / inbox | open circle + direct label | neutral |
| `active` | half-circle or play/progress glyph | neutral; Moonstone only when current/selected |
| `waiting` | pause glyph + named dependency | neutral |
| `blocked` | blocked/octagon glyph + reason + 1px rail | danger when it prevents the next action |
| `done` | check glyph + lower-emphasis text | neutral, not green |
| `cancelled` | slash glyph + direct label | neutral |

#### Source truth

- `live`: quiet neutral label; no green proof-by-color.
- `partial`: split-circle/info glyph + `일부 데이터` + missing source and retry action. Use danger
  only if acting on the partial view would be unsafe.
- `preview`: dashed container or badge + connection/setup glyph + `Preview · 연결 필요`; never show
  mock work rows beside it.
- `error`: danger icon + plain-language cause + preserved input + retry.

#### Collision precedence

When one item has multiple states, assign each to a separate region:

1. Outer outline: keyboard focus or selection, always Moonstone.
2. Left 1px rail: urgent/critical attention, danger only.
3. Header badge: certainty, using solid/dashed/dotted geometry.
4. Row icon: lifecycle.
5. Supporting copy: reason, dependency, and next action.

Example: an urgent AI recommendation uses a danger left rail, a dashed `◇ 권장` badge, and a
Moonstone `확정하기` action. It does not turn the entire recommendation red or blue.

#### Red-budget rule

- Above the fold: at most one dominant red region.
- Full view: target no more than three strong red regions.
- If urgent items exceed the budget, show a red aggregate count in the section header and use a
  small danger glyph per row instead of repeated fills or rails.
- Urgent indicators never blink. A one-time entrance transition is allowed; persistent animation is not.

#### Charts and dense data

- Distinguish series with Moonstone luminance, solid/dashed/dotted strokes, marker shapes, and direct labels.
- Reserve danger red for an anomaly, breached threshold, or failed run; never use it as a routine series color.
- Legends must remain understandable in monochrome and forced-colors mode.

## 6. Typography

| Role     | Family                | Usage                                           |
| -------- | --------------------- | ----------------------------------------------- |
| UI Sans  | `SUIT Variable`       | Everything except numbers and display headings. Loaded via `@font-face` in `app/globals.css` (Korean + Latin). `Inter Tight` is an optional future upgrade, not currently shipped. |
| Data Mono| `JetBrains Mono`      | IDs, timestamps, keybindings, diffs, and inline/instrument metrics (< 18px). **Bundled** as `JetBrainsMono-Variable.woff2` (Latin + digits; Hangul falls back to SUIT) via `@font-face` in `app/globals.css`. |
| Display  | `SUIT Variable`       | Page-level moments only; avoid decorative display type in dense Hub surfaces. |

Fallbacks: `'Inter Tight', ui-sans-serif, system-ui, sans-serif` for sans, `'Cascadia Code', 'Cascadia Mono', ui-monospace, 'SF Mono', Consolas, monospace` for mono (JetBrains Mono is now bundled and first in `--font-mono`).

**Rules**
- Hub defaults to sans at 14px / `font-feature-settings: 'cv11', 'ss01', 'ss03'`.
- **Hybrid number rule.** Hero / display figures (KPI values, big metrics ≥ 18px) use `.stat` — SUIT **sans** with `tabular-nums lining-nums` and a touch of display tracking (`-0.015em`), for a premium, non-code read. Instrument data (IDs, timestamps, inline values, counts < 18px) uses `.mono` — bundled JetBrains Mono, `letter-spacing: 0`. Don't set large display numbers in mono; don't set IDs/timestamps in sans.
- 데이터 숫자는 크기로 나눔: 큰 지표는 `.stat`(sans tabular), 인라인/계기 데이터는 `.mono`(JetBrains Mono) + `tabular-nums` (column-stable). 사인에 남는 소형 카운트는 `.num` 유틸.
- 데이터 값의 최소 크기 12px — 10–11px은 라벨 / eyebrow 전용.
- Section eyebrow is 11px, uppercase, `letter-spacing: 0.1em`, `color: var(--fg-dim)`.
- Never mix more than two families on one screen.

## 7. Layout System

### Widths
- Public container: `min(1120px, calc(100vw - 32px))`
- Hub container: `min(1440px, calc(100vw - 24px))` — but most hub pages use full width,
  two-column grids, or sidebars; the container rule only applies to editorial pages.

### Spacing scale
`4, 8, 12, 16, 24, 32, 48, 64, 96`

### Density (fixed)
The hub ships one fixed density — no user-facing toggle. Values: `row-h: 36`, `pad-y: 10`,
`pad-x: 14`, `gap: 12`, `section-gap: 24`, `card-pad: 20`.

### Radius
- Small controls: `6px` (`--r-sm`)
- Standard cards: `14px` (`--r-lg`)
- Feature panels: `20px` (`--r-xl`)
- Floating pills / buttons: `999px`

## 8. Component Language

Primitives live in `apps/hub/components/hub/hub-primitives.jsx` and must be the source of
truth. Do not recreate them ad-hoc inside pages.

**Available primitives**
- `Badge` — soft / outline, 7 tones (neutral · moon · success · warning · danger · info · personal · company)
- `Dot`, `Kbd`, `Avatar`, `Divider`
- `Card` (padded / unpadded), `SectionTitle`, `Tabs`
- `Button` (primary · secondary · ghost · outline · danger), `IconButton`
- `Input`, `Checkbox`, `Progress`, `Sparkline`, `Placeholder`

**Hub-specific composites** (page-level, see `components/hub/pages/*`)
- Signal card (Daily Brief)
- Metric card w/ sparkline
- Brand-organized project tree (PMS)
- Deal kanban
- Flow canvas (drag-pan, node kinds: trigger · logic · ai · action)
- Key / webhook copy rows (masked, reveal, copy button)

**Behavior rules**
- Buttons have clear primary / secondary / ghost hierarchy.
- Empty states explain the next useful action.
- Tables stay narrow — prefer fewer columns and clearer status chips over spreadsheet density.
- Dashboards prioritize trend + urgency over raw counts alone.

### 8.1 Interaction Conventions (표준 동작 — 새 서피스는 이 계약을 따른다)

**Primitives first.** 페이지 안에서 pill 토글·sync 라벨·빈 상태·체크박스를 다시 만들지 않는다.
`SegmentedControl`(필터/뷰 토글), `SyncBadge`(live·mock·preview·syncing·error),
`EmptyState`(+ `action` CTA), `Checkbox`(`label` prop 필수), `EditDrawer`가 canonical.
인라인 복제는 이미 두 번 드리프트 사고를 냈다(2026-07 design-review FINDING-002/003).

**생성(Create).**
- 모든 리스트 서피스는 헤더에 primary 생성 버튼 + `<Kbd>N</Kbd>` 힌트.
- 페이지 레벨 `N` 단축키: 드로어 닫힘 + 포커스가 input/textarea/select/contentEditable 밖일 때만.
- 빈 상태(워크스페이스 빈 화면·검색 0건)는 반드시 생성 CTA 또는 "검색 지우기"를 포함.
- 칸반 컬럼 하단에 점선 "+ 추가" — 클릭하면 **그 컬럼의 stage로 시드**된 레코드가 생성되고 드로어가 즉시 열린다.

**편집(Edit).**
- 행/카드 클릭 → `EditDrawer`. `role="button" tabIndex={0}` + Enter/Space 핸들러 동반.
- 닫기: ESC + 오버레이 클릭 + 닫기 버튼 3중 지원 (Drawer primitive가 처리).
- 저장은 `{ ok, status }` 봉투 — `saved`(영속) / `preview`(백엔드 미설정, 낙관적 로컬 행 유지) / `error`.
- 딥링크: `?lead=<id>` `?deal=<id>`는 원장 로드 후 해당 드로어를 1회만 열고 쿼리를 소거한다.

**테이블 정렬.**
- 헤더 클릭: asc → desc → 해제(원장 순서) 3단 토글, 방향 캐럿은 비활성일 때도 폭 예약.
- 금액은 표시 문자열(`₩1.2M`/`₩900K`)을 숫자로 파싱해 정렬, 단계는 퍼널 순서로 정렬 (알파벳 금지).

**상태 표시.**
- 좌측 액센트 스트라이프는 `--*-line` 토큰 + `inset 1px 0 0` box-shadow — 배경 fill·두꺼운 보더 금지 (§5.2).
- stalled 기준은 `STALLED_DAYS`(현재 14일) 상수 하나 — 페이지별 하드코딩 금지.

**Hover.**
- 인터랙티브 행은 `className="hub-row"` — `onMouseEnter/Leave` JS 핸들러를 새로 쓰지 않는다
  (reduced-motion 무시 + 드리프트 원인). 기존 JS hover는 해당 파일을 만질 때 옮긴다.

**텍스트 크기 플로어.**
- 데이터 값 ≥ 12px · 보조 메타(ID·타임스탬프·마이크로 카운트·상태 플래그) ≥ 10.5px ·
  10px 미만 금지 (예외: 미니어처 프리뷰 캔버스 — 슬라이드 썸네일 등).

### 8.2 State Primitives (shipped 2026-07-19)

Do not expand `Badge tone="..."` into more page-level meanings. Migrate toward four small,
composable primitives so pages declare semantics and the primitive owns presentation.

| Primitive | Contract | Responsibility |
| --- | --- | --- |
| `AttentionRail` | `level="none | urgent | critical"` | Danger rail and accessible urgency copy |
| `CertaintyBadge` | `state="confirmed | recommended | unknown"` | Edge pattern, marker, and explicit label |
| `LifecycleBadge` | `state="queued | active | waiting | blocked | done | cancelled"` | Neutral lifecycle icon and label; danger only for a real blocker |
| `TruthBadge` | `state="live | partial | syncing | loading | preview | error"` | Source honesty and visible data-state copy |

```jsx
<AttentionRail level="urgent">
  <CertaintyBadge state="recommended" />
  <LifecycleBadge state="waiting" reason="고객 회신 필요" />
</AttentionRail>
```

Implementation rules:

- The props above are semantic enums, not color names.
- `TruthBadge` replaces new ad-hoc `SyncBadge` tone mappings; existing `SyncBadge` is a compatibility
  wrapper so current call sites receive the same grammar during migration.
- Components expose visible Korean labels and an equivalent accessible name. Icons are never decorative
  when they carry state meaning.
- Selection/focus stays outside these primitives so a selected urgent item can retain both meanings.
- Page code must not pass raw hex/OKLCH values or choose `success`, `warning`, or `info` for a category.

## 9. Motion

Deliberate, never playful.

- Page reveal: `180–240ms`, via `.fade-up` (opacity + 4px translateY).
- Card rise / fade stagger: `120ms`.
- Dialog / sheet: `160–200ms`.
- Drawer: 180ms slide-in (`hubDrawerIn`), overlay 160ms fade (`hubFadeIn`), reduced-motion respected.
- Hover travel: no more than `4px`.
- Live indicators: `mlMoonPulse` at 1.2–1.5s.
- Urgent/critical indicators do not loop, blink, or pulse. Red already carries sufficient emphasis.
- Certainty changes may transition dashed → solid and marker → verified over `160–200ms`; do not add
  a green celebration state.

Respect `prefers-reduced-motion`.

## 10. Copy Tone

Operator voice — short, concrete, directional.

Good: `이번 주 발행 현황` · `지금 확인할 리드` · `협업 문의 보내기` · `자동화 실행 로그`
Bad: `혁신적인 솔루션` · `최적화된 시너지` · `AI 기반 차세대 경험`

## 11. Accessibility And Quality Bar

- Touch targets: minimum 44px (모바일 미디어쿼리가 button에 44px 플로어를 강제 — 예외는 `role="checkbox"`뿐).
- Text contrast: WCAG AA minimum.
- Keyboard navigation works for all core flows (⌘K palette is the fast path).
- Focus uses `outline: 1px solid var(--moon-300)` with 2px offset — never relies on browser defaults.
- Loading / empty / success / error states are part of the design, not afterthoughts.
- Color never carries state alone. Every urgent, certainty, lifecycle, and truth state includes visible
  text plus an icon, marker, edge pattern, or shape that survives grayscale and color-vision differences.
- Dashed and dotted certainty states require direct labels (`권장`, `미정`, `확인 필요`); pattern alone
  is not an accessible name.
- 아이콘/글리프 전용 버튼은 `aria-label` 또는 `tooltip` 필수 (`IconButton`을 쓰면 자동).
- 클릭 가능한 `<div>`는 `role="button"` + `tabIndex={0}` + Enter/Space 핸들러 3종 세트 없이는 금지.
  펼침/접힘 토글에는 `aria-expanded`.
- `Checkbox`는 `label` prop으로 스크린리더 이름을 전달한다 (행 제목 등).
- 각 페이지는 정확히 하나의 `<h2>` 페이지 타이틀(20px/500)을 메인 페인에 가진다 — 브레드크럼만으로 대체 금지. 카브아웃: Daily Brief 히어로(`오늘의 실행`)만 §6 Display 스케일(27–32px/700)을 쓴다 — 첫 화면의 페이지 레벨 모먼트 1곳으로 한정하며, 다른 페이지로 확장 금지.

## 12. Public vs Hub Rules

**Public** — story first. Fewer elements per fold. Bigger headings. Strong proof + CTA rhythm.

**Hub** — signal first. Compact layout. Fast scan pattern. Every metric paired with status or next action.

## 13. Anti-Patterns

Do not ship:

- Generic gradient SaaS hero
- Overpacked dashboard with 12 cards above the fold
- Neon / jewel-tone accents
- Any reintroduction of brand green, bright blue, or purple as accent
- Red for ordinary `today`, new-change, high-score, waiting, or category states
- Success/warning/info colors used as chart series or workflow categories
- Whole-component opacity used to mean uncertain or unconfirmed
- Full-card semantic fills or repeating urgent animations
- Glossy chrome, mirror reflections, Web3 metallic sheen
- Center-aligned everything
- Chart-heavy screens without a clear operator action
- Decorative icons used as filler
- Dark mode produced only by inverting colors (hub is dark-native, not dark-themed)

## 14. Implementation Map

| Concern                            | Source of truth                                              |
| ---------------------------------- | ------------------------------------------------------------ |
| Tokens                             | `apps/hub/components/hub/hub-tokens.css`                     |
| Icons                              | `apps/hub/components/hub/hub-icons.jsx`                      |
| Primitives                         | `apps/hub/components/hub/hub-primitives.jsx`                 |
| Data model / nav tree              | `apps/hub/components/hub/hub-data.js`                        |
| Shell (sidebar / topbar / palette) | `apps/hub/components/hub/hub-{sidebar,topbar,command-palette}.jsx` |
| Pages                              | `apps/hub/components/hub/pages/*.jsx`                        |
| Route mount                        | `apps/hub/app/dashboard/[[...path]]/page.jsx`                |

Build order when adding a new surface:
1. Confirm tokens cover every color / size needed — do not hardcode hex values.
2. Compose with existing primitives first; drop to raw `<div>` only when a primitive doesn't fit.
3. Add the page component under `components/hub/pages/` and register in `hub-app.jsx` PAGE_MAP.
4. If the page introduces a new top-level route, add it to `NAV_TREE` in `hub-data.js`.

## 15. Decisions Log

| Date | Decision | Status | Rationale |
| --- | --- | --- | --- |
| 2026-07-19 | Separate interaction, urgency, certainty, lifecycle, and source truth into distinct visual channels | confirmed | Prevents semantic color drift while keeping urgent work immediately scannable |
| 2026-07-19 | Allow danger red for true urgency, blocking failure, and destructive action | confirmed | Immediate-loss states need a stronger signal than the neutral system |
| 2026-07-19 | Express recommended/unknown states through line pattern, marker, label, and luminance | confirmed | Keeps the palette restrained and avoids presenting a recommendation as fact |
| 2026-07-19 | Freeze new category use of success/warning/info and new colored Personal/Company labels | confirmed | Color remains rare and meaningful; existing usages can migrate incrementally |
| 2026-07-19 | Add semantic state primitives before broad page migration | confirmed | Central ownership prevents each tab from inventing a different color grammar |
| 2026-07-19 | Apply the first migration to Overview, My Work, Follow-ups, Decisions, Automations, Segments, and Settings | confirmed | Proves the grammar across urgency, certainty, lifecycle, truth, charts, and category labels |
| 2026-08-05 | 상태 primitive 채택 실측 보정: `TruthBadge`는 `SyncBadge` 래퍼로 전면 적용, `CertaintyBadge`·`LifecycleBadge`는 일부 표면, `AttentionRail`은 미채택(레일은 §8.1 inset 1px 규칙으로 인라인 구현이 현행) | confirmed | 2026-08-05 system-eval — 위 행의 "완료" 선언과 실제 코드가 달랐다. 계약(1px 레일·중립 lifecycle·truth 상태)은 전 표면 준수로 정리했고, primitive 껍데기 교체는 잔여 마이그레이션으로 남긴다 |
