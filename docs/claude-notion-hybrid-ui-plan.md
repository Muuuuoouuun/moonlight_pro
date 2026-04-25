# Claude x Notion Hybrid UI Plan

> Status: historical design reference. The public web app has been detached from the active workspace; use this document only for taste notes that still apply to Hub and content workspace work.

## Goal

Use the reference set from [`awesome-design-md`](https://github.com/VoltAgent/awesome-design-md/tree/main) as taste input, not as a template.

The target is:

- `Claude` for warmth, editorial cadence, and trust
- `Notion` for structural clarity, calm utility, and information discipline
- `Com_Moon` for the actual brand signal: content, leads, and operations in one loop

This plan turns those references into a product-specific UI system for Hub and the content workspace.

## Reference Read

### What We Borrow From Claude

Source:
- [awesome-design-md Claude DESIGN.md](https://raw.githubusercontent.com/VoltAgent/awesome-design-md/main/design-md/claude/DESIGN.md)

Keep:

- warm parchment background and ivory surface separation
- serif-led hero and section hierarchy
- chapter-like spacing rhythm
- "thoughtful desk" feeling instead of high-tech theater
- dark/light section alternation when it helps pacing

Translate for Com_Moon:

- use it mostly on public surface
- use it in hub only for page headers, previews, and high-trust moments
- swap direct terracotta reference for existing Com_Moon green and brass system

Avoid:

- literal Claude-style illustration mimicry
- too much emptiness on decision-heavy screens
- public pages that feel like an essay but do not convert

### What We Borrow From Notion

Sources:
- [awesome-design-md Notion DESIGN.md](https://raw.githubusercontent.com/VoltAgent/awesome-design-md/main/design-md/notion/DESIGN.md)
- [Notion homepage](https://www.notion.com/)

Keep:

- whisper borders
- low-opacity layered shadows
- clear card segmentation
- structured blocks that never feel heavy
- a single strong accent and many neutrals
- modular bento-like information grouping

Translate for Com_Moon:

- use it heavily in hub shell, tabs, cards, and action bars
- use it in public pages for proof strips, feature cards, and CTA structure
- replace Notion blue with Com_Moon green as the main action accent

Avoid:

- making the product feel sterile or document-only
- over-flattening the public surface
- using white-on-white UI without emotional tone

## Product Translation

### 1. Detached Public Surface

Direction:

- `Claude mood`, `Notion discipline`

UI character:

- warm background
- large serif headline
- short sans body copy
- modular proof cards
- minimal but crisp CTA system

Layout plan:

1. Hero with strong serif statement and one line-art or sketch-like visual accent
2. Proof strip in a tighter Notion-like card rhythm
3. Three-pillar section explaining `Content / Lead / Ops`
4. Featured desk preview, showing the hub as a real system
5. Inquiry block with very low-friction CTA

Rules:

- first fold must prove what Com_Moon is in under 10 seconds
- hero can breathe, but proof cannot be buried
- cards must look editorial, not startup landing boilerplate

### 2. Hub Surface, `apps/hub`

Direction:

- `Notion structure`, `Claude warmth`

UI character:

- calmer, denser, more modular
- whisper borders and stronger sectional grouping
- mono labels and clean metric treatment
- display serif used sparingly for page heads, not everywhere

Layout plan:

1. Sticky shell with minimal chrome
2. Page intro with strong headline and short operator sentence
3. Summary cards with semantic status
4. Main work area in two-column or split layouts
5. Right rail only when it contains real next actions or risk signals

Rules:

- every screen must answer `what matters now` and `what do I do next`
- cards should feel like operating surfaces, not decoration
- dense screens still need breathing rhythm every 2 to 3 blocks

### 3. Content Workspace

Direction:

- `Claude editorial`, `Notion composability`

UI character:

- writing-first
- preview-aware
- structured handoff logic
- obvious feedback after actions like copy, queue, publish, approve

Layout plan:

1. Studio status strip
2. Draft panel with clean presets and low-noise controls
3. Live preview with stronger editorial framing
4. Handoff checklist for publish and automation
5. Guardrails and next action block at the end

Rules:

- the draft area should feel like a writing tool, not an admin form
- the preview should feel publishable, not generic
- automation handoff must be visible in plain language

## Shared Design Rules

### Color

- Keep the existing Com_Moon warm neutral base.
- Primary action stays green.
- Brass stays secondary attention color.
- Blue only appears for informational state, not as the main brand action.
- Public can use softer tonal spread. Hub should use tighter contrast.

### Typography

- Public display: serif
- Hub headings: serif only for anchor moments
- Body and controls: clean sans
- Labels, timestamps, chips: mono

### Borders and Shadows

- Use Notion-style thin containment as the default
- Use Claude-style richer surfaces only for hero, preview, and emphasis blocks
- Avoid thick borders, loud shadows, or glass-heavy overdesign

### Motion

- subtle only
- 150ms to 240ms for interaction feedback
- pressed states must be obvious
- respect reduced motion

## Execution Plan

### Phase 1. Lock The Visual System

Files:

- [DESIGN.md](/Users/bigmac_moon/Desktop/Projects/moonlight_pro/DESIGN.md)
- [apps/hub/app/globals.css](/Users/bigmac_moon/Desktop/Projects/moonlight_pro/apps/hub/app/globals.css)

Do:

- align tokens for warm neutrals, borders, shadows, and type roles
- define public vs hub surface contrast more explicitly
- keep button hierarchy identical across apps

### Phase 2. Refine Public Surface

Status: detached from active workspace.

Do:

- sharpen hero hierarchy
- reduce any generic SaaS feel
- make proof strip and CTA blocks more Notion-clean
- keep visual accent human and restrained

### Phase 3. Upgrade Hub Shell

Files:

- [apps/hub/components/shell/dashboard-shell.jsx](/Users/bigmac_moon/Desktop/Projects/moonlight_pro/apps/hub/components/shell/dashboard-shell.jsx)
- [apps/hub/app/globals.css](/Users/bigmac_moon/Desktop/Projects/moonlight_pro/apps/hub/app/globals.css)

Do:

- simplify shell chrome
- unify border language
- strengthen status hierarchy
- ensure mobile shell feels intentional, not collapsed desktop

### Phase 4. Deepen The Content Workspace

Files:

- [apps/hub/app/dashboard/content/page.jsx](/Users/bigmac_moon/Desktop/Projects/moonlight_pro/apps/hub/app/dashboard/content/page.jsx)
- [apps/hub/app/dashboard/content/studio/page.jsx](/Users/bigmac_moon/Desktop/Projects/moonlight_pro/apps/hub/app/dashboard/content/studio/page.jsx)

Do:

- make the workspace feel more editorial
- tighten preview framing
- make system feedback clearer after user actions
- improve handoff language from draft to publish to automation

### Phase 5. Apply Across Remaining Hub Tabs

Files:

- `automations`
- `evolution`
- `work`
- `revenue`

Do:

- port the same card rhythm and typography rules
- keep each tab distinct in purpose, but identical in design grammar

## Quality Bar

Ship only if:

- public feels premium without feeling slow
- hub feels structured without feeling cold
- mobile screens keep the same identity as desktop
- next actions are visible on every major screen
- the product feels like Com_Moon, not Claude or Notion cosplay
