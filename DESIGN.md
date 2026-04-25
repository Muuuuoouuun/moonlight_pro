# Moonlight Design System

> Current version — reflects the Moonlight Pro bundle now shipped in `apps/hub`.
> Token names below match `apps/hub/components/hub/hub-tokens.css` verbatim.
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
cool moonstone accent stack. Semantic colors stay muted on purpose so they never compete
with the accent.

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

- **Accent anchor:** `--moon-300`. Primary CTAs use `--moon-200` fill with `--moon-100` border.
- **Surface order:** `--bg` → `--surface` → `--surface-2` → `--surface-3` for nested elevation.
- **Borders:** always `1px`. Never thicken. Use `--line-soft` for hairlines, `--line` for dividers,
  `--line-strong` only for pressed/emphasized states.
- **Gradients:** reserved for the brand mark and the moonstone CTA rim. Never fill a hero, card,
  or section background with a colored gradient.
- **Status colors:** live on chips, dots, and left-border accents. Never as full card fills.
- **Personal / Company** badges are the only identity labels in the data layer — they have their
  own color pair and must stay visually distinct from semantic status colors.

## 6. Typography

| Role     | Family                | Usage                                           |
| -------- | --------------------- | ----------------------------------------------- |
| UI Sans  | `Inter Tight`         | Everything except numbers and display headings. |
| Data Mono| `JetBrains Mono`      | IDs, metrics, timestamps, keybindings, diffs.   |
| Display  | `Inter Tight`         | Page-level moments only; avoid decorative display type in dense Hub surfaces. |

Fallbacks: `ui-sans-serif, system-ui, sans-serif` for sans, `ui-monospace, monospace` for mono.

**Rules**
- Hub defaults to sans at 14px / `font-feature-settings: 'cv11', 'ss01', 'ss03'`.
- KPI numerals are `.mono`, heavy weight, compact letter spacing.
- Section eyebrow is 11px, uppercase, `letter-spacing: 0.1em`, `color: var(--fg-dim)`.
- Never mix more than two families on one screen.

## 7. Layout System

### Widths
- Public container: `min(1120px, calc(100vw - 32px))`
- Hub container: `min(1440px, calc(100vw - 24px))` — but most hub pages use full width,
  two-column grids, or sidebars; the container rule only applies to editorial pages.

### Spacing scale
`4, 8, 12, 16, 24, 32, 48, 64, 96`

### Density (scoped)
The hub supports three density modes via `data-density` on the root:

| Mode      | row-h | pad-y | pad-x | gap | section-gap | card-pad |
| --------- | ----: | ----: | ----: | --: | ----------: | -------: |
| `compact` |   30  |    6  |   10  |  8  |         16  |      14  |
| `default` |   36  |   10  |   14  | 12  |         24  |      20  |
| `relaxed` |   44  |   14  |   18  | 16  |         32  |      28  |

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
- VR Office pixel room
- Key / webhook copy rows (masked, reveal, copy button)

**Behavior rules**
- Buttons have clear primary / secondary / ghost hierarchy.
- Empty states explain the next useful action.
- Tables stay narrow — prefer fewer columns and clearer status chips over spreadsheet density.
- Dashboards prioritize trend + urgency over raw counts alone.

## 9. Motion

Deliberate, never playful.

- Page reveal: `180–240ms`, via `.fade-up` (opacity + 4px translateY).
- Card rise / fade stagger: `120ms`.
- Dialog / sheet: `160–200ms`.
- Hover travel: no more than `4px`.
- Live indicators: `mlMoonPulse` at 1.2–1.5s.

Respect `prefers-reduced-motion`.

## 10. Copy Tone

Operator voice — short, concrete, directional.

Good: `이번 주 발행 현황` · `지금 확인할 리드` · `협업 문의 보내기` · `자동화 실행 로그`
Bad: `혁신적인 솔루션` · `최적화된 시너지` · `AI 기반 차세대 경험`

## 11. Accessibility And Quality Bar

- Touch targets: minimum 44px.
- Text contrast: WCAG AA minimum.
- Keyboard navigation works for all core flows (⌘K palette is the fast path).
- Focus uses `outline: 1px solid var(--moon-300)` with 2px offset — never relies on browser defaults.
- Loading / empty / success / error states are part of the design, not afterthoughts.

## 12. Public vs Hub Rules

**Public** — story first. Fewer elements per fold. Bigger headings. Strong proof + CTA rhythm.

**Hub** — signal first. Compact layout. Fast scan pattern. Every metric paired with status or next action.

## 13. Anti-Patterns

Do not ship:

- Generic gradient SaaS hero
- Overpacked dashboard with 12 cards above the fold
- Neon / jewel-tone accents
- Any reintroduction of brand green, bright blue, or purple as accent
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
| Shell (sidebar / topbar / palette) | `apps/hub/components/hub/hub-{sidebar,topbar,command-palette,tweaks-panel}.jsx` |
| Pages                              | `apps/hub/components/hub/pages/*.jsx`                        |
| Route mount                        | `apps/hub/app/dashboard/[[...path]]/page.jsx`                |

Build order when adding a new surface:
1. Confirm tokens cover every color / size needed — do not hardcode hex values.
2. Compose with existing primitives first; drop to raw `<div>` only when a primitive doesn't fit.
3. Add the page component under `components/hub/pages/` and register in `hub-app.jsx` PAGE_MAP.
4. If the page introduces a new top-level route, add it to `NAV_TREE` in `hub-data.js`.
