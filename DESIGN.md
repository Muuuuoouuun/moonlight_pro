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

Working direction name: `Smoked Command Deck`

One-line mood: *the quiet authority of a yacht bridge, a trading desk,
or a mission-control room — premium because it looks precise, not because
it looks shiny.*

Keywords:

- smoked graphite
- champagne metal
- platinum text
- warm parchment (public only)
- rim-lit edges
- whisper borders
- hardware-grade precision

### Reference Synthesis, `Linear x Bloomberg x Vacheron`

This is the outside reference mix for Com_Moon.

`Linear` gives us:

- dark operational surfaces that stay legible at high density
- ultra-thin borders and low-noise typography
- restrained motion that highlights state changes instead of decoration

`Bloomberg Terminal` gives us:

- command-deck information rhythm: status, count, next action
- monospace for numbers, sans for labels, no decorative flourish
- dense layouts that still feel calm because hierarchy is unambiguous

`Vacheron Constantin / high-end horology` gives us:

- champagne metal as a *signal*, never as decoration
- brushed-metal gradients only on edges, dials, and controls
- the sense that every surface is machined, not painted

Com_Moon should not copy any of these directly.

The real blend should be:

- `apps/web`: `55% Linear`, `25% Bloomberg`, `20% Vacheron` (still public, still editorial pacing, but darker and more precise than before)
- `apps/hub`: `30% Linear`, `55% Bloomberg`, `15% Vacheron` (full control-tower energy)
- `content workspace`: `45% Linear`, `35% Bloomberg`, `20% Vacheron`

In practice that means:

- hub surfaces are **dark by default**, with smoked-ink canvases, whisper borders, and champagne-metal accents on CTAs and KPIs
- public surfaces stay **lighter** (warm parchment) but use graphite text, metal rules, and the same champagne CTA language — so the two feel like one hardware family with different lighting
- both surfaces avoid colored gradients on large areas; gradients live only on buttons, rim-lit card edges, and signature marks

Do not import these reference patterns blindly:

- Linear's cool SaaS blue or purple accent
- Bloomberg's amber-on-black news-ticker density
- Glossy chrome, blown-glass, or "Web3" metallic sheen
- Cold greige / generic enterprise grayscale
- Full-bleed radial gradients used as decoration

### Public Surface Mood

- Warm parchment canvas, graphite ink
- Champagne metal CTA and rule lines
- Serif display headlines, generous breathing
- Trust-building proof blocks anchored by metal dividers

### Hub Surface Mood

- Smoked-ink canvas, platinum text
- Dense information rhythm with whisper borders
- Champagne metal used semantically (signal, CTA, emphasized KPI)
- Sticky command strip; status chips over decoration

### Public Surface Mood

- Lighter background
- More breathing room
- Bigger type
- Narrative sections
- Trust-building proof blocks

### Hub Surface Mood

- Denser information rhythm
- Stronger contrast between cards
- Status color used semantically, not decoratively
- Sticky controls and compact summaries

## 5. Color System

The palette has two sides — a **dark ink stack** for hub surfaces and a
**warm parchment stack** for public surfaces — bridged by a single
**champagne metal** accent that carries brand identity across both.

Moss green is retired. There is no brand green anywhere in the system.

### Core Palette

```css
:root {
  /* ── Dark ink stack (hub canvas, feature panels) ─────────────── */
  --cm-ink-900: #0e1114; /* deepest canvas, hub body background */
  --cm-ink-800: #15191e; /* standard card on dark */
  --cm-ink-700: #1d222a; /* elevated card, hover lift */
  --cm-ink-600: #2a313b; /* strong border, pressed state */

  /* ── Warm parchment stack (public canvas) ────────────────────── */
  --cm-parchment: #ede9e0;      /* public body background */
  --cm-parchment-soft: #f6f3ec; /* cards on parchment */
  --cm-parchment-deep: #e2ddd0; /* muted section band */

  /* ── Champagne metal (the single brand accent) ───────────────── */
  --cm-metal-300: #e8dfcb; /* highlight, KPI numbers on dark */
  --cm-metal-400: #cdbf9e; /* default accent, link underline */
  --cm-metal-500: #a8986f; /* primary CTA base */
  --cm-metal-600: #7d6f4a; /* pressed / hover on dark */

  /* ── Text ─────────────────────────────────────────────────────── */
  --cm-platinum: #e9ebee;       /* primary text on dark */
  --cm-platinum-soft: #9ba3ad;  /* secondary text on dark */
  --cm-graphite: #171a1f;       /* primary text on parchment */
  --cm-graphite-soft: #55606b;  /* secondary text on parchment */

  /* ── Hairlines ────────────────────────────────────────────────── */
  --cm-line-dark: rgba(255, 255, 255, 0.08);
  --cm-line-dark-strong: rgba(255, 255, 255, 0.14);
  --cm-line-light: rgba(23, 26, 31, 0.10);
  --cm-line-light-strong: rgba(23, 26, 31, 0.18);

  /* ── Semantic status (used sparingly) ─────────────────────────── */
  --cm-ok-500: #6fa28a;   /* success (muted, non-green-branded) */
  --cm-warn-500: #c4a15a; /* warning, brass-leaning */
  --cm-risk-500: #b5574a; /* error / destructive */
  --cm-info-500: #6d8aa4; /* neutral informational */

  /* ── Signature gradients (accent only, never background fill) ── */
  --cm-grad-metal: linear-gradient(
    135deg,
    #e8dfcb 0%,
    #cdbf9e 38%,
    #a8986f 70%,
    #7d6f4a 100%
  );
  --cm-grad-ink: linear-gradient(180deg, #15191e 0%, #0e1114 100%);
  --cm-grad-rim: linear-gradient(
    180deg,
    rgba(255, 255, 255, 0.10) 0%,
    rgba(255, 255, 255, 0) 60%
  );
}
```

### Usage Rules

- **Brand anchor is `--cm-metal-500`.** Every primary CTA uses
  `--cm-grad-metal` with a `--cm-grad-rim` overlay on the top edge.
- **Dark ink stack is the hub default.** Hub pages set their body to
  `--cm-ink-900` and build up with `--cm-ink-800` / `--cm-ink-700`.
- **Parchment stack is the web default.** Web pages stay on
  `--cm-parchment` with `--cm-parchment-soft` cards. Occasional
  `--cm-ink-900` feature panels are allowed for premium moments
  (hero, case-study reveals, pricing anchor).
- **Gradients are for edges and controls only.** Never fill a hero
  background, never fill a card body. `--cm-grad-metal` belongs on
  buttons, underline rules, KPI borders, and signature marks.
  `--cm-grad-rim` belongs on the top edge of raised elements to
  simulate rim lighting.
- **Status colors are muted on purpose.** They must not compete with
  the metal accent. Use them on chips, dots, and left-border accents,
  not as full card fills.
- **Do not introduce any green, purple, or bright blue.** The only
  blue in the system is `--cm-info-500` for neutral notices.

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
