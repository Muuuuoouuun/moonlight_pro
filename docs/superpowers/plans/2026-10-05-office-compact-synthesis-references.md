# Office compact synthesis references implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement these steps in the current isolated worktree. This is an internal evaluation candidate under the existing improvement goal, not an operator decision to activate a provider or change policy.

**Goal:** Reduce repeated generated text while preserving all role calls, public fields, objection coverage and fixed quality/speed gates.

**Architecture:** For compact-v1 synthesis only, a resolution may reference an earlier resolution belonging to the same role with exactly the same objection. The model may still write a distinct disposition/rationale. A null recommendation explicitly copies the entire answer when it satisfies the existing 2,000-character recommendation limit. Server expansion precedes the existing strict public parser.

**Tech Stack:** Existing TypeScript Office core, JSON schema, node:test, recorded API/CLI evaluations.

## Design and evidence

`041c4c17` showed first positions and peer responses completed, but synthesis exceeded the shared 48 seconds even with 73–355ms thread setup. Replacing transport did not resolve the problem. Skipping rounds would violate the existing task; optional lossless references are the selected implementation approach. Evidence and dissent strings remain authored normally. This deliberately measures one representation change before adding other optimizations.

Each objection key remains required. Reference targets must be earlier, same-owner, nonempty and byte-for-byte equal in objection text. No missing entry, extra entry, forward/self/cross-owner reference, or reference to a changed objection is accepted. References are resolved into copied objects without mutating inputs. Source checks, role cards, public contracts, reviewed-v25 and the seven-axis acceptance remain in force. Correct expansion is not semantic validation or proof of faster inference.

## Task 1 — contract and integration

Files: create `apps/engine/lib/office/synthesis-references.ts` and `.test.mjs`; modify `apps/engine/lib/office/response-core.ts` and `discussion-delta.test.mjs`.

- [x] Add failing tests for same-owner identical-objection references, explicit differing decisions, invalid reference targets, complete key coverage, recommendation null bounds and input immutability. Initial unit RED was a missing-module failure; later chain/core RED logs demonstrate behavioral failures.
- [x] Add failing core tests using `runOfficeResponse`: all seven calls remain; expanded output passes the public parser; legacy authoring rejects the new representation; bad aliases fail before generated status.
- [x] Implement `compactSynthesisPrompt(prompt, turns)`, `compactSynthesisSchema(schema, turns)` and `expandCompactSynthesis(raw, turns)` in the dedicated module. Schema uses `anyOf: [existingDecisionSchema, {type:'string', enum: eligibleEarlierRefs}]`, retaining a full decision option for every entry. Recommendation uses `anyOf: [existingStringSchema, {type:'null'}]`.
- [x] In the compact Council branch, wrap the existing synthesis prompt/schema and expand its source-reviewed answer immediately before `readOfficeSynthesisOutput`. All other paths continue through their current parser.
- [x] Run `node --import ./scripts/register-hub-alias.mjs --test apps/engine/lib/office/synthesis-references.test.mjs apps/engine/lib/office/discussion-delta.test.mjs`; retain RED/GREEN logs and obtain independent code review. Spec/code reviews passed; two evidence-verifier findings were fixed and independently rechecked.

## Task 2 — actual evidence and final checks

- [x] Run the existing `runCompactGeminiCore` diagnostic with fresh quality/provider journals, model `gemini-3.1-pro-preview`, scenario `offer-balanced`, development status, concurrency 1 and 48-second budget. Use only the already configured Gemini credential in an isolated environment; no production configuration change. If the fixed recorded Pro alias differs, use the recorded exact alias instead of inventing one.
- [x] Compare actual initial/update/close outputs against supplied source facts, peer statements and prior same-model bounds run. Report all failure/blocked outcomes. Count actual aliases and output tokens; never infer timing gains from fewer schema fields.
- [x] Run relevant Office and evaluation regressions, `npm test`, `npm run typecheck`, and `npm --workspace @com-moon/engine run build` after code is stable. Record limitations if any required check fails.
- [x] Save source-bound comparison evidence; stage only owned files; confirm current branch before commit and inspect commit stat afterward.

## Completion boundary

This implementation step is complete only if its public-contract tests and actual comparison are recorded. The thread goal still requires all nine roles, complete Council/settings observations, seven dimensions each ≥80 with mean ≥84, no critical failure, independent fresh holdout and actual intended runtime connection. This smaller step does not certify that goal.
