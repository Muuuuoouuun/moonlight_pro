# Moonlight Master Directive

Status: active directive
Updated: 2026-07-13

> 운영자 사실과 현재 구현 단계는 `docs/README.md`의 우선순위를 따른다. 이 문서는 바뀌지 않는 제품 경계만 정의한다.

## Directive

Moonlight exists to turn scattered work, business, content, revenue, automation, and knowledge signals into action.

The product is successful when the operator opens Hub first and immediately knows:

- what changed,
- what matters,
- what is blocked,
- what to do next,
- what failed,
- what decision was made.

## Product Boundary

Moonlight is not limited to three legacy projects. `classinkr-web`, `sales_branding_dash`, and `ai-command-pot` are seed contexts only.

Every current or future project/business/info stream must enter the same command loop:

```text
signal -> ledger -> priority -> action/decision -> execution -> result/repair
```

## Active Architecture

- `apps/hub`: private command surface for reading, deciding, approving, and dispatching intent.
- `apps/engine`: intake and execution layer for validation, normalization, provider calls, and ledger writes.
- `supabase`: operating ledger for state, history, correlation, decisions, and failures.
- `packages/*`: shared domain logic and reusable UI/domain primitives.

The public web app is not active in this workspace. Public proof can return later as an export layer produced from real private ledger activity.

## Non-Negotiables

- Hub must not own provider execution details.
- Engine must not own UI.
- Public POST routes require shared/provider secrets unless explicitly local open mode is enabled.
- Supabase-less states must be honest `preview` or empty states.
- Mock and live data must not be blended as if both were real.
- Every important record should have `next_action`, owner/due context, or a clear waiting reason.
- Failures must be visible, classifiable, and repairable.

## Retired Premises

- Retired: "Moonlight is a hub for three projects."
- Retired: "Landing/Public is an active product layer in this workspace."
- Retired: "Self-Evolution means automatic code patching."
- Retired: "Classinkr green is the design anchor."

Replacement:

- Moonlight is a personal operator command loop for all active work and business information.
- Public proof waits until private execution has gravity.
- AI proposes repair, a human approves, the ledger remembers.
- Design follows `DESIGN.md` and Moonlight Pro moonstone tokens.

## Build Priority

1. Complete the durable task loop: capture, save, surface, complete, reload.
2. Aggregate real follow-up and calendar signals into the Action Desk.
3. Close contact outcomes and next-action creation atomically.
4. Convert content ideas into variant/handoff history.
5. Convert failures into repair queues.
6. Only then expand ClassIn sync, voice AI, public proof, or broader automation.
