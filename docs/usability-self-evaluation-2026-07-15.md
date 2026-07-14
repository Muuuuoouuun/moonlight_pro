# Moonlight Operator OS usability self-evaluation

> Date: 2026-07-15 KST  
> Scope: Daily Brief, personal eeoCRM view, PMS summary, ClassIn content lanes, Calendar/OpenClaw/MCP connection honesty  
> Result: **89 / 100**

This is an operator-usability score backed by live API responses, focused tests, builds, control-plane probes, and hydrated browser checks of Daily Brief, Revenue Leads, Projects, and Content. Daily Brief, Revenue Leads, and the empty Content lane flow were also audited at 390×844; Revenue Leads was checked at 768×1024 and 1440×1000. It is not a full product-wide pixel grade.

| Criterion | Score | Evidence | Deduction |
| --- | ---: | --- | --- |
| Action hierarchy and Daily Brief | 13 / 15 | Hydrated runtime shows all 6 ledgers live, 7 decision signals, and live PMS/ClassIn content pulses with status counts and direct task/queue actions. At 390×844 the command hierarchy has no document overflow or console errors, and every visible interactive target is at least 44×44px. ClassIn counts exclude unrelated personal brands. | The brief still summarizes current status rather than showing historical signal trends. |
| Personal CRM clarity | 17 / 18 | Hydrated Revenue Leads and the live ledger show only 16 exact-owned eeoCRM records resolving to `Me`; score, stage, value, next action, region, tags, and customer-success lane are separated. At 390px the primary name column is 188px instead of collapsing to 0px, while desktop retains all eight columns. The detail drawer separates direct touchpoints from public signals. | Legitimate same-company rows such as Studysync still need a stronger contact discriminator in the compact table. |
| PMS core usability | 13 / 16 | Live home summary shows 4 projects, 6 tasks, 2 due today, and 1 blocked project. Projects now supports durable create/edit, task create/complete, and task-only 5-state Board movement through Hub→Engine→Supabase with read-back. | Advanced monday/Asana parity such as dependencies, saved views, delete, and a full activity timeline remains outside Phase 1. |
| ClassIn content lanes | 13 / 14 | Class.Moon, ClassIn Side, and Study.Seagull are canonical, live, separately filterable lanes with inherited `classin` scope. Draft create/duplicate retry/update/read-back now crosses Hub→Engine and rolls back a failed pair create. Empty lanes expose a first-draft action; at 390×844 the empty state remains inside the 340px card and Studio preserves the requested brand instead of restoring a different active local draft. | The first-draft action still opens the full Studio instead of a purpose-built quick capture for the minimum idea fields (reference, reason, and recommended channel). |
| Integration honesty and control | 14 / 14 | Health and provider status APIs distinguish live, disabled, snapshot, and fallback. Four Moonlight secrets are separated. OpenClaw static credentials are Keychain-backed SecretRefs with plaintext/unresolved count 0. Calendar OAuth and iCal do not merge. Gmail/Sheets no longer overstate ledger presence as OAuth readiness. MCP has guarded writes and 13 tools. | No deduction in the implemented local boundary. |
| Mobile and accessibility | 9 / 11 | Projects, Daily Brief, and Revenue Leads were checked at 390×844. Document overflow is 0; Revenue prioritizes identity and stage; topbar breadcrumbs and the Daily Brief ledger toggle meet 44×44px; the toggle exposes label, expanded state, and controlled content. | A product-wide keyboard and screen-reader pass is still pending. |
| Reliability and recoverability | 10 / 12 | Repository tests, Hub/Engine builds, connection checks, live PMS/content round-trips, fresh MCP 13-tool discovery plus task create/read-back/delete, and signed webhook 401/accepted/duplicate/read-back/delete all pass. A fresh SSR request exposed and fixed an old `isLiveLedger` ReferenceError, with an explicit regression test and HTTP 200 recheck. OpenClaw has security critical 0 and preserved the reset transcript. Temporary verification rows are 0. | Claude Desktop app lifecycle remains unverified; OpenClaw's corrected Telegram cron has not yet reached its first scheduled delivery. |
| **Total** | **89 / 100** |  |  |

## Exit conditions for 92+

1. Restart Claude Desktop and verify Moonlight tool discovery/read without copying secrets.
2. Observe the next `daily_news_930am` run and require `lastDeliveryStatus=delivered`.
3. Complete a product-wide keyboard and screen-reader audit beyond the three verified operator surfaces.
4. Add an explicit contact/record discriminator for repeated same-company CRM rows.
