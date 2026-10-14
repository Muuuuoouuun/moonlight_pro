# Office compact author integration and evaluation

> **For agentic workers:** Use superpowers:executing-plans inline. The existing user goal authorizes implementation and evaluation; no additional execution-choice interview is needed.

**Goal:** Bring the promising single-author candidate through all nine roles and real discussion contracts, then measure the unchanged seven-dimension rubric (each ≥80, mean ≥84).

**Architecture:** Add a server-selected `compact-v1` authoring policy to the existing cancelable response core. Individual requests use one source-bound author call; discussions retain separate role positions, peer responses, keyed objection resolutions and one synthesis. The public request, actor attribution, source/answer parsers, legacy default and 48-second HTTP budget remain in place. A separate evaluation entry point injects the existing isolated Codex CLI adapter; this does not activate a local worker or a production provider.

**Tech Stack:** TypeScript, Node test runner, existing Office contracts/evaluation journals and Codex CLI adapter.

## 1. Core boundary tests before implementation

Files: create `apps/engine/lib/office/authoring.test.mjs`; modify `response-core.ts` and `deliberation.ts`; create `authoring.ts` in the same directory.

- [x] Add failing tests exercising the public core with `authoring: 'compact-v1'`: one source-reviewed individual call; unchanged two-call default; invalid policy rejection before provider access; invalid source envelope rejection; caller cancellation wins over a late success; 2-role discussion still makes five calls, preserves exact peer quotes and rejects absent objection resolutions.
- [x] Run `node --import ./scripts/register-hub-alias.mjs --test apps/engine/lib/office/authoring.test.mjs` and preserve the failing output.
- [x] Implement the policy union and common builder. Required call shape:

```ts
runOfficeResponse(request, context, {
  signal: AbortSignal.timeout(48_000),
  generate,
  authoring: 'compact-v1',
});
```

The builder passes the complete user message/history/context as data, and the current role's mission/ownership/expertise/boundaries separately from factual sources. It uses the existing operating policy, exact source catalog and source schema. Its general implementation guidance distinguishes trusted control fields from user payload fields so a suggested object merge must preserve reserved identity values. It contains no evaluation scenario IDs, reference answers or business records.

- [x] Keep `reviewed-v25` as the default. Do not accept the new policy from the browser request. For compact discussions, change only authoring instructions/functional role context; reuse round selection, peer index reconstruction, source validation, model binding and resolution validation.
- [x] Run the new tests plus `execution-core.test.mjs`, `deliberation.test.mjs`, `discussion-evidence.test.mjs`, `source-review.test.mjs`, and `office.test.mjs`; run `npm run typecheck` before paid evaluation.

## 2. Reusable evaluation entry point

Files: create `scripts/eval-office-compact-codex.mjs` and its adjacent `.test.mjs`; reuse `office-evaluation/cli.mjs`, `runner.mjs`, `trace.mjs` and `codex-provider.mjs`.

- [x] Test that listing never initializes a provider, execution uses the compact core with a shared 48-second signal, and the provider/run journals bind the same run ID and source hash. Reuse the existing cancellation wrapper and append-only provider logging rather than creating another ad-hoc live writer.
- [x] Add authoring/budget selection only as internal evaluation construction parameters to the existing Codex runner, preserving its old default behavior and its tests; make the new entry point explicitly choose `compact-v1` and 48 seconds.
- [x] Fingerprint all new policy and harness files plus CLI provenance. Record actual CLI completion, errors and tool events; never claim an unenforced output-token ceiling or invent a model version.
- [x] Run a frozen full development suite and separate post-fix meeting smokes with fresh paired journals, no automatic retries and concurrency ≤2. Actual order was full development (27 generated / 6 errors / 6 blocked), schema diagnosis/fix, then two failed 48-second Council smokes. Every execution reached terminal state before source changes or subsequent runs. Failures are preserved; this checkbox records execution, not quality acceptance.

## 3. Independent semantic evaluation and real adoption boundary

- [x] Build the normal review pack from the complete journal and independently score all observable criteria with original source quotes. 144 valid ratings, 36 collaboration criteria unassessed; separate post-fix snapshots are not mixed in.
- [x] Assess speed/reliability from actual candidate requests including failures. Preserve the previous rubric thresholds and critical gates. Failed Council timing is not a speed certification; first-attempt generation is 27/39 and missing current recovery/UI observations remain unassessed.
- [ ] If still below target, use specific recorded failures to decide the next change. If it meets the development threshold, validate a fresh independent holdout and the actual intended Office provider connection before claiming the user goal is complete.
- [x] Commit the verified schema fix and evidence with explicit paths. Full regression is 4,261 passing / 14 optional PostgreSQL skips, typecheck and Engine build pass; independent code review found no new P1/P2. Production DB writes, deployment, worker credentials and desktop installation are not implied by an evaluation pass.

The prior 4-case comparison and its independent P2 finding remain immutable at `06aacfa3`; they are not the new core's quality score. The historical diagnostic integrity command checks that historical source snapshot and must be run there.
