# Guru Internal Reading Articles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace external Guru source links with 26 private, source-conscious Markdown reading articles in the existing card detail.

**Architecture:** Card ID is the sole lookup key. An authenticated Hub read route allows only catalogue IDs and returns one private Markdown file. The client renders a narrow safe Markdown subset in the current detail Drawer; shared source labels no longer link outward.

**Tech Stack:** Next.js 16 App Router, React, JSX/CSS Hub components, Node `fs/promises`, Node `--test`.

---

## Task 1: Author and audit article content

**Files:** `apps/hub/content/guru/<card-id>.md` for every ID in `packages/guru-guidance/index.ts`.

- [x] Write 13 sales and 13 marketing/content/Legend posts using the reviewed card statement and matching internal MD section. Each post has one H1, a prose introduction, explanatory H2 sections, a practical application, and a boundary.
- [x] Add a content audit test that compares all 26 filenames to catalogue IDs, checks minimum narrative substance and permitted Markdown, and rejects external URLs and raw HTML. Review unsupported numeric claims manually against the source-quality audit.
- [x] Read each post against its card and `docs/research/2026-09-24-guru-source-quality.md`, correct unsupported attribution and distinguish Moonlight applications.

## Task 2: Serve one private article

**Files:** `apps/hub/lib/guru-articles.js`, `apps/hub/app/api/hub/guidance-articles/[id]/route.js`, their tests, `apps/hub/next.config.mjs`.

- [x] Write failing tests for valid card read, unknown ID/path traversal refusal, missing file as HTTP 200 error envelope, and private/no-store headers.
- [x] Implement a fixed card-ID allowlist before constructing the file URL; read from `apps/hub/content/guru`, never `public/`. Return `{status:'ok', id, markdown}` or `{status:'error'}`.
- [x] Set narrow `outputFileTracingIncludes` for this route, build, and verify the route trace contains the 26 MD files.

## Task 3: Replace the detail with an internal reading article

**Files:** `apps/hub/components/hub/guidance-detail.jsx/.css/.test.mjs`, new `guru-article-markdown.jsx/.test.mjs`, `guidance-source.jsx/.css/.test.mjs`.

- [x] Write failing tests for safe text-only Markdown blocks, no generated external link, loading and HTTP 200 error states, and direct-quote separation.
- [x] Fetch a selected card article only when the detail opens. Show Skeleton while loading, an explicit retry state on failure, and a readable article with source context and the existing Guru ask action on success.
- [x] Render only headings, paragraphs, lists and blockquotes as React text; never inject HTML. Remove external `원전 열기` and raw file-path disclosure from shared source labels.

## Task 4: Connect and verify the reader

**Files:** `apps/hub/components/hub/pages/mentor-shelf.jsx`, `context-mentor-rail.jsx`, their tests, `docs/README.md`, `DESIGN.md`.

- [x] Rename card affordances to `Moonlight 글 읽기`, keep `?card=<id>`, and point the contextual rail to its selected card.
- [x] Run focused tests, `npm test` (3,254 total, 3,241 pass, 13 skip, 0 fail), `npm run typecheck`, Hub build, `git diff --check`, and inspect dark/light desktop plus 390px in the isolated development server. The route trace contains all 26 distinct MD files.
- [x] Commit only touched files on `codex/guru-focus-chat`; check `git show --stat` and keep production unchanged.
