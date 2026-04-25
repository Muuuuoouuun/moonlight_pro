# Moonlight

Moonlight is a Supabase-first operating system split into two active apps:

- `apps/hub`: private decision and operations dashboard mounted at `/dashboard`.
- `apps/engine`: execution layer for webhooks, Telegram commands, email sends, and ledger writes.

## Current Direction

The active product direction is the Supabase ledger flow:

`external signal -> apps/engine -> Supabase ledger -> apps/hub`

Hub should show what matters, what failed, and what action comes next. Engine owns intake, validation, normalization, execution records, and provider boundaries.

The former public web surface has been detached from the active workspace so execution can stay focused on Hub and Engine.

## Development

```bash
npm install
npm run check:contracts
npm run typecheck
npm run build
npm run check:connections
```

Local dev ports are pinned:

- Hub: `http://localhost:3000`
- Engine: `http://localhost:3001`

Health endpoints:

- Hub: `http://localhost:3000/api/health`
- Engine: `http://localhost:3001/api/health`

`check:connections` expects local env files with Supabase and Engine URLs. A missing env failure is expected on a fresh checkout.

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

- `main`: production branch
- `codex/*`: Codex implementation branches
- Current hardening branch: `codex/moonlight-p0-hardening`
