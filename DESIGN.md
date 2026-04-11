# Com_Moon Design System

## 1. Product Read

Com_Moon is not a generic SaaS dashboard.

It is one operating system with two surfaces:

- `apps/web`: public surface that earns trust, publishes content, and turns attention into leads.
- `apps/hub`: private operating surface that turns signals into decisions, routines, and execution.

The design job is to make these two surfaces feel related without making them identical.

Public should feel editorial, clear, and confident.
Hub should feel operational, calm, and fast.

## 2. Brand Thesis

The brand should feel like this:

- A strategist's desk, not a startup template.
- Korean-first, mobile-first, decision-first.
- Quietly premium, with discipline instead of noise.

If the product feels "busy", "crypto-like", or "default SaaS blue", we missed.

## 3. Experience Principles

1. Show signal first.
The first screen should answer "what matters right now?" in under 5 seconds.

2. Make action obvious.
Every major section needs a primary next step, not just information density.

3. Keep public and private in the same visual family.
Public earns trust. Hub closes the loop. They should feel like the same company with different pressure levels.

4. Respect mobile reality.
The founder should be able to check numbers, capture an idea, and trigger a workflow from a phone without friction.

5. Use restraint.
One accent color, a small number of surface styles, and deliberate typography beat decorative complexity.

## 4. Visual Direction

Working direction name: `Moonstone Command Deck`

One-line mood: *the cool precision of a flight instrument panel, a surgical
console, or a satellite operations room — premium because it is calibrated,
not because it is decorated.*

Keywords:

- void black
- moonstone silver
- frost white (public only)
- platinum text
- rim-lit edges
- whisper borders
- instrument-grade precision

### Reference Synthesis, `Linear x Apple x Bloomberg`

This is the outside reference mix for Com_Moon.

`Linear` gives us:

- dark operational surfaces that stay legible at high density
- ultra-thin borders and low-noise typography
- restrained motion that highlights state changes instead of decoration

`Apple (Pro hardware / Final Cut)` gives us:

- cool silver-white as a *signal* of precision, never decoration
- moonstone sheen on controls and CTAs — not warm gold, but cool blue-silver
- the sense that every component is machined to tolerance, not styled

`Bloomberg Terminal` gives us:

- command-deck information rhythm: status, count, next action
- monospace for numbers, sans for labels, no decorative flourish
- dense layouts that still feel calm because hierarchy is unambiguous

Com_Moon should not copy any of these directly.

The real blend should be:

- `apps/web`: `50% Linear`, `30% Apple`, `20% Bloomberg` (frost silver canvas, editorial pacing, moonstone CTA)
- `apps/hub`: `35% Linear`, `40% Bloomberg`, `25% Apple` (full void-black control-deck energy)
- `content workspace`: `45% Linear`, `30% Bloomberg`, `25% Apple`

In practice that means:

- hub surfaces are **dark by default**, with void-black canvases, whisper borders, and moonstone-silver accents on CTAs and KPIs
- public surfaces stay **lighter** (frost silver-white) but use onyx text, silver rules, and the same moonstone CTA language — so the two feel like one precision instrument family with different lighting
- both surfaces avoid colored gradients on large areas; gradients live only on buttons, rim-lit card edges, and signature marks

Do not import these reference patterns blindly:

- Warm gold / amber / champagne accents
- Bloomberg's amber-on-black news-ticker density
- Glossy chrome, mirror reflections, or "Web3" metallic sheen
- Warm greige or cream canvases
- Full-bleed radial gradients used as decoration

### Public Surface Mood

- Frost silver-white canvas, onyx ink
- Moonstone silver CTA and rule lines
- Serif display headlines, generous breathing
- Trust-building proof blocks anchored by silver dividers

### Hub Surface Mood

- Void-black canvas, platinum text
- Dense information rhythm with whisper borders
- Moonstone silver used semantically (signal, CTA, emphasized KPI)
- Sticky command strip; status chips over decoration

## 5. Color System

The palette has two sides — a **void black stack** for hub surfaces and a
**frost silver stack** for public surfaces — bridged by a single
**moonstone accent** (cool blue-silver) that carries brand identity across both.

Warm champagne, moss green, and amber tones are retired.
There is no warm gold anywhere in the system.

### Core Palette

```css
:root {
  /* ── Void black stack (hub canvas, feature panels) ───────────── */
  --cm-ink-900: #0c1018; /* deepest void, hub body background */
  --cm-ink-800: #131923; /* standard card on dark */
  --cm-ink-700: #1b2332; /* elevated card, hover lift */
  --cm-ink-600: #26304a; /* strong border, pressed state */

  /* ── Frost silver stack (public canvas) ──────────────────────── */
  --cm-parchment: #f0f2f7;      /* public body background */
  --cm-parchment-soft: #f4f5f8; /* cards on frost */
  --cm-parchment-deep: #e2e6ef; /* muted section band */

  /* ── Moonstone accent (the single brand accent) ──────────────── */
  --cm-metal-300: #d6dff0; /* highlight, KPI numbers on dark */
  --cm-metal-400: #a8b8d4; /* default accent, link underline */
  --cm-metal-500: #5274a8; /* primary CTA base */
  --cm-metal-600: #365888; /* pressed / hover on dark */

  /* ── Text ─────────────────────────────────────────────────────── */
  --cm-platinum: #e8edf4;       /* primary text on dark */
  --cm-platinum-soft: #7e8c9e;  /* secondary text on dark */
  --cm-graphite: #0c1018;       /* primary text on frost */
  --cm-graphite-soft: #4a5568;  /* secondary text on frost */

  /* ── Hairlines ────────────────────────────────────────────────── */
  --cm-line-dark: rgba(255, 255, 255, 0.07);
  --cm-line-dark-strong: rgba(255, 255, 255, 0.12);
  --cm-line-light: rgba(12, 16, 24, 0.08);
  --cm-line-light-strong: rgba(12, 16, 24, 0.16);

  /* ── Semantic status (muted; never compete with moonstone) ─────── */
  --cm-ok-500: #5a8f7a;   /* success (muted teal) */
  --cm-warn-500: #9e8040; /* warning, brass-cooled */
  --cm-risk-500: #a04040; /* error / destructive */
  --cm-info-500: #5070a0; /* neutral informational */

  /* ── Signature gradients (accent only, never background fill) ── */
  --cm-grad-metal: linear-gradient(
    135deg,
    #d6dff0 0%,
    #a8b8d4 38%,
    #5274a8 70%,
    #365888 100%
  );
  --cm-grad-ink: linear-gradient(180deg, #131923 0%, #0c1018 100%);
  --cm-grad-rim: linear-gradient(
    180deg,
    rgba(255, 255, 255, 0.08) 0%,
    rgba(255, 255, 255, 0) 55%
  );
}
```

### Usage Rules

- **Brand anchor is `--cm-metal-500`.** Every primary CTA uses
  `--cm-grad-metal` with a `--cm-grad-rim` overlay on the top edge.
- **Void black stack is the hub default.** Hub pages set their body to
  `--cm-ink-900` and build up with `--cm-ink-800` / `--cm-ink-700`.
- **Frost silver stack is the web default.** Web pages stay on
  `--cm-parchment` with `--cm-parchment-soft` cards. Occasional
  `--cm-ink-900` feature panels are allowed for premium moments
  (hero, case-study reveals, pricing anchor).
- **Gradients are for edges and controls only.** Never fill a hero
  background, never fill a card body. `--cm-grad-metal` belongs on
  buttons, underline rules, KPI borders, and signature marks.
  `--cm-grad-rim` belongs on the top edge of raised elements to
  simulate rim lighting.
- **Status colors are muted on purpose.** They must not compete with
  the moonstone accent. Use them on chips, dots, and left-border accents,
  not as full card fills.
- **Do not introduce warm gold, green, or purple.** `--cm-info-500` is
  the only cool-blue in the system and is reserved for neutral notices.
  The moonstone accent (`--cm-metal-500`) is the single permitted blue-silver.

## 6. Typography

### Font Pairing

- Headline serif: `MaruBuri`
- UI sans: `SUIT Variable`
- Data mono: `IBM Plex Mono`

If exact font loading becomes a delivery issue, fallback to `Pretendard Variable` for UI text and keep the serif only for major public headings.

### Type Roles

- `Display`: public hero, campaign headers, manifesto lines
- `Heading`: section titles, dashboard blocks
- `Body`: long-form explanation, cards, forms
- `Label`: chips, eyebrow text, metadata
- `Mono`: metrics, timestamps, command text, IDs

### Type Rules

- Public hero headlines can use serif with tight letter spacing.
- Hub screens should default to sans for speed and clarity.
- Numbers in KPI cards should feel heavy and compact.
- Do not mix more than two font families on one screen.

## 7. Layout System

### Width

- Public container: `min(1120px, calc(100vw - 32px))`
- Hub container: `min(1440px, calc(100vw - 24px))`

### Spacing Scale

- `4, 8, 12, 16, 24, 32, 48, 64, 96`

### Radius

- Small controls: `12px`
- Standard cards: `20px`
- Feature panels: `28px`
- Floating pills/buttons: `999px`

### Surface Rules

- Standard cards: subtle border + soft shadow
- Feature panels: mild translucency allowed
- Dense operational lists: more opaque backgrounds, lower blur

## 8. Component Language

### Shared Primitives

- Button
- Input
- Textarea
- Select
- Card
- Badge
- Divider
- Tabs
- Dialog
- Sheet
- EmptyState
- Skeleton

### Public Components

- Hero block
- Proof strip
- Feature grid
- Insight card
- CTA band
- Lead capture form
- Case study row

### Hub Components

- Top summary strip
- KPI card
- Status badge
- Activity timeline
- Queue table
- Command panel
- Automation run card
- Error log row
- Split editor / preview surface

### Component Behavior Rules

- Buttons must have clear primary/secondary/ghost hierarchy.
- Empty states must explain the next useful action.
- Tables should avoid spreadsheet energy. Prefer fewer columns and clearer status chips.
- Dashboards should prioritize trend and urgency over raw counts alone.

## 9. Motion

Motion should feel deliberate, not playful.

- Page reveal: `180ms to 240ms`
- Card rise/fade on load: `120ms stagger`
- Dialog/sheet: `160ms to 200ms`
- Hover motion: no more than `4px` travel

Never animate everything. Motion should help answer "what changed?" or "where should I look?"

Respect `prefers-reduced-motion`.

## 10. Copy Tone

The copy should sound like an operator who knows what matters.

- Short, concrete, and directional
- No vague startup jargon
- No inflated claims without proof
- CTA labels should say the next real action

Good:

- `이번 주 발행 현황`
- `지금 확인할 리드`
- `협업 문의 보내기`
- `자동화 실행 로그`

Bad:

- `혁신적인 솔루션`
- `최적화된 시너지`
- `AI 기반 차세대 경험`

## 11. Accessibility And Quality Bar

- Touch targets: minimum `44px`
- Text contrast: aim for WCAG AA at minimum
- Keyboard navigation must work for all core flows
- Focus states must be visible without relying on browser defaults alone
- Loading, empty, success, and error states are part of the design, not afterthoughts

## 12. Public vs Hub Rules

### Public

- Story first
- Fewer elements per fold
- Bigger headings
- Strong proof and CTA rhythm

### Hub

- Signal first
- More compact layout
- Faster scan pattern
- Always pair metrics with status or next action

## 13. Anti-Patterns

Do not ship these:

- Generic gradient SaaS hero (no colored gradients on large surfaces)
- Overpacked dashboard with 12 cards above the fold
- Neon or jewel-tone accents that break the champagne metal system
- Any reintroduction of brand green, bright blue, or purple
- Glossy chrome, mirror reflections, or Web3 metallic sheen
- Center-aligned everything
- Chart-heavy screens with no clear operator action
- Decorative icons used as filler
- Dark mode applied only by inverting colors (the hub is dark-native,
  not dark-themed)

## 14. Implementation Mapping

When implementation starts, the first design-system work should land here:

- `packages/ui`: tokens, primitives, shared shells
- `apps/web`: public templates and editorial section patterns
- `apps/hub`: dashboard, tables, workflows, operational shells

The practical order should be:

1. tokens
2. typography
3. shells
4. primitives
5. page sections
6. dense data views

That order prevents the repo from becoming three separate visual systems.
