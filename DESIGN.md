# Moonlight Design System

> Current version — reflects the Moonlight Pro bundle now shipped in `apps/hub`.
> Last reconciled against the code: 2026-09-23 (`10854ed`). Statements about the code below were re-measured on
> that tree. Where the code and a §15 decision disagree, the gap is named in place — it is not silently resolved.
> Scope: tokens, components, interaction, motion, accessibility. On product questions (priority, screens, IA) the
> order in `docs/README.md` §1 wins — operator profile → personal operator OS deep design → latest topic spec →
> this file. `docs/design-guidelines.md` is SUPERSEDED history; never cite it as a design source.
> Status words follow the operator docs: `confirmed`/확정 is an operator decision, `recommended`/권장 is not yet one.
> Existing token names below match `apps/hub/components/hub/hub-tokens.css` verbatim.
> The old "Com_Moon" product name is retired from design copy. "Moonstone Command Deck" remains the working
> visual direction (§4). Code namespaces (`COM_MOON_*` env vars, `@com-moon/*` packages) are unchanged.

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
4. **Respect mobile reality.** Every surface must stay usable on a phone: at 390×844 the first screen shows the
   Quick Capture and the first actionable item, touch targets are 44px, and inputs are at least 16px (deep design §17·§20).
   The current state of each floor is measured in §7 Responsive.
   Read `mobile-first` (§2) as this quality floor. Phone-only features (push notifications, share sheet) are later
   by operator decision (operator profile §4 "휴대폰 푸시 알림은 후순위"); `docs/README.md` §2 summarizes the
   2026-07-13 interview more broadly as "모바일은 후순위". The two phrasings have not been reconciled by the
   operator — do not use either one to drop the 390px floor or to reorder product priorities.
5. **Restraint wins.** One accent, a small surface vocabulary, deliberate typography.

## 4. Visual Direction — Moonlight Pro

Working direction: **Moonstone Command Deck** — the cool precision of a flight instrument
panel or a surgical console. Premium because it is calibrated, not decorated.

**Reference blend:** Linear (dark operational density) × Apple Pro (cool silver machining) ×
Bloomberg (command-deck rhythm: status / count / next action).

- `apps/hub`: dark-native. Void surfaces, moonstone silver accents, hairline borders. "Dark-native" describes
  where the palette was designed, not the daytime default: automatic mode shows light from 07:00 to 18:00 (§5),
  and the Futura texture (§15 2026-09-18) was drawn on the light theme. Both themes are first-class;
  check every change in both.
- `apps/engine`: invisible by default, surfaced through health, status, run logs, and webhook outcomes.
- `Content / Studio` surfaces: slightly lower density inside Hub so drafting and review have breathing room.

**Do not reintroduce:**
- Warm gold / amber / champagne accents
- Jewel tones or Web3 metallic sheen
- Colored radial gradients as backgrounds
- Bright blue, green, or purple as brand accents
- Dark mode produced by inverting a light theme (hub is dark-native)

## 5. Color System

The palette has **two theme modes** (automatic is the hub default: light from 07:00 to 18:00, dark overnight, using the device local clock) sharing one
cool moonstone accent stack. The initial server render is light; after hydration the local clock
resolves automatic mode. The top-bar theme control cycles automatic → light → dark → automatic;
existing saved light/dark choices remain explicit overrides. The preference is stored as `mlp.theme`
(`lib/hub-preferences.js`), and automatic mode re-checks the clock at the 07:00/18:00 boundary and on window
focus/visibility change. Color does not classify product domains or ordinary workflow
stages. It communicates only interaction emphasis and true urgency; certainty and lifecycle
use line style, shape, icon, label, and luminance instead.

### 5.1 Canonical tokens (CSS custom properties)

Defined in `apps/hub/components/hub/hub-tokens.css` and scoped under `.hub-app`. The dark block is also the
base (`.hub-app, .hub-app[data-theme="dark"]`), so an element without `data-theme` renders dark; the light block
overrides it.

```css
.hub-app,
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
  --elevated:   oklch(1 0 0);
  /* Text is set with literals here, not through the moon ramp */
  --fg:         oklch(0.20 0.008 250);
  --fg-muted:   oklch(0.42 0.008 250);
  --fg-dim:     oklch(0.50 0.008 250);
  --fg-faint:   oklch(0.55 0.007 250);
  /* The moon ramp runs the other way (--moon-50 ≈ L 0.22 … --moon-700 ≈ L 0.88), so
     "--moon-200 fill" stays high-contrast against the surface in both themes.
     Semantic stacks shift accordingly — read hub-tokens.css for the exact values. */
}
```

Also defined in `hub-tokens.css` (names verbatim, both themes):

- Accent variants: `--accent` (`#5274a8`, theme-stable), `--accent-soft`, `--accent-line`, `--pms-moonstone`, `--moon-bg`, `--moon-line`.
- Semantic hairlines and low-alpha fills: `--success-line` / `--warning-line` / `--danger-line` / `--info-line` /
  `--personal-line` / `--company-line` (left rails and chip outlines only) and the matching `--*-bg`
  (compact banners only, never full cards or rows).
- Layering: `--z-quick-memo: 60`, `--z-project-detail: 61`, `--z-navigation-overlay: 64`, `--z-navigation: 65`,
  `--z-drawer-overlay: 70`, `--z-drawer: 71`, `--z-palette: 1100` (defined once on the base block).
- Shadows: `--shadow-soft`, `--shadow-card`, `--shadow-pop`.
- Radius: `--r-xs: 4px`, `--r-sm: 6px`, `--r: 10px`, `--r-lg: 14px`, `--r-xl: 20px` (§7). Call sites use `--r` for the middle step; the undefined `--r-md` references were removed (§15 2026-09-24).
- Motion: `--dur-hover`, `--dur-enter`, `--dur-panel`, `--dur-overlay`, `--dur-celebrate`, `--dur-gauge`, `--ease-hub`, `--ease-gauge`, `--stagger-step` (§9).
- Selected project gauge only (§5.2 exception): `--project-gauge-0/25/50/75/100` (hue 255 → 218 → 190 → 280 → 325,
  i.e. blue → cyan → teal → violet → magenta), `--project-gauge-spark`, `--project-gauge-glow`, `--project-gauge-tip-line`.
  No other surface may read these tokens.

Futura layer tokens live in `apps/hub/components/hub/hub-futura.css`, also on `.hub-app` (so they resolve on every
dashboard page, §7 Futura): spacing `--fx-page-pad: 48px`, `--fx-section-gap: 44px`, `--fx-card-pad: 26px`, `--fx-gap: 16px`;
type `--fx-hero: 44px`, `--fx-hero-weight: 300`, `--fx-title: 27px`, `--fx-stat: 38px` (currently unused),
`--fx-eyebrow: 11px`; `--fx-pill: 999px`; and the two-step `--fx-shadow` / `--fx-shadow-lift` (re-set for dark).

### 5.2 Usage rules

- **Accent anchor:** `--accent` is the theme-stable Moonstone `#5274a8` alias. Accent means current position, selection,
  focus, or the single primary action. It never means a category.
- **Primary CTA:** use `--moon-200` fill with `--moon-100` border (`.hub-btn--primary`; hover one rung up to
  `--moon-100` / `--moon-50`). Keep one visually dominant
  primary CTA per view; global and page-level create actions must not compete.
- **Surface order:** `--bg` → `--surface` → `--surface-2` → `--surface-3` for nested elevation.
- **Borders:** always `1px`. Never thicken. Use `--line-soft` for hairlines, `--line` for dividers,
  `--line-strong` only for pressed/emphasized states.
- **Gradients:** reserved for the brand mark and the moonstone CTA rim. Never fill a hero, card,
  or section background with a colored gradient. The Moonlight symbol uses a cool silver gradient in
  `public/icon.svg` (§15 2026-09-24); the primary rim remains an inset shadow and is no longer overridden
  by Futura's generic button shadow. The gauge track below is the only other sanctioned colored gradient. Neutral utility
  gradients (`ScrollShadowX` edge fades to `--bg`, the `Placeholder`
  surface stripe, a `currentColor` strike line) are mechanics, not decoration, and stay allowed. Other colored
  gradients in the code are recorded debt, not precedent (§14 Known gaps 7): the completed / overachieved
  `Progress` fills (moonstone gradient, infinite shimmer, gold end stop), Home's `.fx-progress--completed`
  moonstone fill, and the `--moon-300 → #ffd166` fills in personal revenue and the revenue heatmap.
- **Selected project progress gauge exception (2026-09-23):** its narrow track alone may use a
  five-stop gradient (blue → cyan → teal → violet → magenta, `--project-gauge-*` in §5.1) across fixed
  0/25/50/75/100% positions. Numeric scale marks and the evidence
  label remain visible; the colors describe percentage position, not lifecycle, urgency, or actual
  work velocity. Do not extend the gradient to the surrounding summary/card or other status surfaces.
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
- **Value emphasis vs accent:** `--moon-100`~`--moon-300` doubles as the foreground luminance ramp
  (`--fg` = `--moon-100`). Setting a data value (금액·수치) in `--moon-200` is **luminance emphasis
  of foreground data, not accent semantics** — it does not mean current/selected and does not
  classify a category. This is the one sanctioned use of the moon ramp outside §5.2 accent meanings;
  it applies only to scalar data values, never to labels, badges, or status text.

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
| Display  | `SUIT Variable`       | Page-level moments only; avoid decorative display type in dense Hub surfaces. Two display scales are sanctioned (§11): the Daily Brief hero (`clamp(26px, 3.2vw, 32px)` / 700, inline in `daily-brief.jsx`) and the Futura scale (`--fx-hero` 44px / 300, 30px at ≤900px) used by `.fx-hero` and `.fx-page-title`. There is no `--font-display` token. |

Fallbacks: `'Inter Tight', ui-sans-serif, system-ui, sans-serif` for sans, `'Cascadia Code', 'Cascadia Mono', ui-monospace, 'SF Mono', Consolas, monospace` for mono (JetBrains Mono is now bundled and first in `--font-mono` inside `.hub-app`; outside the hub scope `globals.css` maps `--font-mono` to `@com-moon/ui`'s stack, which starts with IBM Plex Mono).

Hub fonts are exactly two: SUIT Variable and JetBrains Mono. The former `MaruBuri` serif (five weights) and the
`--font-display` alias were removed from `app/globals.css` and `public/fonts/` in the 2609 merge. Only the family
*name* survives inside `@com-moon/ui`'s `--cm-font-serif` stack with no matching `@font-face`, so it resolves to a
system serif. Do not introduce serif display type.

**Rules**
- Hub defaults to sans at 14px / `font-feature-settings: 'cv11', 'ss01', 'ss03'`.
- **Hybrid number rule.** Hero / display figures (KPI values, big metrics ≥ 18px) use `.stat` — SUIT **sans** with `tabular-nums lining-nums` and a touch of display tracking (`-0.015em`), for a premium, non-code read. Instrument data (IDs, timestamps, inline values, counts < 18px) uses `.mono` — bundled JetBrains Mono, `letter-spacing: 0`. Don't set large display numbers in mono; don't set IDs/timestamps in sans.
- 데이터 숫자는 크기로 나눔: 큰 지표는 `.stat`(sans tabular), 인라인/계기 데이터는 `.mono`(JetBrains Mono) + `tabular-nums` (column-stable). 사인에 남는 소형 카운트는 `.num` 유틸.
- 데이터 값의 최소 크기 12px — 10–11px은 라벨 / eyebrow 전용.
- Section eyebrow comes from the `SectionTitle` primitive: an `<h3>` at 11px, uppercase, `letter-spacing: 0.12em`,
  `color: var(--fg-dim)`, weight 500. Inside Futura pages `.fx-eyebrow` uses 11px / `0.14em` / 500. This file
  used to say `0.1em`, and many shell and page labels still do (`.hub-topbar__section`, `.daily-brief__card-head`,
  `.fx-triage-kind`, several inline labels) — that spread is drift. §8 makes the primitive the source of truth:
  reach for `SectionTitle` (or `.fx-eyebrow` in Futura scope) rather than restyling an eyebrow inline.
- Never mix more than two families on one screen.

## 7. Layout System

### Widths
- Hub pages fill the shell's main pane; no hub page uses a shared container. The formulas this file used to
  list survive only as unused `@com-moon/ui` tokens (`--cm-container-hub: min(1440px, calc(100vw - 24px))`,
  `--cm-container-public: min(1120px, calc(100vw - 32px))` in `packages/ui/tokens.css`, loaded through
  `globals.css`). Pages that cap their width do it with a plain `max-width`, and the values have drifted: 1440px
  (personal revenue), 1280px (revenue, overview), 1120px (inquiries, content performance), 1100px (automations,
  follow-ups, sheets sync, settings, project timeline). The public web is detached (§1, §12).
- The expanded sidebar is 232px by default and resizable from 200 to 360px (`mlp.sidebarWidth`); collapsed it is
  a 56px icon rail (`mlp.sidebarCollapsed`). Both are desktop-only (§15 2026-09-22, 2026-09-23).
- Shell navigation is one level deep: 9 primary + 2 utility anchors in the sidebar (`hub-nav.js`, pinned by
  `hub-nav.test.mjs`; 10 + 2 until 2026-09-24, when the 고객 연락 anchor became 영업·매출's first tab, §15). An
  anchor's second-level destinations render as the top-bar tab row (`topNavigationForRoute`), not as a sidebar
  accordion — since 2026-08-04 (`5a3d506`), guarded by the test "sidebar is one level deep and the top bar owns
  contextual tabs". Pages in `PAGE_OWNS_TABS` draw those tabs in their own header instead.
- A route that left the tab row but stays routable lights the nearest tab through the anchor's role table and
  keeps its own title in the top bar (`routeTabs`/`routeLabels`, today only 영업·매출's `REVENUE_ROUTE_TABS`):
  Leads/Accounts → 고객, 개요/히트맵 → 거래, Cases → no tab but still titled. An exact tab path always wins over a
  role alias (개인 스코프 개요 = 현금 흐름).

### Spacing scale
`4, 8, 12, 16, 24, 32, 48, 64, 96` — Futura pages add `44` and `26` as layer tokens only (below).

### Density (fixed)
The hub ships one fixed density — no user-facing toggle. Values (CSS custom properties on `.hub-app` in
`hub-tokens.css`): `--row-h: 36px`, `--pad-y: 10px`, `--pad-x: 14px`, `--gap: 12px`, `--section-gap: 24px`,
`--card-pad: 20px`. Small screens tighten two of them: ≤900px `--section-gap`/`--card-pad` 16px, ≤560px 12px/14px.

### Radius
- Micro elements (chips, checkbox faces): `4px` (`--r-xs`)
- Small controls: `6px` (`--r-sm`) — what `Button`, `IconButton` and the `SegmentedControl` track render today
  (inline in the primitive; segment buttons are 4–5px). `Input` gets `--r-sm` from its `.hub-field` wrapper;
  `TextField`/`TextAreaField` get it from `.hub-input`.
- Popover / menu containers: `10px` (`--r`) — text inputs use `--r-sm`
- Standard cards: `14px` (`--r-lg`) — `Card` keeps a 1px `--line-soft` border plus `--shadow-card`
- Feature panels: `20px` (`--r-xl`)
- Pills: `999px` — `Badge`, `select.hub-input` (`SelectField`), and `.fx-pill-btn` inside Futura pages

**Open gap with §15 2026-09-19 (b), confirmed.** That decision gives `Button`, `IconButton`, `Input` and
`SegmentedControl` a pill radius and lets `Card` separate by shadow instead of border. The code does not render
it: `hub-futura.css` carries the pill/shadow rules, but the primitives set `borderRadius: 'var(--r-sm)'` inline
(which beats any class rule, §8.1 Hover), `button-hover.test.mjs` pins that inline value, and the `.hub-card`
selector matches no element. 2026-09-21 later narrowed inputs back to `--r-sm` except `select`. Until the
operator re-confirms the scope and the primitive itself changes, pages must not restyle control radius locally —
use the primitive as it renders.

Writing fields (titles, notes, and multi-line content) keep `--r-sm` (6px), including
inside the Futura shell. The pill treatment applies to selection controls, not writing
surfaces. Shared `TextAreaField` controls and quick memo use 1.7 line-height and
12px vertical padding; the Studio body uses 16px padding and 1.8 line-height.

### Futura texture layer
`hub-app.jsx` imports `hub-futura.css` after `hub-tokens.css`, so it reaches every page `HubApp` mounts (all of
`/dashboard`; `/login` loads only `hub-tokens.css`). It works at two depths. (Its own header comment still says it
applies only inside `.hub-futura`; that is true of the page texture, not the shell block.)

| Depth | Where | What it changes | Status |
| --- | --- | --- | --- |
| Shell + shared components | every dashboard page | renders: sidebar surface `--surface-2`; nav rows 34px/13px with the current row as a `--surface` pill + `--fx-shadow` (icon + label, §15 2026-09-23); `.fx-shell-card` search and user card; `--fx-shadow` on non-ghost `.hub-btn`; pill `select`; `--fx-shadow-lift` on raw `.hub-card-link:hover` buttons. Declared but beaten by inline styles or unmatched: pill `.hub-btn`/`.hub-iconbtn`/`.hub-seg`, shadow `.hub-card` (§7 Radius) | confirmed 2026-09-19 · icons 2026-09-23 |
| Page texture | inside `.hub-futura` only | 48/44/26 spacing, 44px/300 display title (§11), `.fx-card` shadow surfaces, `.fx-pill-btn`, triage and timeline blocks | `dashboard/home` confirmed 2026-09-18 · `work/decisions` confirmed 2026-09-19 · `work/rhythm` **recommended** 2026-09-23 · 영업·매출 `revenue/followups`·`revenue/customers`·`revenue/deals` confirmed 2026-09-24 (being implemented) |

Adding `.hub-futura` to any other page is a separate decision (§15 2026-09-18) — every other page keeps §7
density and §8.1 hairlines. That includes the rest of 영업·매출: the 문의 tab and the screens that left its tab
row (개요·히트맵·Leads·Accounts·Cases, ClassIn aliases, 세그먼트) stay on §7 density until decided separately.
Only `work/decisions` owns its own tabs (`PAGE_OWNS_TABS`); Rhythm and the three 영업·매출 pages keep the
top-bar tab row (the approved mockups draw it there).
`dashboard/agents/chat`의 멘토 서가는 운영자 승인 목업에 따라 제목 한 곳만 42px 디스플레이로 읽는다.
이 예외는 `.hub-futura` 페이지 텍스처를 그 경로나 다른 AI 화면으로 확장하지 않는다(§15 2026-09-24).

### Responsive
The hub has no Tailwind. CSS is desktop-default with `max-width` step-downs in `hub-tokens.css`, `globals.css`,
`hub-futura.css` and page stylesheets. Measured breakpoints (2026-09-23):

| Width | Role |
| --- | --- |
| `≤900px` | **Shell breakpoint** (`MOBILE_NAV_QUERY` in `hub-app.jsx`): the sidebar becomes an overlay drawer (`min(84vw, 304px)`), the collapsed rail and width handle disappear, density tightens, Futura titles drop to 30px |
| `≤720px` or `pointer: coarse` | Touch floor: `button` and `[role="button"]` ≥44px (bare `role="checkbox"` exempt, a labelled `.hub-checkbox-row` keeps 44px), inputs ≥44px, `.hub-input` 48px, `textarea.hub-input` 112px |
| `≤600px` | Page and drawer step-downs (most common page query); `Drawer presentation="compact"` becomes a bottom sheet |
| `≤560px` | `--section-gap` 12px, `--card-pad` 14px |

Other widths are drift: 768 and 960 also sit in the shared `hub-tokens.css`/`globals.css`, and 640, 700, 1200
plus single uses live in page stylesheets. Unifying them is an open TODO, not a rule (`TODOS.md`). Reusing the
four widths above for new queries is **recommended**, not decided.

Mobile floor status against deep design §17 (390×844):
- Met: 44px touch floor (above); segmented controls stay horizontal on phones (no forced `flex-basis: 100%`).
- Met: inputs ≥16px at ≤720px or coarse pointer through the shared mobile rule; desktop `.hub-input` remains 13.5px.
- Not met: Calendar should default to an agenda on phones. `work.jsx` Calendar opens in `week` with no mobile
  branch. Agenda-style lists exist elsewhere (`WeekAgenda` on 내 작업, the 오늘 일정 list on Daily Brief), not in Calendar.

## 8. Component Language

Primitives live in `apps/hub/components/hub/hub-primitives.jsx` and must be the source of
truth. Do not recreate them ad-hoc inside pages.

**Available primitives**
- `Badge` — soft / outline, 8 tones (neutral · moon · success · warning · danger · info · personal · company)
- `Dot`, `Kbd`, `Avatar`, `Divider`
- `Card` (padded / unpadded), `SectionTitle`, `Tabs`
- `Button` (primary · secondary · ghost · outline · danger), `IconButton`
- `Input`, `Checkbox`, `Progress`, `ProgressRing`, `Sparkline`, `Placeholder` (0 call sites), `Skeleton` (loading placeholder — `role="status"`, pulses with `mlMoonPulse 1.4s`; never rendered for `preview`/`error`)
- Form fields `TextField`, `TextAreaField`, `SelectField`, `CheckboxRow`, `DateQuickPresets` — defined in
  `hub-primitives.jsx` itself (there is no `form-fields.jsx`); the contract lives in `form-fields.test.mjs`
- `SegmentedControl`, `ChipToggle`, `EmptyState` (+ `action` CTA), `ScrollShadowX`
- Toast: `useToast` / `ToastProvider` (re-exported from `hub-toast.jsx`, provided once in `hub-app.jsx`). One
  `aria-live="polite"` viewport; danger items get `role="alert"`, others `role="status"`; tones neutral (bell) ·
  success (check glyph in `--moon-200`, never green) · danger (x in `--danger`); optional ghost-`Button` action; at
  most three visible. Use it for save/undo receipts instead of ad-hoc
  banners. A toast never announces `완료` for a write that was not persisted (§8.1 Save envelope).
- `Drawer`, `EditDrawer` — the only overlay / edit surfaces (§8.1)
  - `Drawer presentation="compact"` is the short capture variant: centered on desktop, bottom sheet at ≤600px, with the same ESC and focus handling. Default `side` remains the edit drawer. New task capture uses `compact`; optional description/next-action fields are disclosed on demand. Compact capture uses a 6px backdrop blur. Callers preserve drafts and guard dismissal while saving.
- State primitives `AttentionRail`, `CertaintyBadge`, `LifecycleBadge`, `TruthBadge` (§8.2). `SyncBadge`
  survives only as a compatibility wrapper over `TruthBadge`; new call sites use `TruthBadge` directly.

**Shared composites outside the primitives file** (reuse before rebuilding)
- `BrandMark`, `ProjectProgressGauge`, `ProjectStatusBadge` — `pages/project-pms-components.jsx`.
  `BrandIcon` (`brand-icons.jsx`) is used by the brand directory, Overview, Revenue and PMS brand references.
- `StreakMark` — `burning-streak.jsx` (neutral ascending bars, §15 2026-09-22)
- `CalendarOutcome` (`calendar-outcome.jsx`, compact mode on Home), `ContactRecordForm` / `ContactRecordDrawer`
  (`contact-record-form.jsx`), `GlobalQuickCapture` (`quick-capture.jsx`), `GoalLinks` (`goal-links.jsx`)
- `SortHead` — exported from `pages/revenue.jsx`, reused by `customers.jsx` (§8.1 Table sort)

**Hub-specific composites** (page-level, see `components/hub/pages/*`)
- Signal card (Daily Brief)
- Metric card w/ sparkline
- Brand-organized project tree (PMS `tree` view, `buildContainerTree`)
- Deal kanban
- Key / webhook copy rows (`CopyRow` in `evolution-settings.jsx`)
- Not shipped: the Flow canvas listed here earlier. `dashboard/automations/flows` renders an `EmptyState`
  ("등록된 Flow가 없습니다") and the sidebar row is `deferred`; there is no drag-pan canvas or node kinds in code.

**Behavior rules**
- Buttons have clear primary / secondary / ghost hierarchy.
- Empty states explain the next useful action.
- Tables stay narrow — prefer fewer columns and clearer status chips over spreadsheet density.
- Dashboards prioritize trend + urgency over raw counts alone.

### 8.1 Interaction Conventions (표준 동작 — 새 서피스는 이 계약을 따른다)

**Primitives first.** 페이지 안에서 pill 토글·sync 라벨·빈 상태·체크박스·로딩 자리를 다시 만들지 않는다.
`SegmentedControl`(필터/뷰 토글), `TruthBadge`(live·partial·syncing·loading·preview·error — 새 호출처),
`EmptyState`(+ `action` CTA), `Checkbox`(`label` prop 필수), `Skeleton`(로딩), `Drawer`/`EditDrawer`가 canonical.
`SyncBadge`는 같은 상태를 받는 `TruthBadge` 호환 래퍼일 뿐이다(§8.2). `mock` 상태는 없다 — 목업 데이터를 코드에
두지 않으므로(CLAUDE.md, `scripts/no-mock-data.test.mjs`) 표시할 일도 없고, 모르는 값은 `읽기 실패`(danger)로
떨어진다. 인라인 복제는 이미 두 번 드리프트 사고를 냈다(2026-07 design-review FINDING-002/003).

**생성(Create).**
- 모든 리스트 서피스는 헤더에 primary 생성 버튼 + `<Kbd>N</Kbd>` 힌트.
- 페이지 레벨 `N` 단축키: 드로어 닫힘 + 포커스가 input/textarea/select/contentEditable 밖일 때만. 새 페이지는
  손으로 쓰지 말고 `use-crm-keyboard.js`의 `usePageCreateHotkey`(또는 CRM 목록은 `useCrmKeyboard`의 `onNew`)를 쓴다.
  내 작업은 인라인 빠른 추가 칸이 생성 표면이라 `N`이 그 칸으로 포커스한다.
- 전역 단축키(`hub-app.jsx`): `C` 어디서든 빠른 입력(`GlobalQuickCapture`, compact Drawer — 2026-09-20)과 `?` 단축키
  치트시트(`ShortcutOverlay`)는 입력 요소 안·팔레트 열림이면 무시한다. `⌘K` 팔레트와 `⌘J` AI 어드바이저는 수정키 조합이라
  입력 중에도 동작한다. 페이지 단축키는 이 네 키와 겹치지 않게 고른다.
- 빈 상태(워크스페이스 빈 화면·검색 0건)는 반드시 생성 CTA 또는 "검색 지우기"를 포함.
- 칸반 컬럼 하단에 점선 "+ 추가" — 클릭하면 **그 컬럼의 stage로 시드**된 레코드가 생성되고 드로어가 즉시 열린다.

**편집(Edit).**
- 행/카드 클릭 → `EditDrawer`. `role="button" tabIndex={0}` + Enter/Space 핸들러 동반.
- 닫기: ESC + 오버레이 클릭 + 닫기 버튼 3중 지원 (Drawer primitive가 처리).
- 저장은 `{ ok, status }` 봉투(Save envelope). 어휘는 심화 설계 §16과 같다 — 성공 `saved`(영속) · `accepted` ·
  `duplicate`(이미 저장됨, 같은 요청 재시도), 실패 `failed` · `conflict`(다른 곳에서 먼저 바뀜 — 비교·선택 제공) ·
  `degraded`. 여러 라우트가 쓰는 `error`(읽기 실패 봉투와 같은 값)도 실패로 읽는다. `preview`는 백엔드 미설정이라 **저장되지 않았다**는 뜻이다(`saved: false`). 로컬 행을 남기더라도
  `Preview · 연결 필요` 표시를 붙이고 `완료`·`저장됨` 문구나 성공 토스트를 쓰지 않는다(심화 설계 §16 금지 항목).
- 딥링크: `?lead=<id>` `?deal=<id>`는 기록 로드 후 해당 드로어를 1회만 열고 쿼리를 소거한다. 페이지별 딥링크는
  이 밖에도 `?case=`·`?customer=`·`?project=`/`?task=`/`?item=`·`?memo=`·`?inquiry=`·`?goal=`·`?discovery=` 등이 있다
  (각 동작은 해당 페이지가 정본). 새 딥링크는 "기록 로드 후 1회 열기 + 소거"를 기본으로 한다.

**테이블 정렬.**
- 헤더 클릭: asc → desc → 해제(기록 순서) 3단 토글, 방향 캐럿은 비활성일 때도 폭 예약.
- 금액은 표시 문자열(`₩1.2M`/`₩900K`)을 숫자로 파싱해 정렬, 단계는 퍼널 순서로 정렬 (알파벳 금지).

**상태 표시.**
- 좌측 액센트 스트라이프는 `inset 1px 0 0` box-shadow — 토큰은 `--*-line`(저채도) 또는 위급 레일에 한해 본색 `--danger`를 쓴다(현행 코드·state-usage 테스트 기준). 배경 fill·두꺼운 보더 금지 (§5.2). **유일한 예외**: 브랜드 컨텐츠 로그(`dashboard/brands/log`)가 `inset 3px 0 0` + 브랜드 아이덴티티 색을 쓴다 (§15 2026-09-01 운영자 확정). 다른 표면으로 확장 금지.
- stalled 기준은 `STALLED_DAYS`(현재 14일) 상수 하나 — 페이지별 하드코딩 금지.

**Hover.**
- 인터랙티브 행은 `className="hub-row"` — `onMouseEnter/Leave` JS 핸들러를 새로 쓰지 않는다
  (reduced-motion 무시 + 드리프트 원인). 기존 JS hover는 해당 파일을 만질 때 옮긴다.
- 카드형 클릭 타깃은 `.hub-card-link`(보더 강조 + 1px 상승), 칸반 카드는 `.hub-kanban-card`(`--surface-3`로 상승),
  아이콘 버튼은 `.hub-iconbtn`, `Button` primitive는 `.hub-btn` + `.hub-btn--<variant>` — 전부 같은 no-JS 계약이며
  휴지 서피스만 다르다.
- `Button`의 휴지 variant chrome(색·배경·보더·radius)도 `hub-tokens.css`가 소유한다. 인라인 스타일은 모든 클래스
  규칙을 이기므로, 휴지 값이 인라인에 남아 있으면 `:hover` 규칙은 절대 발동하지 않는다 (§15 2026-09-15).

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

Adoption measured 2026-09-23 (JSX call sites, tests excluded):

| Primitive | Call sites | Note |
| --- | --- | --- |
| `TruthBadge` | 54 in 31 files | direct use, not counting `SyncBadge`'s own delegation; new code starts here |
| `SyncBadge` | 35 in 16 page files | compatibility wrapper, same states; migrate when the file is touched |
| `CertaintyBadge` | 11 in 7 files | Daily Brief, Decisions, Brands, Office, Revenue, Customers, personal revenue |
| `LifecycleBadge` | 12 in 8 files | incl. `CalendarOutcome`, Discovery, Codex jobs, PMS status |
| `AttentionRail` | 0 | the example above is illustrative. Rails stay the §8.1 inline 1px `box-shadow` (§15 2026-08-05) and `state-usage.test.mjs` asserts the PMS timeline does not adopt it |

Implementation rules:

- The props above are semantic enums, not color names.
- `TruthBadge` replaces new ad-hoc `SyncBadge` tone mappings; existing `SyncBadge` is a compatibility
  wrapper so current call sites receive the same grammar during migration.
- Components expose visible Korean labels and an equivalent accessible name. Icons are never decorative
  when they carry state meaning.
- Selection/focus stays outside these primitives so a selected urgent item can retain both meanings.
- Page code must not pass raw hex/OKLCH values or choose `success`, `warning`, or `info` for a category.
  The one sanctioned exception is the brand content log's 8-color identity palette (`lib/brand-content-log.js`),
  confined to `dashboard/brands/log` and always paired with the brand name label (§15, 2026-09-01).

## 9. Motion

Deliberate, never playful. Since 2026-07-29 the only sanctioned durations and curve are the motion tokens in
`hub-tokens.css`; raw `ms` literals inside pages are legacy debt to migrate whenever the file is touched.

| Token | Value | Use |
| --- | --- | --- |
| `--dur-hover` | `120ms` | hover / press feedback: `.hub-row`, `.hub-card-link`, `.hub-iconbtn` |
| `--dur-enter` | `200ms` | page reveal (`.fade-up`), card cascade (`.stagger-up`), list exits |
| `--dur-panel` | `180ms` | drawer slide-in (`hubDrawerIn`), project detail panel |
| `--dur-overlay` | `160ms` | overlay fade (`hubFadeIn`), ⌘K palette overlay |
| `--dur-celebrate` | `420ms` | one-shot completion moment only — Rhythm check pop/ripple and the day ring closing (`rhythm-today.css`). Never loops |
| `--dur-gauge` | `1080ms` | selected project evidence gauge reveal and one-shot sparkle |
| `--ease-hub` | `cubic-bezier(0.2, 0.7, 0.3, 1)` | every entrance / exit curve |
| `--ease-gauge` | `cubic-bezier(0.58, 0.06, 0.22, 1)` | gauge-only slow start, faster middle, settled end |
| `--stagger-step` | `45ms` | per-child delay in `.stagger-up`; the delay grows through the 8th child (7 steps, 315ms) and stays there for every later child |

- Page reveal: `.fade-up` (opacity + 4px translateY). Card lists cascade with `.stagger-up`; do not hand-roll delays.
- Hover travel: no more than `4px`.
- Compact capture: enter/exit and disclosure use `--dur-panel`, backdrop enters with `--dur-overlay`. A successful save closes only after the server acknowledgement; reduced-motion skips the exit delay.
- Live indicators: `mlMoonPulse 1.4s ease-in-out infinite` — one duration everywhere. Loading skeletons (`Skeleton`) reuse it as-is, with no per-line phase offset (a wave reads as playful).
- `motion.test.mjs` sweeps every hub stylesheet and page for raw `ms` **and `s`** literals and inline `cubic-bezier(` inside transition/animation values — the §9 token rule is enforced, not advisory (2026-09-16, `s` added 2026-09-22). Allowed without a token: `mlMoonPulse 1.4s` and `0s`.
- Recorded debt, not precedent: the completed `Progress` bar loops `hubProgressShimmer 2.4s ease-in-out infinite`, and `hubSparklePop` still appears once with an inline `0.8s` next to a gold glyph (`overview.jsx`). The motion guard exempts exactly these two names until the celebration question (Q134, `2026-09-21-home-screen-design-development.md`) is decided. New work uses `--dur-celebrate` one-shots instead.
- Urgent/critical indicators do not loop, blink, or pulse. Red already carries sufficient emphasis.
- The selected project gauge may replay its fill and one sparkle when the selected project or its
  displayed percentage changes. This is visual acceleration, not a claim that work velocity rose.
  No continuous shimmer; reduced motion renders the final value without sparkle.
- Certainty changes may transition dashed → solid and marker → verified over `--dur-overlay`…`--dur-enter`;
  do not add a green celebration state.

Respect `prefers-reduced-motion`. The hub scope already disables every animation and transition under the
media query as a safety net (`hub-tokens.css`); page code must not re-enable motion inside it.

## 10. Copy Tone

Operator voice — short, concrete, directional.

Good: `이번 주 발행 현황` · `지금 확인할 리드` · `협업 문의 보내기` · `자동화 실행 로그`
Bad: `혁신적인 솔루션` · `최적화된 시너지` · `AI 기반 차세대 경험`

## 11. Accessibility And Quality Bar

- Touch targets: minimum 44px. `hub-tokens.css`의 `(pointer: coarse), (max-width: 720px)` 쿼리가 `button`·`[role="button"]`·
  입력에 44px 플로어를 강제한다 — 예외는 라벨 없는 `role="checkbox"`뿐이고, 글자를 가진 `.hub-checkbox-row`는 44px를 유지한다.
  이 쿼리는 셸 기준점(900px)과 다르다(§7 Responsive).
- Mobile inputs: 16px 이상(심화 설계 §17, iOS 확대 방지). 공통 `(pointer: coarse), (max-width: 720px)` 규칙이 입력 컴포넌트와 인라인 작은 글자 선언보다 우선해 이 플로어를 보장한다.
- Text contrast: WCAG AA minimum.
- Keyboard navigation works for all core flows (⌘K palette is the fast path).
- Focus uses `outline: 1px solid var(--moon-300)` with 2px offset — never relies on browser defaults. A focus rule changes only the outline; it never sets `border-radius` (the ring follows the element's own radius — see §15 2026-09-16).
- Loading / empty / success / error states are part of the design, not afterthoughts. Where the layout is known, loading renders `Skeleton` — not a bare `불러오는 중…` line and never an `EmptyState` (that copy means "nothing here", which is a different truth state).
- Color never carries state alone. Every urgent, certainty, lifecycle, and truth state includes visible
  text plus an icon, marker, edge pattern, or shape that survives grayscale and color-vision differences.
- Dashed and dotted certainty states require direct labels (`권장`, `미정`, `확인 필요`); pattern alone
  is not an accessible name.
- 아이콘/글리프 전용 버튼은 `aria-label` 또는 `tooltip` 필수 (`IconButton`을 쓰면 자동).
- 클릭 가능한 `<div>`는 `role="button"` + `tabIndex={0}` + Enter/Space 핸들러 3종 세트 없이는 금지.
  펼침/접힘 토글에는 `aria-expanded`.
- `Checkbox`는 `label` prop으로 스크린리더 이름을 전달한다 (행 제목 등).
- 각 페이지는 정확히 하나의 `<h2>` 페이지 타이틀(20px/500)을 메인 페인에 가진다 — 브레드크럼만으로 대체 금지. 공용
  PageHeader 프리미티브는 없다: 대부분 인라인 `style={{ margin: 0, fontSize: 20, fontWeight: 500 }}`이거나 페이지 CSS가 같은
  값을 준다. 승인된 카브아웃은 두 가지다(개인 매출 헤더의 `clamp(22px, 2.5vw, 28px)` h2는 승인되지 않은 이탈 — §14 Known gaps 12).
  - Daily Brief 히어로(`오늘의 실행`): §6 Display 스케일 `clamp(26px, 3.2vw, 32px)`/700 — 첫 화면의 페이지 레벨 모먼트 1곳.
  - Futura 페이지(§7 Futura): `<h2 className="fx-hero">`/`"fx-page-title">` 44px/300(≤900px 30px) — `dashboard/home`(확정
    2026-09-18)·`work/decisions`(확정 2026-09-19)·`work/rhythm`(권장 2026-09-23)·영업·매출의 `revenue/followups`(오늘 연락)·
    `revenue/customers`(고객)·`revenue/deals`(거래)(확정 2026-09-24, 구현 중).
  그 밖의 페이지로 확장하지 않는다 — 같은 영업·매출 안의 문의 탭과 탭에서 내려온 화면도 20px/500 그대로다.

## 12. Public vs Hub Rules

**Public** — story first. Fewer elements per fold. Bigger headings. Strong proof + CTA rhythm.
_Dormant: this workspace has no public web app (`apps/` holds only `hub` and the API-only `engine`). Keep the
rule for when a public surface returns; it does not apply to anything shipped today._

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
| Futura 텍스처 레이어 (셸·공용 컴포넌트 전역 + `.hub-futura` 페이지 — 홈·결정·리듬 + 2026-09-24 영업·매출 3곳, §7) | `apps/hub/components/hub/hub-futura.css` |
| Icons                              | `apps/hub/components/hub/hub-icons.jsx`                      |
| Brand and app icons | `apps/hub/public/icon.svg` → `npm run icons:generate` (`scripts/generate-brand-icons.mjs`) |
| Primitives (incl. form fields)     | `apps/hub/components/hub/hub-primitives.jsx`                 |
| Drawer / toast styles              | `apps/hub/components/hub/hub-{compact-drawer,edit-drawer,toast}.css`, `hub-toast.jsx` |
| Theme mode + sidebar width/collapse preferences | `apps/hub/lib/hub-preferences.js` (`mlp.*` keys)  |
| Keyboard (global `C` `⌘K` `?` `⌘J`; page `N`) | `hub-app.jsx`; `apps/hub/components/hub/use-crm-keyboard.js` |
| ⌘K catalog (`NAV_TREE`, `LEGACY_REDIRECTS`) | `apps/hub/components/hub/hub-data.js`                 |
| Sidebar anchors (visible IA — 9 primary + 2 utility) and tab role aliases (`REVENUE_ROUTE_TABS`) | `apps/hub/components/hub/hub-nav.js` + `hub-nav.test.mjs` |
| Workspace membership (`org_scope`) | `apps/hub/components/hub/workspace-map.js`                   |
| Shell (sidebar / topbar / palette) | `apps/hub/components/hub/hub-{sidebar,topbar,command-palette}.jsx` |
| Pages + `PAGE_MAP`                 | `apps/hub/components/hub/pages/*.jsx`, `hub-app.jsx`         |
| Route mount                        | `apps/hub/app/dashboard/layout.jsx` mounts `HubApp` once; `dashboard/[[...path]]` and `content/{studio,queue}` pages render `null`; `content/publish` redirects to `queue`. `lazyPage` keeps `ssr: false` (CLAUDE.md) |

Build order when adding a new surface:
1. Confirm tokens cover every color / size needed — do not hardcode hex values.
2. Compose with existing primitives first; drop to raw `<div>` only when a primitive doesn't fit.
3. Add the page component under `components/hub/pages/` and register in `hub-app.jsx` PAGE_MAP.
4. Register the route in `NAV_TREE` (`hub-data.js`) so ⌘K can reach it. That alone does not add a sidebar
   row: to surface it in the sidebar, add or extend an anchor in `hub-nav.js` and update `hub-nav.test.mjs`.
   Workspace-scoped pages resolve membership through `workspace-map.js`, never a hardcoded brand list.

**Guards** — these tests read the code on every `npm test` and turn the rules above into failures:

| Rule | Test (`apps/hub/components/hub/` unless noted) |
| --- | --- |
| §4 warm gold/amber literals only (hex/rgb) — per-file ratchet, brand content log exempt. Other raw colors are not machine-checked | `palette.test.mjs` |
| §9 motion tokens, raw `ms`/`s`, inline `cubic-bezier(` | `motion.test.mjs` |
| §11 focus ring 1px, no `border-radius` in `:focus-visible` | `focus-ring.test.mjs` |
| §8.1 `Button` hover/chrome in CSS, 1px token borders, inline radius | `button-hover.test.mjs` |
| §8.1 `SegmentedControl` chrome in CSS | `segmented-control.test.mjs` |
| §8.2/§5.3 state primitives, truth labels, rails, lifecycle danger | `state-primitives.test.mjs`, `state-usage.test.mjs` |
| §11 `Skeleton` contract | `skeleton.test.mjs` |
| Form field contract | `form-fields.test.mjs` |
| Sidebar anchors (9 + 2) and icons in both states; 영업·매출 4 tabs + legacy route aliases; width handle | `hub-nav.test.mjs`; `sidebar-resizer.test.mjs` |
| Toast a11y and tokens | `hub-toast.test.mjs` |
| No mock/demo work records in code | `scripts/no-mock-data.test.mjs` |

**Known gaps (measured 2026-09-23 — debt or open questions, never precedent)**

1. §15 2026-09-19 (b) pill controls and shadow-separated cards are confirmed but not rendered (§7 Radius).
2. `hub-btn--subtle` (`pages/agents.jsx`) has no CSS rule.
3. Rails outside §8.1: `inset 2px 0 0 var(--moon-500)` in `floating-mentor-widget.jsx` and `pages/agents.jsx`;
   gold `border-left: 2px solid #ffd166` in `hub-tokens.css` (personal revenue) and `pages/revenue-heatmap.jsx`.
4. Style-mutating JS hover still in `hub-topbar.jsx` and `pages/automations.jsx` (§8.1 Hover).
5. Celebration vocabulary pending Q134: completed/overachieved `Progress` gradient, shimmer loop and gold stop,
   Home's `.fx-progress--completed` gradient, the gold-ended fills in `.personal-revenue-progress-fill.is-all-confirmed`
   and `pages/revenue-heatmap.jsx`, and `hubSparklePop`; the palette ratchet still carries warm literals in
   `celebration-fx.jsx`, `hub-tokens.css`, `pages/overview.jsx` and `pages/revenue-heatmap.jsx`.
6. Mobile floor: Calendar has no phone agenda (§7 Responsive). The input size floor is now global at ≤720px or coarse pointer.
7. Stale code comments: the `hub-futura.css` header ("only inside `.hub-futura`") and `hub-tokens.css`
    ("eight-anchor nav") — the pinned count is 9 + 2 since 2026-09-24 (`hub-nav.js`'s "Nine primary" is accurate
    again); and `motion.test.mjs`'s opening comment
    still says `s` units are not checked, though the test now checks them.
8. Focus-ring color is mixed (`--moon-300`, `--accent`, raw rgba) and breakpoints drift — both open in `TODOS.md`.
9. ~~Unsanctioned title scale: `.personal-revenue-header h2` used `clamp(22px, 2.5vw, 28px)`~~ — resolved 2026-09-24
    (20px/500 per §11, revenue P0 pass).

## 15. Decisions Log

| Date | Decision | Status | Rationale |
| --- | --- | --- | --- |
| 2026-07-19 | Separate interaction, urgency, certainty, lifecycle, and source truth into distinct visual channels | confirmed | Prevents semantic color drift while keeping urgent work immediately scannable |
| 2026-07-19 | Allow danger red for true urgency, blocking failure, and destructive action | confirmed | Immediate-loss states need a stronger signal than the neutral system |
| 2026-07-19 | Express recommended/unknown states through line pattern, marker, label, and luminance | confirmed | Keeps the palette restrained and avoids presenting a recommendation as fact |
| 2026-07-19 | Freeze new category use of success/warning/info and new colored Personal/Company labels | confirmed | Color remains rare and meaningful; existing usages can migrate incrementally |
| 2026-07-19 | Add semantic state primitives before broad page migration | confirmed | Central ownership prevents each tab from inventing a different color grammar |
| 2026-07-19 | Apply the first migration to Overview, My Work, Follow-ups, Decisions, Automations, Segments, and Settings | confirmed | Proves the grammar across urgency, certainty, lifecycle, truth, charts, and category labels |
| 2026-07-21 | Ship one fixed hub density; remove the user-facing density toggle | confirmed | One calibrated scale keeps surfaces comparable; the toggle only produced drift |
| 2026-07-29 | Motion tokens (`--dur-*`, `--ease-hub`, `--stagger-step`) are the only sanctioned durations; hub-scope reduced-motion safety net | confirmed | The 2026-07-29 design review found per-page ms drift and an inverted reduced-motion branch |
| 2026-08-05 | 상태 primitive 채택 실측 보정: `TruthBadge`는 `SyncBadge` 래퍼로 전면 적용, `CertaintyBadge`·`LifecycleBadge`는 일부 표면, `AttentionRail`은 미채택(레일은 §8.1 inset 1px 규칙으로 인라인 구현이 현행) | confirmed | 2026-08-05 system-eval — 위 행의 "완료" 선언과 실제 코드가 달랐다. 계약(1px 레일·중립 lifecycle·truth 상태)은 전 표면 준수로 정리했고, primitive 껍데기 교체는 잔여 마이그레이션으로 남긴다 |
| 2026-08-06 | 금액·수치 데이터 값의 `--moon-200` 착색은 accent 의미가 아니라 포그라운드 명도 램프 활용으로 명문화 (§5.2 "Value emphasis vs accent") | confirmed | 2026-08-06 7차 재감사 — 전 Revenue 표면이 일관되게 쓰는 기존 관행과 §5.2 "accent≠카테고리" 문면의 긴장을 해소. 스칼라 값 한정, 라벨·뱃지·상태 텍스트 금지 |
| 2026-08-19 | 브랜드/컨테이너 아이덴티티 마크를 혼재 기하 글리프 렌더에서 모노그램 타일(`BrandMark`, 이름 첫 글자 + 중립 surface 토큰)로 교체. PMS 표면 적용 완료, Revenue·Content는 잔여 마이그레이션 | confirmed | 운영자 지시 "아이콘 변경" — 모양·무게가 제각각인 글리프(◐ ◇ □ …)가 목록 소음의 주범. `meta.glyph` 데이터는 보존(렌더 표현만 교체). 07-15 사이드바 스펙 §8에 상세 |
| 2026-08-29 | Brands become an operating surface (Brand tab) and own the `sns-channel` category; PMS renders but never creates those containers | confirmed | Operator: "brand = content" was wrong; brand management must be separate and stricter |
| 2026-09-01 | 브랜드 컨텐츠 로그(`dashboard/brands/log`)에 한해 브랜드별 아이덴티티 컬러 허용 — 운영자 v5 디자인 첨부가 8색 팔레트(점·카드 좌측 3px 레일)를 확정. 색은 언제나 브랜드 이름 라벨과 동반(색 단독 의미 금지), 페이지 크롬은 토큰만. 다른 표면으로의 확장은 별도 결정 필요 | confirmed | 운영자가 직접 5회 이터레이션한 첨부 디자인이 08-29 브랜드 탭 스펙 §11 "브랜드 식별에 색 금지"를 이 표면에서 대체. 3px 레일도 §8.1 1px 레일 규칙의 운영자 확정 예외. 상세·미정 슬러그 매핑은 `2026-09-01-brand-content-log.md` |
| 2026-09-15 | 개인 매출 로드맵의 확실성 채널은 §5.3의 3값 enum(`confirmed`·`recommended`·`unknown`)만 쓴다. 라이프사이클 값 `waiting`("입금 대기")은 확실성에서 분리해 `closing`(deal-stages.js의 won) 단계의 `LifecycleBadge`로 옮기고, `final`(negotiation)은 "가능성 높음"으로, `contact`·`potential`은 §5.3이 지정한 unknown 어휘 "확인 필요"로 읽는다 | confirmed | 페이지 전용 4키 어휘가 §5.3 첫 문장(채널 겸직 금지)을 어겼고, `[data-certainty="waiting"]` 규칙이 없어 대기 이벤트가 `confirmed`와 같은 solid 기하로 렌더됐다. "입금 대기"가 negotiation 단계에 붙어 있던 것도 오기였다. 확실성 라벨로 쓰이던 "진행 중"은 `LifecycleBadge`의 `active` 라벨이라 재사용하면 채널이 다시 겹친다. 운영자가 볼 라벨을 바꾸는 두 건("확인 필요" 채택, "입금 대기"의 단계 이동)은 2026-09-15 운영자가 직접 확정했다 |
| 2026-09-15 | `overflow: hidden` 컨테이너 안의 full-bleed 행은 §11 포커스 링을 `outline: 1px solid var(--moon-300)` + `outline-offset: -2px`로 안쪽에 그린다 (`.hub-row` 선례) | confirmed | 양수 offset은 컨테이너에 잘려 부분 링이 된다 — §11이 막으려는 "링이 보이지 않는" 상태가 된다. §11은 링 **굵기**를 1px로 고정하고, 2px offset은 자립형 컨트롤의 기본값(`.hub-app :focus-visible`)이다 |
| 2026-09-15 | `Button` primitive의 hover를 CSS가 소유한다 — `.hub-btn` + `.hub-btn--<variant>`가 휴지 chrome과 모션을 `hub-tokens.css`에서 가지고, radius는 hover 전이 대상이 아니라 `IconButton`과 같이 인라인에 남긴다. (한때 전역 `:focus-visible`이 `border-radius: 2px`를 덮어 CSS 소유 radius가 포커스 순간 튀었다 — 그 덮어쓰기는 2026-09-16 행에서 제거됐다.) `active` prop은 `data-active` DOM 속성으로 노출해 pressed 상태도 스타일시트가 소유한다. 2026-07-29 design-review의 "Button primitive에 variant별 hover 상태 없음" 항목을 닫는다 | confirmed | 인라인 `background`/`border`/`color`가 모든 클래스 규칙을 이겨서, primitive가 2026-07부터 선언해 둔 `--dur-hover` 전이가 한 번도 발동하지 못했다. `.hub-iconbtn`(§8.1)이 이미 쓰는 계약을 그대로 적용한 것이며, hover는 §5.2대로 accent가 아니라 surface 한 단계 또는 hairline 한 단계 강조로만 표현한다 |
| 2026-09-16 | `:focus-visible` 규칙은 outline만 바꾸고 `border-radius`를 절대 설정하지 않는다. 전역 `.hub-app :focus-visible`의 `border-radius: 2px`와 `content-studio summary:focus-visible`의 radius를 제거 | confirmed | 브라우저 실측(Playwright, 1440·390) — 전역 규칙이 (0,2,0)이라 단일 클래스(0,1,0)로 radius를 갖는 모든 포커스 가능 요소를 키보드 포커스 순간에만 2px로 튀게 했다: 사이드바 nav 11곳(6→2px, 모든 페이지), PMS 칩(999→2px), 포트폴리오 메트릭 4곳(6→2px), 개인 매출 타임라인 스크롤(14→2px)·이벤트 카드(6→2px). Button에서 먼저 잡은 cascade 버그의 근본 원인이며, `focus-ring.test.mjs`가 저장소 전체를 훑어 재발을 막는다 |
| 2026-09-16 | 허브 raw `ms` 리터럴 45건을 §9 토큰으로 전환(용도 기준: hover→--dur-hover, 진입/값 변화→--dur-enter+--ease-hub, 패널/디스클로저→--dur-panel, 오버레이→--dur-overlay, 지연→--stagger-step). celebration pop 260/300ms는 --dur-enter(200)로 스냅. `motion.test.mjs`가 저장소 전체를 훑어 재발을 막는다 | confirmed | 2026-09-04 아젠다가 실측한 23곳은 실제 45곳이었고 값 위반(240ms 초과)이 7곳. 규칙은 2026-07-29부터 있었으나 강제 장치가 없어 병합마다 늘었다. 축하 연출을 더 길게 원하면 임의 리터럴이 아니라 --dur-celebrate 토큰을 이 표에 추가하는 것이 맞다 |
| 2026-09-16 | `SegmentedControl`의 휴지 chrome(색·배경)을 `.hub-seg`/`.hub-seg__btn`으로 이관하고 hover·활성 전이를 --dur-hover로 부여. 활성 정본은 aria-pressed 하나 | confirmed | Button(2026-09-15)과 같은 cascade — 인라인 색은 :hover와 전이를 죽인다. hover는 §5.2대로 글자 한 단계(--fg-faint→--fg-muted)만, 배경·accent 없음 |
| 2026-09-16 | `Skeleton` primitive 신설 — 로딩은 `불러오는 중…` 한 줄이 아니라 레이아웃을 예고하는 스켈레톤으로. 라우트 청크 폴백(모든 페이지)·브랜드 목록·첫 화면 승인 큐·개인 지표 타일·프로젝트 table 본문에 채택. preview/error에는 쓰지 않는다 | confirmed | §11 "loading states are part of the design"인데 스켈레톤이 0개였다(2026-09-04 B2, 모바일 성능 체감 60점의 명명된 원인). 펄스는 §9의 라이브 인디케이터 단일 duration(mlMoonPulse 1.4s)을 그대로 써 새 duration을 만들지 않는다. 브랜드 로딩이 `EmptyState`("비어 있음" 의미)로 그려지던 것은 §5.3 truth 오용이라 함께 교정 |
| 2026-09-18 | Futura 텍스처 레이어(`hub-futura.css`)와 `dashboard/home` 서피스 신설. 라이트 테마 기준의 2단 그림자·pill·넓은 여백·대형 라이트 디스플레이 제목을 `.hub-futura` 스코프 안에서만 쓴다. 기존 40여 페이지와 §7 고정 밀도·§8.1 1px 하이라인 계약은 그대로 둔다 | confirmed | 운영자가 Claude Design에서 5회 이터레이션해 `Moonlight Home.html`로 확정한 방향(Home A 트리아지 + 오늘의 시간표). 전면 전환이 아니라 레이어로 들인 이유: 텍스처가 §7 밀도(44/26px은 4·8·12·16·24·32·48 스케일 밖), §11 h2 20px(히어로 44px), §8.1 보더 대신 그림자 — 세 개의 기존 확정 결정과 부딪힌다. 한 화면에서 먼저 살아본 뒤 확장 여부를 정하는 편이 40개 페이지를 되돌리는 것보다 싸다. 카테고리 색은 도입하지 않았다 — 원안의 붉은 `REVENUE` 라벨은 §5.3대로 tone=danger(긴급)에만 `--danger`를 붙였다. Tweaks 밀도 토글은 §15 2026-07-21 결정(고정 밀도)을 뒤집으므로 이식하지 않았다 |
| 2026-09-19 | Futura 텍스처를 셸과 공용 컴포넌트로 확장하되 **동작은 그대로 둔다**. (a) 사이드바 내비 행은 아이콘·색점을 버리고 텍스트 전용이 되며 현재 항목은 `--surface` pill + `--fx-shadow`로 뜬다. 로고는 모노그램 타일, 검색·사용자 카드는 같은 "떠 있는 흰 면" 어휘. (b) `Button`·`IconButton`·`Input`·`SegmentedControl`은 pill radius, `Card`는 보더 대신 그림자 — 색은 §5.2 그대로. (c) `dashboard/work/decisions`는 페이지 헤더가 eyebrow + 대형 제목 + pill 탭을 직접 그린다(`PAGE_OWNS_TABS`). 사이드바 깊이(한 단계)와 탑바의 2차 내비 소유권은 **바뀌지 않는다** | confirmed | 운영자 지시 "좌측 탭의 ui, 컴포넌트 질감 류 도" → "기능은 유지하고 사이드바 디자인 요소만 적용". 중간 시도에서 사이드바가 현재 섹션의 하위 목적지를 펼치고 데스크톱 탑바 탭을 숨겼으나, 운영자가 범위를 외형으로 한정해 되돌렸다 — 2026-07-15의 "사이드바는 한 단계" 결정은 그대로 살아 있고, `hub-nav.test.mjs`가 `fx-nav-child`·`sidebarChildren(a.key, scope)` 재등장을 막는다. 확실성 라벨은 원안의 `COMMITTED`/`TRIAL (4W)` 대신 §5.3·§11의 한국어 직접 라벨(확정/미정)을 유지했다 — 대문자 영문은 한글 표면의 접근 가능한 이름이 아니고, `TRIAL (4W)`는 기록에 없는 상태다 |
| 2026-09-20 | 새 할 일 중앙 팝업·선택 필드 펼침·한 줄 체크리스트·Enter 연속 입력. PMS 분류 상시 패널은 소속 선택 버튼과 필요 시 관리 드로어로 전환. 반복 매출 확실성 범례는 제거하고 이벤트의 직접 라벨 유지 | confirmed | 운영자 실사용 입력 개선 승인. 기존 저장·포커스·충돌 계약 유지 |
| 2026-09-21 | 글쓰기 입력창(제목·메모·본문)은 `--r-sm`(6px)으로 통일하고 여러 줄 입력 여백·행간을 확보한다. Futura의 입력 pill은 select에만 남긴다 | confirmed | 운영자 지시 “콘텐츠 입력 창들 ui 다듬기 (글쓰는 곳에서는 라운딩 너무 강하지 않게)”. 09-19 공용 입력 pill 결정을 글쓰기 표면에 한해 대체. Studio 본문 스타일이 공통 필드에 덮이던 우선순위와 빠른 메모의 미정의 radius 토큰도 교정 |
| 2026-09-22 | Futura 브랜치(2026-09-18/19 확정, 위 두 행)를 `09.bigmac1.22`에 병합해 사이드바에 `홈` 앵커를 반영 — `오늘`·`현황`과 별개 탭으로 공존시키는 안을 운영자가 재확인. 09-21 홈 화면 통합 초안(`docs/superpowers/specs/2026-09-21-home-screen-design-development.md`)의 "접근안 C"(두 홈을 한 화면으로 합치는 안)는 DRAFT로 남겨두고 이번엔 적용하지 않았다 | confirmed | 운영자가 `09.bigmac1.3`(별도 워크트리, `localhost:3130`)에서 이미 돌고 있던 홈·오늘·현황 공존 버전을 직접 보고 그 방향으로 확정. 그 워크트리의 홈 탭도 같은 Futura 원 커밋(`d6350f8`·`1261095`·`ab87550`)에서 나온 것이었고, 그 위에 얹힌 Office AI·목표·성과 서브뷰 등 108개 무관 커밋은 이번 범위에서 제외했다 |
| 2026-09-22 | 팔레트 가드(`components/hub/palette.test.mjs`) 신설 + `motion.test.mjs`를 `s` 단위까지 확장. 연속 완주 표시는 화염·앰버에서 **중립 기하**(오름차순 막대 4개 `StreakMark` + 7일 도트, 채움은 `--fg`/`--fg-muted`, 빈칸은 `--line`)로 교체하고 무한 애니메이션 `mlFlameFlicker 1.8s`·`mlBurnGlow 2.4s`를 제거한다. 리듬 성과 점수 계열은 §5.3대로 Moonstone 명도 + **점선 스트로크** + 마커 모양으로 구분한다. 축하 연출 2종(`hubProgressShimmer`·`hubSparklePop`)과 남은 warm 원색 49건은 파일별 BASELINE에 부채로 박제하고 새 유입만 막는다 | confirmed | §4는 2026-07부터 warm gold/amber 재도입을 금지했으나 **강제 장치가 없었다** — 2026-09-22 전역 스캔에서 `apps/hub`의 warm 원색 85건(+원색 danger red 10)이 나왔고, 그중 36건이 첫 화면 경로였다(최상단 카드의 🔥 이모지 포함). `motion.test.mjs`가 `\d+ms`만 보던 탓에 `s` 단위 무한 애니메이션도 통과했다. 모션이 45건 쌓인 뒤 가드를 만든 §15 2026-09-16의 교훈을 팔레트에 앞당겨 적용한다. 지표(연속 일수)는 세 축 기획 §7.2의 Action KPI라 유지하고 표현만 바꿨다 — 색이 아니라 채워진 칸 수가 정보를 나르므로 흑백·색각 차이에서도 읽힌다(§5.3). 상세·잔여 부채는 `docs/superpowers/specs/2026-09-21-home-screen-design-development.md` |
| 2026-09-22 | 사이드바 병합 해소: **펼친 상태는 Futura 텍스트 전용 행**(2026-09-19 행)을 그대로 두고, **아이콘은 접힌 56px 상시 레일에서만** 이름을 맡는다(`fae8416` — 아이콘 + tooltip·`aria-label`, 건수는 점 하나). 행 렌더러 하나가 두 상태를 모두 그려 접기 토글 뒤에도 같은 DOM·포커스를 유지한다. 접힌 사용자 카드는 좌우 6px margin의 44px 폭 타일로 좁혀 36px 알림 버튼이 레일 안에 들어가게 한다. 테마 기본값은 `auto`(기기 시계 07:00–18:00 라이트, 그 밖 다크 — §5)이고, `sidebarCollapsed`가 같은 환경설정 저장소(`mlp.sidebarCollapsed`, hydration 이후 복구)에 함께 저장된다 | recommended | 구성 요소는 각각 따로 정해졌다 — 텍스트 전용 행은 2026-09-19 운영자 확정, 56px 아이콘 레일은 2026-09-22 운영자 요청(`docs/superpowers/plans/2026-09-22-sidebar-icon-rail.md`), `auto` 테마는 §5 본문(`25b8abe`). 두 브랜치가 같은 사이드바를 반대 방향(행 아이콘 제거 vs 아이콘 레일)으로 고쳐 충돌했고, "펼침=텍스트, 접힘=아이콘"으로 둘을 함께 살렸다. 이 **조합 상태**는 운영자가 아직 한 화면으로 검토하지 않았으므로 권장으로 둔다 — 확정되면 이 행의 상태만 바꾼다. `hub-nav.test.mjs`가 행 렌더러를 collapsed=false/true로 그려 레일의 아이콘·접근 가능한 이름을 고정하고(펼친 행 단언은 2026-09-23 행에서 "아이콘이 있어야 한다"로 반전), `fx-nav-child`·`sidebarChildren(a.key, scope)` 재등장도 계속 막는다 |
| 2026-09-23 | §15 2026-09-19 (a)를 부분 되돌림 — 사이드바 내비 행은 펼친 상태에서도 `Iconed name={a.icon}`을 라벨과 같이 그린다(접힌 56px 레일과 동일 아이콘, 같은 `currentColor` 상속). 색점·pill 현재 항목 표시 등 나머지 09-19 결정은 그대로 둔다 | confirmed | 운영자가 접힌 레일 스크린샷과 펼친 텍스트 전용 스크린샷을 나란히 보고 "아이콘도 같이 표시"로 확정 — 전체 메뉴 항목(주요 10 + 유틸리티 2) 대상. `hub-nav.test.mjs`의 "expanded sidebar nav rows carry no icon glyph" 단언을 반대로 뒤집었다. 위 2026-09-22 사이드바 병합 해소 행의 "펼친 상태는 텍스트 전용" 부분을 이 행이 대체하고, 접힌 56px 레일·`auto` 테마·`sidebarCollapsed` 저장은 그대로 둔다 |
| 2026-09-23 | Futura 텍스처를 `dashboard/work/rhythm`으로 확장 — 페이지 셸이 `hub-futura hub-page`, 헤더가 `fx-head`·`fx-page-title`, 카드가 `fx-card`를 쓴다(`RhythmVisualizer` 포함). 2026-09-18 행이 Futura를 `dashboard/home` 한 화면으로 한정하고 09-19 행이 셸·공용 컴포넌트·`work/decisions`까지만 열거했으므로, Rhythm은 세 번째 서피스다 | recommended | rhythm-redesign 병합(b7ddf9a)이 코드를 먼저 올렸고 결정 로그가 따라오지 못했다 — 기록해 두지 않으면 다음 세션이 "어디까지가 Futura인가"를 코드에서 역추적해야 한다. 밀도·타이포는 09-18 행과 같은 이유로 `.hub-futura` 스코프 안에 머물고 §7 고정 밀도·§8.1 1px 하이라인 계약은 다른 40여 페이지에서 그대로다. 운영자가 화면을 직접 보고 확정하기 전까지 `recommended`로 둔다 |
| 2026-09-23 | 선택한 프로젝트의 진척 게이지 트랙에만 25% 구간별 색·고정 위치 그라데이션을 쓰고, 선택/진척 변경 시 가속 채움과 1회 반짝임을 재생한다. 0/25/50/75/100 눈금과 근거 텍스트를 유지하고 감소 모션에서는 완성 상태만 표시한다 | confirmed | 운영자 직접 요청 “더 화려하고 애니매이션 있는 게이지 ui, 단계별 색, 그라데이션, 가속 붙으면 반짝임 효과”. 현재 데이터에는 작업별 진척 이력이 없어 반짝임은 시각적 채움의 가속을 뜻하며 실제 업무 속도 상승을 뜻하지 않는다. §5.2 그라데이션·단계색 제한의 이 트랙 한정 예외 |
| 2026-09-23 | Rhythm을 **할 일과 분리된 생활 루틴 표면**으로 재구성. 할 일 완료를 섞던 `RhythmVisualizer`(몰입도×성과 매트릭스)를 제거하고 `rhythm-today.jsx`의 "오늘의 리듬"(시간대별 한 탭 체크·체크 취소·하루 링·최근 7일 그리드)으로 대체. 완료는 `--fg` 채움 + 그려지는 체크 + 이름 취소선 + 명도 한 단계 하강(초록 없음, §5.3), "지금" 시간대만 `--accent`(현재 위치), 주 N회 목표를 채운 루틴은 점선 원 + "쉬어도 돼요". 1회성 축하 연출용 `--dur-celebrate: 420ms` 토큰 신설(위 2026-09-16 행이 예고한 경로). 분류에 `spirit`(신앙)·`home`(집안일) 추가 | recommended | 운영자 지시 "리듬은 매일 루틴적으로 행하는 것들 — 오늘 할 일과 별개, 기도·청소·운동 같은 생활 루틴을 설정·표시·체크하고 했을 때 만족되는 디자인·애니메이션". 체크 취소는 `DELETE /api/routine/check`가 POST와 같은 멱등 키로 오늘 행만 지운다. 연속은 `pendingStreak`(어제까지)을 따로 실어 "N일 연속 · 오늘 이어가기"로 동기를 주되 빨강을 쓰지 않는다(§5.2 no warning-by-default). 운영자가 화면을 직접 보고 확정하기 전까지 `recommended` |
| 2026-09-23 | 펼친 사이드바 폭을 오른쪽 경계 드래그로 조절한다(200–360px, 기본 232px, `mlp.sidebarWidth`에 저장). 핸들은 경계에 걸친 8px `role="separator"` — ←/→ 16px·Home/End 최소/최대·더블클릭 기본값. 휴지 상태엔 기존 1px 보더만, hover·드래그 중엔 같은 자리에 `--line-strong` 1px 선. 접힌 56px 레일과 모바일 드로어(고정 폭)에는 핸들이 없다 | confirmed | 운영자가 "여기 드래그로 조절 가능하게 해놨던거 적용이 안된듯"으로 요청 — 저장소·stash·원격 브랜치 어디에도 구현이 없어 새로 만들었다. 드래그 중에는 셸의 `--hub-sidebar-w`만 바꾸고 손을 뗄 때 한 번 상태로 확정한다(셸 상태를 매 프레임 바꾸면 현재 페이지 전체가 다시 그려진다). 폭 범위는 구현 기본값이라 운영자가 바꿔도 된다. `sidebar-resizer.test.mjs`가 드래그·취소·키보드·모바일 숨김을 고정한다 |
| 2026-09-23 | Rhythm에 **리듬 기록**(주·월·분기·연) 섹션 추가 — `rhythm-history.jsx` + `GET /api/hub/rhythm-history?range&offset&project`. 주는 루틴×요일 체크 격자, 월은 달력, 분기·연은 주 단위 잔디 격자 + 월별 막대, 모든 기간에 요약 4칸(달성률·다 해낸 날·최장 연속·가장 꾸준한 루틴)과 루틴별 달성 목록. 날짜 칸 진하기는 `--fg`를 `--surface-2`에 섞은 5단계 명도 램프 하나(hue 없음, srgb 혼합)이고 기준은 "매일 루틴을 얼마나 채웠나". 기간은 달력 기준(주=월요일 시작), 기대 횟수는 루틴을 만든 날 이후 지난 날 수 × 주간 목표/7의 올림. 앞서 두었던 오늘의 리듬 아래 "최근 7일" 격자는 이 섹션의 주 보기가 대체 | recommended | 운영자 지시 "주-월-분기-연으로 나의 루틴들 어떻게 해왔는지 볼 수 있게". work-ledger의 Rhythm 읽기는 최근 240행뿐이라 연 단위를 담지 못해, 기간 창 안의 완료 행만 1000행씩 최대 8쪽 읽는 별도 저장소를 두고 상한에 닿으면 `partial`로 밝힌다. 운영자가 화면을 보고 확정하기 전까지 `recommended` |
| 2026-09-23 | 리듬 기록의 막대 차트를 정식 컬럼 차트로 재설계 — 연은 월별, 분기는 **주별** 막대. 막대 폭 ≤ 24px·위 끝만 4px 라운드·바닥 각짐, 뒤에 100%까지의 캡슐 트랙(`--fg` 5%), 1px 실선 격자(0/50/100%)와 눈금, **평균은 1px 점선 기준선 하나**(버킷 비율 평균이 아니라 지난 칸 전체 합), 숫자는 이번 기간·최고 기간에만 고정하고 나머지는 CSS `:hover`/`:focus-visible` 툴팁(JS hover 없음 §8.1), 가리키는 동안 다른 막대는 명도 한 단계 후퇴(불투명도 아님), 미래 기간은 점선 빈 트랙. 진입은 바닥에서 1회 성장(`--dur-celebrate` + `--stagger-step`) | recommended | 운영자 지시 "막대그래프 디자인 더 고급". 색은 명도 램프만(§5.3 charts), 포커스 링의 radius는 기본 규칙에 두고 포커스 규칙은 outline만(§11, `focus-ring.test.mjs`). 운영자가 화면을 보고 확정하기 전까지 `recommended` |
| 2026-09-23 | **OKR·KPI** 탭(`dashboard/work/goals`) 신설 — 위치는 **내 작업** 하위(실행 목록·메모·하루 리뷰·OKR·KPI), 경로 소유자도 내 작업(`owns`에 추가). 새 화면을 만들지 않고 기존 `Goals` 화면(목표 → 측정 지표 → 관측, 빠른 체크)을 열며, `goalHref`에 `base`를 넘겨 탭 안의 링크·드로어·생성 딥링크가 그 탭에 머문다. **현황에도 띄운다**: 현황의 `?view=goals` 탭 이름을 `목표·성과` → `OKR·KPI`로 맞추고, 현황 집계 화면 KPI 줄 아래에 `OkrSummaryCard`(진행 중 목표·지표 수, 핵심 지표 4줄 — 현재값·목표·진척, 근거 확인 필요 수, 본체 탭 링크)를 둔다. 카드의 읽기 상태는 목표 화면과 같은 truth(loading→Skeleton, error/preview→TruthBadge, 빈 상태는 live/partial일 때만) | recommended | 운영자 지시 "OKR KPI 트래킹하는 부분 탭 신설" → "위치는 내 작업 하위로, 현황에도 띄우기"(처음 넣었던 Work 탭 줄 위치를 대체). 목표 저장소(`operating_objectives`·`operating_metrics`·관측)는 이미 있어 스키마 변경이 없다. 루틴 체크를 KPI 자동 원천으로 잇는 것(`source_key`에 routine 추가)은 마이그레이션이 필요한 별도 결정으로 남긴다 |
| 2026-09-23 | 하루 리뷰의 습관 표시는 **연속 일수가 아니라 "이번 주 k/5일"**(근무일 분모, 주말 기록은 보이되 분모 제외)이고, 월 캘린더 셀은 색이 아니라 ● 채움(기록)·○ 1px 테두리(빈 근무일)·표시 없음(주말)·점선(오늘 미기록)으로 말한다. 오늘 셀만 `--moon-300` 테두리(현재 위치). 기록을 읽지 못한 달은 빈 근무일로 그리지 않는다(`unknown`). 오늘·홈의 하루 마무리 한 줄은 ○/✓/시계 글리프 + 직접 라벨의 중립 행이며, 끊김 경고·붉은 미기록·축하 연출은 두지 않는다. 오늘 3개 권장값과 AI 코칭은 `CertaintyBadge recommended` + dashed 1px 카드 | recommended | 운영자 요청 "정말 꾸준히 달성할 수 있을 법한" 하루 평가(2026-09-23, "전부 다 진행"으로 구현 승인). 연속 일수는 하루 빠지면 0이 되어 포기를 부르고, 주 단위는 같은 주 안에서 회복된다 — 주간 리포트 `reviewDays`와 같은 정의다. 화면 직접 확인 전이라 권장으로 둔다. 상세는 `docs/superpowers/specs/2026-09-23-daily-review-sustainable-loop-design.md` |
| 2026-09-24 | 프로젝트 목록(프로젝트 선택 인덱스)의 모노그램 타일에 한해 **장르별 은은한 색**을 허용한다 — 장르는 프로젝트마다 고르는 `meta.genre`(회사·세일즈·IT·콘텐츠·기타, 편집 드로어 `장르`). 색은 `--genre-{company,sales,it,content}-{bg,fg,line}`(저채도 oklch, hue 255·20·200·310, 두 테마)이고 기타·미지정은 중립 타일 그대로다. 타일에만 칠하고 행 배경·레일·배지로 넓히지 않으며, 장르 라벨은 타일 `title`과 행의 접근 가능한 이름에 함께 싣는다 | confirmed | 운영자 지시 "프로젝트 장르별로 색을 조금 나눴으면 — 은은한 색 차이로 회사인지 세일즈인지 IT인지 콘텐츠인지 바로 알았으면"(2026-09-24, 장르 출처=프로젝트별 선택·범위=모노그램 타일만을 운영자가 직접 골랐다). §5.2 "색은 카테고리를 분류하지 않는다"의 운영자 확정 예외이며 2026-09-01 브랜드 콘텐츠 로그와 같은 형식이다(라벨 동반·한 표면 한정). 다른 표면으로의 확장은 별도 결정. Engine `update_project`는 `meta`를 통째 교체하던 경로에 병합(버전 가드 포함)을 더해 org_scope·delivery를 보존한다 |
| 2026-09-24 | 사이드바 10+2 앵커의 아이콘을 전용 `nav*` 24px 선 아이콘으로 통일하고, 펼친 행과 56px 레일에서 같은 형태를 쓴다. `M` 문자 타일과 구 `DE` 초록 아이콘을 초승달·기준점 Moonlight 심볼 하나로 교체한다. `icon.svg`가 정본이며 ICO·PNG 192/512·마스커블·Apple touch 자산은 `npm run icons:generate`로 만든다. 메뉴 구조·라우팅·상태 색은 바꾸지 않는다 | recommended | 운영자 요청 “왼쪽 사이드바 로고들 더 디벨롭… 브라우저 탭 아이콘 앱 아이콘들”. 작은 크기에서의 선명도와 다크·라이트 공통 사용을 위해 저장소 고유 SVG를 택했다. 운영자 시각 검토 전이라 형태의 최종 확정은 아니다 |
| 2026-09-24 | 브랜드 목록의 `meta.glyph` 기하 기호를 브랜드별 단색 SVG로 바꾼다. 22th.Nomad=로봇, BridgeMaker=다리, Class.Moon=책, ClassIn Side=대화, HolyFunCollector=웃는 대화, MoonPM=워크플로, Politic_Officer=저울, Study.Seagull=갈매기, 고래=고래, 시나브로=펜촉이다. 이름·DB의 glyph 데이터는 유지하며 브랜드 목록·상세·현황·프로젝트 소속 표시에 같은 심볼을 쓴다. 새 학원은 교육 아이콘, 식별되지 않은 브랜드는 중립 기하 아이콘으로 표시한다 | recommended | 운영자가 브랜드별 의미를 드러내는 아이콘을 요청하고 다리·IT/로봇·고래·펜의 방향을 제시했다. 정확한 모양은 구현안이므로 시각 검토 전까지 권장으로 둔다 |
| 2026-09-24 | 브랜드 아이콘 네 개를 재정리한다. BridgeMaker=십자가, HolyFunCollector=천사, Study.Seagull=새 윤곽, MoonPM=연결된 작업 흐름이다. 위 행의 해당 네 아이콘 설명을 이 행이 대체하며 나머지 브랜드·표면·DB 계약은 유지한다 | recommended | 운영자가 BridgeMaker·HolyFunCollector·Study.Seagull의 재제작 방향을 지정했다. 네 번째 MoonPM은 기존 세로 칸 아이콘이 18px에서 빽빽해 보여 선정했다. BridgeMaker의 대안으로 기존 아치형 다리 아이콘을 먼저 비교했으나 작은 크기에서 문처럼 보여 십자가를 택했다 |
| 2026-09-24 | 고래(Go;Re)는 SVG Repo Animals 24의 물뿜는 고래 실루엣, 시나브로는 Phosphor Pen Nib의 잉크 펜촉 아이콘을 쓴다. 위 브랜드 아이콘 행의 해당 두 형태를 이 행이 대체한다 | recommended | 운영자가 기존 아이콘 중 더 어울리는 고래와 잉크 펜을 요청했다. 18px 비교에서 고래의 분수와 꼬리, 펜촉의 외곽이 분명한 자산을 골랐다. 출처와 라이선스는 `brand-icons.LICENSE`에 기록했다 |
| 2026-09-24 | 브랜드 목록의 운영 상태·집중점이 모두 비었으면 긴 문구 두 개 대신 `운영 방향 정하기` 한 줄을 표시하고 상세의 기존 편집 흐름으로 연결한다. 모바일 목록은 중복 `컨텐츠 로그` 버튼과 시각적 검색·필터 라벨을 덜어 첫 브랜드를 앞당기며, 라벨의 접근 가능한 이름·필터 동작은 유지한다. 모바일 입력은 16px 이상, 미정의 `--r-md` 참조는 `--r`로, Futura 기본 버튼 그림자는 primary를 제외해 CTA rim을 보존한다. Revenue의 마지막 `glyph` 소비자는 `BrandIcon`을 쓴다 | confirmed | 운영자가 디자인 개선 네 항목과 모바일 입력 크기까지 모두 진행하라고 지시했다. 390px 검토에서 첫 브랜드 위치와 입력 글자 크기를 직접 측정했다. 데이터·라우트·상태 의미는 바꾸지 않는다 |
| 2026-09-24 | 영업·매출을 **4탭**으로 재구성한다 — 이전 9개 목적지(탭 개요·문의 내역·고객 DB·매출 히트맵·Leads·Deals·Accounts·Cases + 별도 primary 앵커 `고객 연락`)를 `오늘 연락`(`revenue/followups`, 첫 탭·앵커 착지) · `고객`(`revenue/customers`) · `거래`(`revenue/deals`) · `문의`(`revenue/inquiries`)로. 개인 스코프는 5번째 탭 `현금 흐름`(`revenue/overview?scope=personal`, 2026-08-31 30일 로드맵), ClassIn 스코프는 `세그먼트`를 더한다. `고객 연락` 앵커가 빠져 사이드바는 주요 9 + 유틸리티 2가 되고 건수 뱃지는 영업·매출로 옮긴다. 탭에서 내려온 화면은 삭제하지 않는다 — PAGE_MAP·⌘K·딥링크로 계속 열리고, 거기 서 있으면 가장 가까운 탭이 켜지고(Leads·Accounts → 고객, 개요·히트맵 → 거래, Cases → 없음) 탑바 제목은 그 화면 이름을 유지한다(§7 Widths). 같은 역할은 스코프가 달라도 같은 이름이다(07-15 D4의 원칙 유지, D4의 영어 CRM 탭 이름은 대체) | confirmed | 운영자가 목업 4장(오늘 연락·고객·거래·휴대폰 기록 후보)을 보고 "상당히 좋은 것 같아… 진행". 매일 여는 표면은 오늘 연락 하나이고 나머지는 찾아볼 때만 간다 — Leads·Accounts는 사람이 아니라 단계가 바뀌는 것이라 고객 목록의 세그먼트, 개요·히트맵은 거래의 보기다. CRM 탭 디벨롭 기획 §4.1이 "2단계 실사용 뒤"로 미뤄 둔 IA 재배치를 운영자 결정으로 앞당겼다. 단 §4.1의 `기록` 렌즈 신설과 `문의`의 고객 흡수(Q142)는 채택하지 않았다 — 목업은 문의를 별도 탭으로 둔다. `hub-nav.test.mjs`가 탭 구성·역할 별칭·제목을 고정한다. 상세 `docs/superpowers/specs/2026-09-24-revenue-four-tabs-design.md` |
| 2026-09-24 | Futura 페이지 텍스처(`.hub-futura`·`fx-head`·`fx-page-title`·`fx-card`·`fx-pill-btn`·`fx-eyebrow`)를 영업·매출의 `오늘 연락`·`고객`·`거래` 세 페이지로 넓힌다. 탭 줄은 페이지가 그리지 않고 탑바에 남는다(`PAGE_OWNS_TABS` 불변 — 목업이 탑바 탭을 그린다). 확실성은 §5.3 선 모양(입금됨 꽉 참·확정 옅은 채움·가능성 높음 점선·확인 필요 점)으로, 빨강은 놓친 약속 한 곳(개수 + 1px 레일)으로 한정한다. **바뀌지 않는 것**: 같은 영업·매출의 `문의` 탭, 탭에서 내려온 화면(개요·히트맵·Leads·Accounts·Cases·ClassIn 별칭·세그먼트), 나머지 모든 페이지는 §7 고정 밀도·§8.1 1px 하이라인·§11 20px/500 제목 그대로다. 컨트롤 radius는 프리미티브가 렌더하는 값 그대로(§7 Radius) | confirmed | 운영자 "2번 오케이" — 목업 검토 뒤 Futura 확장안을 골랐다. 09-18 행이 정한 "화면 하나씩 먼저 살아 보고 넓힌다"는 방식을 따른다: 세 화면만 열고, 운영자가 실제 화면을 본 뒤 문의·다른 영업 화면으로 넓힐지 다시 정한다. 구현은 브랜치 `claude/revenue-redesign`에서 진행 중이며, 이 행은 결정을 기록할 뿐 세 화면이 이미 Futura로 렌더된다는 뜻이 아니다 |
| 2026-09-24 | 코칭·대화 기본 화면에 Guru·Legend 멘토 서가를 두고, 고객 목록·개인 브랜드·개인 콘텐츠 큐에 닫힌 멘토 레일을 둔다. 서가 제목만 목업의 42px 디스플레이를 허용하며 `.hub-futura` 전체 텍스처는 확장하지 않는다. 레일은 데스크톱 오른쪽 58px 세로 진입점, 600px 이하는 44px 가로 버튼·하단 시트다. 카드는 수동 열람이고 질문 생성은 별도 전송을 요구한다 | confirmed | 운영자가 A 서가와 B 레일 목업을 둘 다 승인했다. 홈·오늘·Studio 본문에는 넣지 않고, 기존 페이지의 새 진입점만 공유한다. 상세는 `docs/superpowers/specs/2026-09-24-guru-dual-experience-design.md` |
| 2026-09-24 | 하루 리뷰의 **활동 흐름**(GitHub 기여 그래프 응용): 최근 16주 × 월~일 정사각형 잔디와 월 캘린더 칸 배경을 **포그라운드 명도 한 계열 4단계**(`color-mix(in oklch, var(--fg) 18·38·62·88%, var(--surface))`)로 칠한다 — 라이트는 어두워지고 다크는 밝아진다. 단계 경계는 16주 활동일의 사분위, 숫자는 상세 줄·`aria-label`이 말한다. 모바일(≤600px)에서 잔디 칸은 버튼이 아니라 표시 전용이다(§11 44px 플로어의 예외를 늘리지 않음) | recommended | 운영자가 GitHub 잔디 스크린샷과 함께 "활동량 더 색 진함으로 한눈에" 요청. 초록은 §4·§5.3 위반이라 쓰지 않았고, 색상이 아니라 명도가 양을 말하므로 흑백·색각 차이에서도 읽힌다(§5.3 charts). 화면 확정 전이라 권장. 상세는 `docs/superpowers/specs/2026-09-23-daily-review-sustainable-loop-design.md` §12 |
| 2026-09-25 | 하루 리뷰 **에너지 입력**(오늘·홈의 원탭 1~5 버튼, 리뷰 팝업 선택지)은 숫자 옆에 **달 위상** 아이콘(`EnergyMoon`, `components/hub/energy-moon.jsx`)을 함께 그린다 — 1 점선 빈 달 → 2 초승 → 3 반달 → 4 볼록 → 5 보름. 색은 `currentColor` 하나이고 값은 밝은 면의 넓이가 말한다(§5.3). 숫자·단어 라벨과 접근 가능한 이름은 그대로이며, 팝업의 작은 오름 막대 글리프를 대체한다. 기록 표시(요약·캘린더·주간 줄·코칭)는 글자로 둔다 | confirmed | 운영자 "그냥 숫자만 나오니 체감이 안됨 — 약→강 비교되는 아이콘". 후보 셋(달 위상·배터리·오름 막대 확대) 중 달 위상을, 범위는 "입력하는 곳만"을 운영자가 직접 골랐다. 배터리는 1칸이 '배터리 부족' 경고처럼 읽혀 §5.2 no warning-by-default와 부딪힌다. `energy-moon.test.mjs`가 5단계 구분·색 없음·두 입력 표면 사용을 고정한다 |
