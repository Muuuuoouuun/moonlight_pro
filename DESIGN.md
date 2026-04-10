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

Working direction name: `Editorial Command Deck`

Keywords:

- moss green
- parchment white
- smoked ink
- brass signal
- rounded glass panels
- thin utility lines
- strong type hierarchy

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

### Core Palette

```css
:root {
  --cm-bg: #f6f3ee;
  --cm-surface: #fffdf8;
  --cm-surface-muted: #f0ece4;
  --cm-panel: rgba(255, 255, 255, 0.82);
  --cm-line: rgba(18, 29, 24, 0.10);
  --cm-text: #15211c;
  --cm-text-soft: #5c665f;

  --cm-green-700: #084734;
  --cm-green-600: #0f6046;
  --cm-green-500: #2d7a5e;
  --cm-green-100: #e7f1eb;

  --cm-brass-500: #b8892d;
  --cm-brass-100: #f4ead3;

  --cm-red-500: #a94a3d;
  --cm-red-100: #f7e4e0;

  --cm-blue-500: #2f6486;
  --cm-blue-100: #e4eff6;
}
```

### Usage Rules

- `--cm-green-700` is the brand anchor and primary CTA color.
- Brass is for "attention worth tracking", not for generic decoration.
- Red only appears on errors, risk, destructive actions.
- Blue is reserved for informational states and system notices.
- Public pages can use softer translucent surfaces. Hub pages should use more solid surfaces for legibility.

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

- Generic gradient SaaS hero
- Overpacked dashboard with 12 cards above the fold
- Neon accent colors that break the green system
- Center-aligned everything
- Chart-heavy screens with no clear operator action
- Decorative icons used as filler

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
