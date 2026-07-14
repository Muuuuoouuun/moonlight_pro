# Moonlight Operator OS usability self-evaluation

> Date: 2026-07-15 KST  
> Scope: Daily Brief, personal eeoCRM view, PMS summary, ClassIn content lanes, Calendar/OpenClaw/MCP connection honesty  
> Result: **89 / 100**

This is an operator-usability score backed by live API responses, focused tests, builds, control-plane probes, and browser checks of the Projects surface at desktop and 390×844. It is not a full product-wide pixel grade; Daily Brief and Revenue still need the same visual pass.

| Criterion | Score | Evidence | Deduction |
| --- | ---: | --- | --- |
| Action hierarchy and Daily Brief | 13 / 15 | PMS and ClassIn content pulse expose status counts, compact distributions, and direct task/queue actions. ClassIn counts now exclude unrelated personal brands. | Daily Brief itself has not yet received the same desktop/390px screenshot pass as Projects. |
| Personal CRM clarity | 17 / 18 | Only 16 exact-owned records resolve to `Me`; score, stage, value, next action, region, tags, and customer-success lane are separated. Score is no longer rendered as money. | Legitimate same-company rows such as Studysync still need a stronger contact discriminator in the compact table. |
| PMS core usability | 13 / 16 | Live home summary shows 4 projects, 6 tasks, 2 due today, and 1 blocked project. Projects now supports durable create/edit, task create/complete, and task-only 5-state Board movement through Hub→Engine→Supabase with read-back. | Advanced monday/Asana parity such as dependencies, saved views, delete, and a full activity timeline remains outside Phase 1. |
| ClassIn content lanes | 13 / 14 | Class.Moon, ClassIn Side, and Study.Seagull are canonical, live, separately filterable lanes with inherited `classin` scope. | Two lanes are correctly empty but do not yet have a first-item onboarding action. |
| Integration honesty and control | 14 / 14 | Health distinguishes live, disabled, snapshot, and fallback. Four secrets are separated. Calendar OAuth and iCal do not merge. MCP has guarded writes and 13 tools. | No deduction in the implemented local boundary. |
| Mobile and accessibility | 9 / 11 | Projects was checked at 390×844: no document overflow, Board scroll stays inside its own surface, and the edit drawer is 92vw and visible after excluding it from sidebar-hiding CSS. | Revenue remains a dense table on narrow screens, and a product-wide keyboard/screen-reader pass is still pending. |
| Reliability and recoverability | 10 / 12 | All 85 repository tests, Hub/Engine builds, Engine typecheck, connection checks, live PMS round-trip, direct MCP read, and launchd health pass. Temporary live verification rows were removed. | Claude Desktop needs restart verification; OpenClaw's corrected Telegram cron has not yet reached its first scheduled delivery. |
| **Total** | **89 / 100** |  |  |

## Exit conditions for 92+

1. Restart Claude Desktop and verify Moonlight tool discovery/read without copying secrets.
2. Observe the next `daily_news_930am` run and require `lastDeliveryStatus=delivered`.
3. Extend the desktop/390px visual audit from Projects to Daily Brief and Revenue, then fix only measured overflow/hierarchy issues.
4. Add an explicit contact/record discriminator for repeated same-company CRM rows.
