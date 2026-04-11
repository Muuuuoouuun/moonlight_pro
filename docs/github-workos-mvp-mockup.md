# GitHub-Backed Work OS MVP Mockup

## Purpose

This doc defines the first mockup layer for `apps/hub > Work OS` when GitHub becomes the delivery source of truth.

Scope:

- `PMS` = GitHub-backed delivery lane
- `Roadmap` = milestone / initiative planning lane
- `Rhythm` = recurring review cadence
- `Decisions` = decision log and follow-through
- `Overview` = cross-cutting summary

This is a wireframe and content plan, not an implementation spec.

## IA

Top-level tabs:

1. `Overview`
2. `PMS`
3. `Roadmap`
4. `Rhythm`
5. `Decisions`

Shared context:

- `All Projects`
- `Com_Moon`
- `classinkr-web`
- `sales_branding_dash`
- `ai-command-pot`

GitHub mapping:

- repository
- issues
- pull requests
- milestones
- commits

## Screen Blocks

### 1. Overview

Goal: answer "what needs attention right now?"

Blocks:

- KPI strip: open issues, review-needed PRs, at-risk roadmap items, overdue cadence checks
- Attention list: blocked items, waiting reviews, stale work
- Today queue: top 3 actions for the day
- Shipping feed: latest merged PRs / releases
- Roadmap horizon: next milestone or two

### 2. PMS

Goal: answer "what is currently in motion and what is blocked?"

Blocks:

- GitHub sync status bar
- Delivery KPIs: open issues, open PRs, review requests, blockers
- State board: `Open`, `In progress`, `Review`, `Blocked`, `Done`
- PR review queue
- Blockers panel
- Stale work panel

Expected behavior:

- show the active delivery surface first
- keep the screen execution-first, not report-first
- promote only operator-relevant items

### 3. Roadmap

Goal: answer "what are we building next, and when?"

Blocks:

- Horizon switcher: `Now / Next / Later`
- Milestone cards
- Initiative cards
- Dependency and risk panel
- Backlog candidates

Milestone card content:

- title
- due date
- progress
- open items
- blocked items
- latest activity

## Layout Notes

### Desktop

- Use a left sidebar for global Work OS navigation
- Keep the project context switcher above the screen content
- Place KPI strip at the top of each page
- Use a 2-column layout for `Overview`, `PMS`, and `Roadmap`
- Keep right-side support panels narrow and sticky where possible
- Favor card grids and compact boards over long single-column lists

### Mobile

- Collapse the sidebar into a top or drawer nav
- Render the context switcher as wrapped pills
- Stack KPI cards vertically
- Convert boards into single-column cards with clear state chips
- Keep primary actions visible within the first scroll screen

## MVP Scope

### Include

- GitHub-backed `Overview`, `PMS`, and `Roadmap` wireframes
- Project context switcher
- KPI strips for delivery and roadmap health
- PR / issue / milestone summary cards
- Blocked work and stale work surfaces
- Desktop and mobile layout rules

### Exclude

- Full GitHub write actions
- Advanced filtering and saved views
- Multi-repo aggregation logic beyond mock scope
- Detailed automation rules
- Non-GitHub integrations

## Mocked vs Live

### Mocked

- Static project list
- Sample repo names
- Example milestone cards
- Placeholder PR and issue rows
- Sample risk and blocker states

### Live

- Existing Work OS route structure
- Query-string context switching
- Shared hub shell and section nav
- GitHub-backed data model assumptions
- Supabase-based read model when available

## Output Rules

- Mockup content should make the state of the system obvious in under 5 seconds
- One screen should answer one main question
- If a block does not change the operator's next action, it should be hidden from MVP
- GitHub should be treated as the signal source, not the final UI authority

