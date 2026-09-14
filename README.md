# Moonlight

Moonlight is a Supabase-first operating system split into two active apps:

- `apps/hub`: private decision and operations dashboard mounted at `/dashboard`.
- `apps/engine`: execution layer for webhooks, Telegram commands, email sends, and ledger writes.

## Current Direction

The active product direction is the Supabase ledger flow:

`external signal -> apps/engine -> Supabase ledger -> apps/hub`

Hub should show what matters, what failed, and what action comes next. Engine owns intake, validation, normalization, execution records, and provider boundaries.

The former public web surface has been detached from the active workspace so execution can stay focused on Hub and Engine.

## Documentation

Start with [`docs/README.md`](docs/README.md). It defines the documentation precedence, the 2026-07-13 operator decisions, the current implementation phase, and which older plans are historical references.

The active product sources are:

- [`docs/operator-workflow-profile.md`](docs/operator-workflow-profile.md): operator facts from Q1-Q115
- [`docs/superpowers/specs/2026-07-13-moonlight-personal-operator-os-deep-design.md`](docs/superpowers/specs/2026-07-13-moonlight-personal-operator-os-deep-design.md): current product design
- [`DESIGN.md`](DESIGN.md): UI and interaction contract

## Development

```bash
npm install
npm run check:contracts
npm run typecheck
npm run build
npm run check:connections
npm test
```

Local dev ports are pinned:

- Hub: `http://localhost:3000`
- Engine: `http://localhost:3001`

Health endpoints:

- Hub: `http://localhost:3000/api/health`
- Engine: `http://localhost:3001/api/health`

`check:connections` expects local env files with Supabase and Engine URLs. A missing env failure is expected on a fresh checkout.

`npm test` covers every `*.test.mjs` in the repo — `scripts/`, `apps/hub/lib/`, `apps/hub/components/**`, `apps/engine/**`, and `packages/**`. CI delegates to the same command, so the two scopes cannot drift. To run one file:

```bash
node --import ./scripts/register-hub-alias.mjs --test <file>
```

## Security Notes

Public Engine write routes should be protected before deployment:

- `COM_MOON_SHARED_WEBHOOK_SECRET` for Hub-to-Engine and project webhook writes
- `COM_MOON_HUB_WRITE_SECRET` for server-to-server Hub writes; browser writes still require same-origin headers
- `TELEGRAM_WEBHOOK_SECRET` for Telegram `secret_token`
- `COM_MOON_OAUTH_STATE_SECRET` for Google OAuth state signing, falling back to the shared webhook secret. Google OAuth connect routes refuse unsigned state.
- `COM_MOON_ALLOW_OPEN_WEBHOOKS=true` is only for unauthenticated local smoke tests. Keep it unset/false outside local dev.

## Verification Notes

CI currently blocks build/typecheck failures and high-or-higher production audit issues.
`npm audit --omit=dev --audit-level=moderate` still reports Next's internal `postcss@8.4.31`; this is an upstream moderate advisory and should be revisited when Next ships a patched internal dependency.

## Branches

- `main`: production branch. CI runs on pushes to `main` and `codex/**` only; every other branch needs a pull request to get CI.
- `codex/*`: Codex implementation branches
- `claude/*`: Claude Code worktree branches
- `real_v*`: operator integration branches (UI / backend snapshots)

Do not use a branch name as product truth. Check the current Git branch and [`docs/README.md`](docs/README.md) before starting work.
