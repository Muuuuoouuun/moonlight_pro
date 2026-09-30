# Pet Office Notifications and Conversation Implementation Plan

> For agentic workers: use superpowers:subagent-driven-development. Implement in the attached `pet-office-system` worktree, branch `codex/pet-office-system`. The operator approved the design and clarified same-place role notifications, switching and multiple perspectives on 2026-09-29.

**Goal:** Actual notice owners appear as the notifying pet, and opening a notice starts a contextual conversation that supports switching among the nine roles and selecting 2–3 Office perspectives without losing drafts or crossing scope boundaries.

**Architecture:** Existing shared Office contract supplies role metadata; generated Swift metadata prevents drift. Existing Hub chat/council APIs remain the generation boundary. Native conversations are keyed by origin, scope and topic, with per-turn role attribution. Existing live notification feeds supply grounded notice summaries.

**Tech Stack:** JavaScript/TypeScript contracts and Node tests; SwiftPM, Foundation executable checks, SwiftUI/AppKit; existing Gemini evaluation runner.

## Task 0 — frozen role-quality baseline (independent checkout)

- [x] Create managed `pet-office-baseline` checkout at `944fac9e` and install dependencies.
- [x] Use the existing evaluation CLI with existing environment-file credentials; preserve source/model hashes and all 39 generation outcomes.
- [x] Apply the existing rubric only to actually observed responses; record incomplete coverage honestly. Do not tune runtime prompts while establishing the baseline.
- [x] Save evidence under `docs/evaluations/2026-09-29-office-v25-baseline/` and record actionable findings separately from generation success.


Task 0 evidence: [frozen v25 baseline](../../evaluations/2026-09-29-office-v25-baseline/README.md), original 36/39 generated, 174/180 criteria scored, 0/9 passed. One separately preserved recovery generated 2/4; missing results were not spliced into the score. Runtime source hash remained fixed.

## Task 1 — shared role catalog and native export

Files: existing `packages/agent-contracts/office.js`, `office.d.ts`, new browser-safe role metadata module if appropriate; `apps/engine/lib/office/routing.ts`; `scripts/export-office-pet-catalog.mjs` and adjacent test; generated `prototypes/moonlight-pet-macos/Sources/MoonlightPetPreview/Models/OfficeRoleCatalog.generated.swift`.

- [x] Add behavioral tests for exact nine-role coverage, unique stable IDs, known notification owners and deterministic generated Swift drift detection.
- [x] Keep identity and public capability fields versioned, using the existing roster as the identity source. Each role has responsibility, supported request examples and handoff boundary. Inquiry maps to flareon; calendar maps to vaporeon; reply retains its actual owner.
- [x] Export compact Swift metadata keyed by raw Office ID. Expected use:

```swift
OfficeRoleCatalog.roles["flareon"]?.role
OfficeRoleCatalog.roles["flareon"]?.responsibility
OfficeRoleCatalog.noticeOwners["inquiry"] // "flareon"
```

- [x] Make routing consume responsibility and handoff criteria from the same metadata; preserve explicit operator selection, scope and max 2 reviewers.
- [x] Run focused Node contracts/routing/export tests. Do not edit v25 role-card text.
- [x] Complete spec review, then code-quality review before the native task depends on the catalog.


Task 1 evidence: commit `d9ab18b0`; non-author spec review approved; root code-quality review approved after specification review. Focused catalog/routing/export tests 12/12 passed independently, generated Foundation Swift typecheck passed. Engine typecheck and full identity/Unicode round-trip also passed in implementer validation. Reviewer reuse was necessary because the available agent-thread limit prevented fresh review threads.

## Task 2 — notification conversation and participant contract

Files: `Models/OfficeChatModels.swift`, `OfficeChatStore.swift`, `PetActivityStore.swift`, `PetCharacter.swift`, `AppModel.swift`, `Support/HubOfficeAPI.swift`, related Foundation checks/scripts.

- [x] Write failing tests for same-topic role switching retaining history/draft, scope/origin isolation, separate notification drafts, exact topic reopening from reply notices, stale replies and in-flight changes.
- [x] Store each conversation by origin/scope/topic instead of the owner alone. Turns retain actual owner, participants and response. Same-topic owner change preserves prior turns and draft. Topic/scope change saves and restores each state.
- [x] Use the existing wire contract rather than adding arbitrary server fields:

```json
{"ownerId":"flareon","scope":"all","mode":"council","participants":["flareon","umbreon"],"message":"…","history":[],"lens":null,"includeProjects":false}
```

- [x] Single owner uses chat with no participants; council requires 2–3 distinct known participants including owner. Decode and validate real council recommendation/evidence/dissent/discussion against the response owner/scope/participants.
- [x] Carry notification title/detail/date as an explicitly labelled summary, not full customer facts. Retain source URL only for allowed same-origin browser navigation. Unknown notice scope remains all.
- [x] In-flight command captures target and mode. UI changes cannot silently retarget or cancel it; preserve drafts on refusal, explicit cancellation, timeout and stale responses.
- [x] Add a presentation-only character resolver: visible banner owner first, active conversation owner next, preferred pet otherwise. Never overwrite saved preference from a notice.
- [x] Run office transport/store/activity/domain checks before view integration.

## Task 3 — native surface integration

Files: `Views/CouncilCompanionContent.swift`, `NotificationContent.swift`, pet/bubble/companion views and coordinator references, `App/PetApplication.swift`, related native checks; pet README.

- [x] Read root `DESIGN.md` fully and relevant latest pet glass specs. Use existing glass, motion and sizing primitives; preserve their current appearance.
- [x] Expose unambiguous labels: Office conversation, Office meeting room, brand Council. Keep existing storage IDs where renaming is unnecessary.
- [x] Show the notification owner portrait/name on the banner and notice. Primary action opens the corresponding conversation; secondary opens the original Hub screen.
- [x] Owner menu switches within the topic; an existing menu hosts add/remove perspectives up to three total. Display selected roles and each actual response owner. Keep controls disabled or explicitly explain when a request prevents a change.
- [x] Display real group discussion plus synthesis without manufacturing per-role answers. Preserve keyboard sending, focus, cancellation and readability in the existing panel.
- [x] Update available role-specific example prompts in the existing empty state. These are UI request examples, not fake business records.
- [x] Build SwiftPM and run existing Foundation suites plus new behavior cases.
- [ ] Launch via existing build script only after reviewing running app context; inspect actual UI.
- [x] Spec compliance then code quality review; resolve every concrete blocker.


Native implementation: commit `3bb2ac12`, 27 files. Six Foundation scripts and SwiftPM `swift build -j 2` passed independently. The specification reviewer found one P2: selecting a speech outside recent history did not carry that speech to the next request. Commit `a0fc97e3` fixes this by preserving the parent turn and exact speech index. The reviewer rechecked the fix and independently reran the store suite; specification review approved. Root then approved code quality and independently reran store/API checks and SwiftPM build (all passed). Regression coverage includes six newer exchanges, actual speaker/round, failure/cancel retention, stale completion, session isolation and escaped-JSON pressure within the existing budgets. Actual UI inspection is currently blocked by the locked Mac; the operator was asked to unlock it. The running app has not been restarted.

## Task 4 — integration evidence and role follow-up

- [x] Run focused shared/native checks, repository test/typecheck gates appropriate to touched packages, and build checks.
- [ ] Inspect real app flow without writing artificial business records: owner display, role switch with draft, participants, origin/scope, source navigation and in-flight handling. Live generation uses an explicit user-style read-only query only if credentials and runtime are available.
- [ ] Resolve baseline findings with bounded changes only after independent evidence; holdout evaluation remains separate from cases used for tuning.
- [x] Document confirmed behavior and unverified external runtime/quality limits; retain complete evaluation evidence on the dedicated branch.

No new background AI calls, external messages, business DB schema, permanent conversation store, or new role authority is needed for this approved flow.

## Integration observations — 2026-09-30

- At initial inspection, the running desktop app targeted `http://127.0.0.1:3000`. Its local Hub used the Seoul production Supabase project `ncgpnqfulnlshegalmbd`; local frontend does not imply disposable data. This is a saved target and an observation at that time, not a claim that port 3000 remains available.
- Dedicated verification servers were started from this checkout at Hub `127.0.0.1:3100` and Engine `127.0.0.1:3101`, with a separate `.next.pet-office` build directory. Hub task/inquiry reads returned HTTP 200 with live Supabase envelopes. The desktop app has not been pointed at these servers.
- Before v26 prompt changes, root repository verification: **3,435 tests, 3,422 passed, 0 failed, 13 skipped**. The skipped cases need a test database; this result does not establish UI behavior or semantic model quality.
- The frozen v25 evaluation fulfilled the independent reassessment condition for the previous voice freeze. A bounded role-card correction was approved based on the preserved observations, version `2026-09-30.v26-role-proportionality`. Common policy, model, timeout, API and DB contracts stay unchanged for the first candidate.
- A non-author evaluator froze six private scenarios/eight generation calls before candidate implementation. The implementer has not seen their contents. This is targeted regression evidence, not a replacement for the full nine-role rubric.
- Candidate `15101f5c` contains v26 role cards, all-nine prompt assembly regressions and the generated role instruction readcopy. Implementation changes are limited to these three files. The implementer ran 113 focused Office/no-mock checks and Engine typecheck successfully. Root independently verified the resulting repository: **3,439 tests, 3,426 passed, 0 failed, 13 skipped**, Engine typecheck, generated pet catalog freshness and `git diff --check` passed. The four additional tests cover retired defaults, generation/review assembly, real council role routing with an injected generator, and exact documentation export; they do not measure semantic response quality.
- Non-author v26 specification review approved `15101f5c` and independently passed the four new tests; root code-quality review approved afterward. The first private evaluation generated 8/8 responses with no errors/retries and unchanged runtime hash. It exposed residual council contradictions: an extended deadline became enough future work capacity, and an explicitly unknown participant limit became a definite customer promise. These errors already appear in first-position calls and survive response/synthesis, so the native transport is not their source. The exact original run is preserved in [v26 evaluation](../../evaluations/2026-09-30-office-v26-holdout/README.md). Once disclosed for correction, these cases are development material for later candidates.
- The dedicated QA servers on 3100/3101 were stopped when locked-Mac UI verification could not proceed. A later listener check also found the original 3000 Hub no longer listening; only the existing 3001 Engine remained. No restart of shared services was attempted. The desktop's saved target remains 3000, so a live connection must be rechecked after unlock rather than assumed from the earlier successful read.

### Pending native UI verification

The Mac lock prevents accessibility/screenshot inspection. No lock bypass or application replacement was attempted. The original running bundle was `pet-glass-section/moonlight_pro/prototypes/moonlight-pet-macos/dist/MoonlightPetPreview.app` in another managed worktree. Keep that checkout available while its process runs. The current app has app-lifetime chat memory, so inspect active drafts and pending generation before a restart; the existing task draft must also remain intact.

Root separately assembled this checkout's `prototypes/moonlight-pet-macos/dist/MoonlightPetPreview.app` using the existing build script's bundle layout, without its termination or launch steps. Local ad-hoc signing, strict signature verification and Info.plist lint passed; all 14 resource-file hashes match the SwiftPM bundle, and executable UUID `7FBBE040-826C-3F3C-B066-AE0FF2A57875` matches the tested build. This is a prepared local artifact, not a running update or a notarized distribution. Subsequent process inspection still found PID 80507 executing the original `pet-glass-section` bundle. Ports 3000/3100/3101 were closed; the existing 3001 listener remained.

After unlock:

1. Inspect the existing app state, then use this checkout's `prototypes/moonlight-pet-macos/script/build_and_run.sh --verify` to build, package, sign and verify the exact running binary. This script terminates the previous app, so it must not run before the state check.
2. Use the dedicated local Hub/Engine pair for the new runtime. Confirm the connection, source identity and current production-data boundary. Do not manufacture inquiries, tasks or events for QA.
3. Verify owner switching with an unsent draft, scope/topic restoration, preferred-pet preservation and two/three-participant selection, including changing the lead to a selected participant.
4. Run one explicit read-only conversation and one group request when the frozen model evaluation has finished. Check actual generated speech, synthesis, keyboard send/focus, cancellation, and continuation from a selected speech.
5. Fold the panel while a reply is pending; verify the actual reply owner's pet, exact-topic reopening and read acknowledgement. For inquiry/calendar notices, inspect real available records; if none exist, record that those visual cases remain unobserved rather than inventing records.
6. Record the final app binary path, Hub address and observed behavior. Remove only QA text created in this verification. Do not describe compiled source as an already applied desktop update.

## Bounded source-state follow-up

The frozen v26 run distinguishes citation tracing from semantic correctness: a response can cite the exact unknown condition and still assert its dependent promise. Root and the non-author evaluator traced this to first-position output, then public role responses and synthesis. The existing source validator checks citation existence; it does not certify entailment. A workflow instruction also told the model to move uncertainty into a separate field, leaving the customer body vulnerable to unconditional wording.

**One hypothesis:** Carrying unknown prerequisites into every dependent conclusion, rather than merely citing unknowns in an evidence field, will reduce the observed contradictions. This remains a hypothesis until actual responses are assessed.

Approved implementation boundary: `source-review.ts`, `prompt.ts`, `workflow-prompt.ts`, and `source-review.test.mjs`. Share versioned content guidance `2026-09-30.source-state-v1` across initial drafts and existing review/role/synthesis paths; replace the conflicting workflow clause. Preserve role-card v26, private/public schemas, model, call counts, deadline, DB and native behavior. Do not embed evaluation names, numbers or expected answers in runtime instructions.

- [x] Implement and test actual wrapper propagation/source isolation across draft, review, position, response and synthesis.
- [x] Non-author specification review, then code-quality review.
- [x] Freeze candidate; rerun disclosed cases only as development evidence, preserving earlier failures.
- [x] Independently assess a fresh private targeted suite with unknown and later-confirmed conditions; report limits and failures without changing the frozen criteria.

Candidate `c6d1ca8d` changes exactly the four approved files. The implementer passed 117 Office checks and Engine typecheck. The non-author specification reviewer approved it and independently passed 28 source-review checks; root reviewed code quality afterward. Root repository verification at this candidate: **3,445 tests, 3,432 passed, 0 failed, 13 skipped**, plus Engine typecheck, generated pet catalog freshness and `git diff --check`. Tests establish instruction propagation and execution contracts, not semantic effectiveness.

The evaluator preserved two separate runs at the frozen candidate: an eight-generation development replay of disclosed v26 cases, and a fresh two-scenario/five-generation private suite. All 13 generations finished (36 development and 35 fresh-suite provider calls) without errors, retries, blocked calls or recovery splicing. Both final runtime checks match `b4b9fbefdc974e0c3c4d91f03a4e654f90ebd66e55286b1bbc1e8eec4ed7b253`. No model override or business DB write was used.

The fresh suite was prepared after the earlier failure classes were disclosed and the correction began, but before the evaluator inspected this candidate's changes or outputs. Candidate commit: **2026-09-30 01:10:57 KST**; private-suite freeze: **01:11:24.833 KST**, 27.833 seconds later. It was not a pre-implementation freeze, and the implementer did not see its contents before testing.

**The hypothesis did not resolve the material contradictions.** In development replay, role speeches still turn an extended deadline into available work capacity, and still accept an explicitly unconfirmed two-person demonstration. The final customer draft describes coordination as already underway without supplied evidence. In the fresh suite, later confirmed readiness and delivery terms are adopted correctly and unperformed delivery remains unperformed. However, some public role drafts introduce an unsupported reply deadline or priority; one initial readiness recommendation omits a required approval condition even though the answer names it. Correcting a final synthesis does not remove exposed role speeches from the product. Formal criterion assessments are preserved with the run artifacts; these targeted runs do not certify nine-role quality or establish causal improvement over v25.

[Final evaluation evidence](../../evaluations/2026-09-30-office-source-state/README.md): development criteria **12 met / 3 partially met / 4 not met**; fresh criteria **5 met / 2 partially met / 1 not met**. These are descriptive, overlapping criterion counts, not independent scores. Root independently reran the offline validator: 27 frozen criteria, 91 exact quotation anchors, request/response hashes, coverage and honest freeze chronology passed. All 26 runtime source hashes match candidate and current source. Root also verified all 86 manifest entries across the v25, first v26 and source-state evidence packages, with no mismatches. Preserved previous failures remain unchanged. The evaluator's credential scan found no credential-value exposure.

The frozen Markdown dossiers contain 21 intentional two-space line breaks after `Input hash` labels. These were retained byte-for-byte to preserve the verified manifests. Root checked that these exact lines were the only staged `git diff --check` findings; all other whitespace checks passed. Runtime source checks remain clean.

### Remaining release limits

- Native implementation and the local bundle are ready for actual UI verification, which remains blocked by the locked Mac. Existing drafts must be inspected before replacement.
- Prompt candidates remain on this dedicated branch. The independent evidence does not support claiming that source tracing or the added instruction guarantees correct dependent conclusions. No production engine restart or shared checkout integration was performed.
- Further semantic work needs a separately reviewed design based on the failure trace across initial role opinions, public reconsideration and synthesis. Adding another general instruction without a testable mechanism is not recorded as a fix. Keep disclosed cases as development material, preserve later-confirmation positive controls, and require a fresh evaluation for a future quality claim.
