# Office v26 targeted independent holdout

## Result

**Generation completed 8/8. The targeted semantic check did not pass.** Two council cases still turn unknown prerequisites into confident operational or customer commitments. This is not a nine-role quality certification.

| Scenario | Observation | Verdict against frozen criteria |
|---|---|---|
| h01-window · eevee/vaporeon/jolteon, 3 turns | Extended deadline becomes sufficient future work time; unknown query cost becomes the cheapest path. Final close lists the unknowns, but contradictory claims remain in actual role statements. | Not met |
| h02-reply · flareon/umbreon/sylveon | Customer asks whether two people may attend; current capacity, timing, support and cost are unknown. All roles endorse availability and final copy promises it. | Not met |
| h03-observation · leafeon | Does not label unmeasured savings zero or confirmed loss; recognizes subjective comfort. Additional concern: no extra setup is turned into near-zero maintenance time. | Frozen criteria met; additional grounding concern |
| h04-periods · leafeon | First/recurring cash 60,000/42,000 KRW; net time +10/+75 minutes; weekly time break-even 20/3.75 minutes, all correct under the stated assumption. Closing wording calls later savings already secured. | Partially met |
| h05-personal · espeon | Chooses the personally interesting 20-minute activity, supplies a stopping point, adds no sales funnel. | Met |
| h06-close · glaceon | Distinguishes decision from implementation, acknowledges unknown state and closes without new work. | Met |

All 19 frozen expectations were manually assessed: 12 met, 3 partially met, 4 not met, 0 unassessed. These counts are not independent scores or a pass rate; one defect can affect multiple expectations. [assessment.json](assessment.json) contains each exact criterion, rationale and 62 mechanically validated source/output quote anchors. [assessment.md](assessment.md) provides the same judgment for reading.

## Definite remaining failures

### Deadline is not available work time

Source `h01-window/update`, `deadline`: **“내일과 모레 내가 일할 수 있는 시간은 아직 정하지 않았다.”**

Yet `response.dissent[0]`: **“연장된 기한 덕분에 실패 시 대안을 수행할 시간은 충분합니다.”** The same claim starts in eevee's first position objection, appears in vaporeon's response objection and jolteon's response position, and remains in later closing-role statements. The source also says query duration and success are unknown; describing it as the lowest-cost route is unsupported. A proposed 10-minute cap is not itself scored as a fabricated observation.

Bounded corrective direction: make unknown prerequisites remain unknown throughout first position, response and synthesis. A deadline shift does not establish work capacity; a supported lookup contract does not establish low cost, success or a viable fallback. If later source material explicitly confirms availability, it must be usable.

### Customer question is not a supported service promise

Source `h02-reply/initial`, `current`: **“설명 일정, 참여 인원 한도, 초기 지원 범위와 비용이 모두 아직 확정되지 않았다고 말했다.”**

Yet final `response.answer`: **“고객님, 운영팀 두 분이 함께 참여하시는 것도 당연히 가능합니다!”** Its own `response.evidence[1]` preserves that the headcount limit is unknown. First positions already contain the unsupported acceptance; this is not only synthesis loss. Later copy also promises confirmed information this week, and sylveon adds priority notice.

Bounded corrective direction: separate acknowledging the customer's request from confirming service availability. Removing an old unapproved benefit is insufficient if replacement wording promises a new unknown benefit, timeline or fulfillment. No equal-weight control was run, so the defect is not attributed causally to influence weights.

## Provenance

- Candidate commit: `15101f5c59bc011090f1e7d9670c57bbdf9aa9fd`.
- Role version: `2026-09-30.v26-role-proportionality`; contract: `2026-09-22.v3`.
- Configured and actual reported model: `gemini-3-flash-preview`; 36 provider calls, all successful; no model substitution, retries or splicing.
- 2026-09-30 00:59:34–01:02:08 KST (2026-09-29 15:59:34–16:02:08 UTC).
- Actual evaluation concurrency: 1. The existing run header's `maxConcurrency: 2` is the harness limit, not actual concurrency.
- Runtime source bundle: `469e709909b42199b04873bfb09a87509e71b387bd7f248a6f460042e478176d`; 26 source hashes in raw run header; before/after unchanged.
- Frozen case-file SHA256: `2de2e49762faed5e825d3b8dab25c46ddeff8a3a2cb28d6c2661886c79fd1dd7`.
- Suite hash: `04874ea524c8ba3d67ef2b2d40946d721821c85f3714b94675d031ad882f3018`.
- Fingerprint: `75781be93244f292f48bf66f3981103eaab1c31ffc591c5f4382cf80aa9f49d7`.
- Raw journal SHA256: `ea945e5839bfe9d6daa39f1ad36f286ccfc5900ce9f8f52697027e0bb389e7ab`.

[execution-summary.json](execution-summary.json) and [runs/v26-frozen.jsonl](runs/v26-frozen.jsonl) preserve exact input/output hashes, real generated public fields, per-call prompt/settings/output hashes, timing, model diagnostics and coverage. No incomplete or failed observations were replaced. Synthetic evaluation sources only; no production ledger writes, external messages or app launches.

## Independence and exposure

The assessor created these cases and froze wording/expectations before the first v26 correction commit. The assessor did not author runtime prompts or outputs. The set intentionally probes categories observed in v25, so it is a targeted generalization check, not a random measure of business quality. There is no same-case v25 control run and no numerical improvement claim.

The suite was private from the runtime implementer until the frozen run ended. Root received the completed results; afterward h01/h02 were disclosed to the implementer for another bounded correction. **This original run remains held out at execution, but any subsequent reuse is development.** The original journal and expectations remain unchanged. Do not retitle a later replay as a fresh holdout.

All nine identities appear, but work/evidence/social/update/close coverage and parameter comparisons are incomplete for individual roles. No 20-criterion role scores or overall nine-role pass verdict are produced.

## Evidence and verification

- `suite/`: exact cases, initial freeze, original runner, executed runner, run-start lock and documented preflight adjustment.
- `dossiers/`: all six scenarios, actual request/context/history and public responses.
- `assessment.json` / `assessment.md`: independent manual findings; semantic validity is not established by automated quote validation.
- `evaluation-tooling.sha256.json`: evaluator and dependency hashes from the exact candidate commit.
- `validation.json`: fresh validation of frozen cases, request/response hashes, complete attempt recording, runtime coverage and every quote anchor.
- `artifact-checksums.json`: SHA256 for every evidence file except that manifest itself.

Read-only verification:

```sh
node docs/evaluations/2026-09-30-office-v26-holdout/validate.mjs
```

The validator regenerates the same summary but makes no model calls. Model replay requires a separately authorized development run and the exact candidate checkout/dependencies; preserve the existing `run-started.json` one-shot lock and original journal. `suite/freeze.json` retains the initial no-call permission state; later explicit authorization is recorded in [METHOD.md](METHOD.md).
