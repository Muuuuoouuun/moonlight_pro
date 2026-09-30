# Office source-state-v1 · independent evaluation

**Conclusion: the source-state instruction hypothesis is insufficient.** All 13 planned generations completed, but public council statements and some dependent recommendations still convert unknown prerequisites into commitments. Explicit later confirmations were adopted correctly. This is targeted evidence, not nine-role quality certification.

Candidate: `c6d1ca8de5ca8e531c145a7f869b1fd85fec16f6` · role cards `2026-09-30.v26-role-proportionality` · source policy `source-state-v1` · configured/reported model `gemini-3-flash-preview`.

## Separate datasets

| Dataset | Execution | Frozen criteria | Observed result |
| --- | --- | --- | --- |
| Previously disclosed development replay | 6 scenarios, 8/8 generated, 36 provider calls | 19 | 12 met, 3 partially met, 4 not met |
| Fresh private heldout at test | 2 scenarios, 5/5 generated, 35 provider calls | 8 | 5 met, 2 partially met, 1 not met |

No retries, substitutions, splicing, errors or blocked generations occurred. Criterion counts overlap in subject matter and are not independent quality scores or pass-rate estimates. The two datasets are not combined into one success rate.

Both runs used runtime bundle `b4b9fbefdc974e0c3c4d91f03a4e654f90ebd66e55286b1bbc1e8eec4ed7b253`; all 26 source hashes matched the candidate and the final runtime checks. Details: [development summary](development-summary.json), [heldout summary](holdout-summary.json), [integrity](integrity-check.json).

## Material findings

- **Development h01:** Source says tomorrow and the following day's available work time is unknown. Update vaporeon response says the extended deadline creates time for the manual fallback; final recommendation schedules tomorrow morning. Close synthesis preserves the uncertainty, while a public first position still asserts fallback capacity. See [assessment](assessments/development.md#h01-window--not-met) and [full input/history/output](dossiers/development/h01-window.md), record `h01-window/update`, `response.discussion.turns[4].position` and `response.recommendation`.
- **Development h02:** Source leaves headcount, schedule, support and cost unconfirmed. Flareon's public reconsideration explicitly calls a two-person demo unconditionally possible. Umbreon objects, but synthesis still labels the request accepted; final customer text is softer and promises preparation for the two-person direction. See [assessment](assessments/development.md#h02-reply--not-met) and [dossier](dossiers/development/h02-reply.md), `h02-reply/initial`, `response.discussion.turns[3].position`, `response.answer`, `response.recommendation`.
- **Fresh p01:** Initial answer correctly lists all three unknown readiness prerequisites. Its recommendation and eevee's change condition present version/access confirmation as sufficient, omitting separate external-sharing approval. This is a narrow dependent-condition omission, not a wholly incorrect initial answer. After all three are explicitly confirmed, every role and synthesis accept readiness and keep actual delivery unperformed; closure does the same. See [assessment](assessments/holdout.md#p01-share-ready--partially-met) and [dossier](dossiers/holdout/p01-share-ready.md), initial `response.recommendation` and `response.discussion.turns[3].revisionCondition`.
- **Fresh p02:** Final initial customer text preserves availability uncertainty and removes arbitrary dates. Public role drafts nevertheless promise confirmation/reply by this week or Friday and offer priority notice. These are unsupported information-confirmation/reply commitments, **not promises to deliver the recording by that date**. After explicit approval, all roles and synthesis correctly communicate the supplied free delivery plan without claiming it already happened. See [assessment](assessments/holdout.md#p02-recording-request--not-met) and [dossier](dossiers/holdout/p02-recording-request.md), initial `response.discussion.turns[0/2/3/5].position` and `response.dissent[0]`.

Development h03 keeps net savings unknown but calls setup unrecovered; it also infers zero upkeep from a preference for no additional setup. The latter is a separately recorded observation. h04's arithmetic and future-condition qualification, h05's personal choice, and h06's closure meet their frozen criteria. Additional unsupported HTTP-status and delivery-channel details in the fresh set are recorded separately, without adding post hoc criteria.

## Independence and chronology

The reviewer authored no runtime role cards, prompts or evaluated outputs. The original six cases were private at the earlier v26 run, then disclosed and reused to develop this candidate: this replay is **development**. The original [v26 evidence](../2026-09-30-office-v26-holdout/README.md) and journal remain unchanged.

The fresh two-case suite was prepared after implementation started and frozen at **2026-09-30 01:11:24.833 KST**, **27.833 seconds after** candidate commit time 01:10:57 KST. The reviewer had not inspected the new implementation or candidate outputs, and exact cases/criteria remained private until evaluation. This is fresh private data at execution; it is **not** a pre-implementation or pre-commit freeze. [Exact chronology](suites/holdout/chronology.json).

Live execution finished at 01:17:56 KST. No subsequent model runs or source corrections were performed by this reviewer. Exposure after this run makes subsequent reuse development evidence.

## Evidence and verification

- [Development journal](runs/development.jsonl) and [fresh journal](runs/holdout.jsonl) preserve every attempt/result, actual request/context/history, public response, provider trace and final runtime check.
- Frozen [development suite](suites/development/cases.json) and [fresh suite](suites/holdout/cases.json), original freeze records, executed adapters and one-shot lock records are included.
- Assessments: [development JSON](assessments/development.json), [heldout JSON](assessments/holdout.json). Manual judgments use 91 exact quote anchors, all validated. These judgments were not authored by the runtime implementer.
- [Method and limits](METHOD.md), [validation](validation.json), [tooling hashes](evaluation-tooling.sha256.json), [artifact manifest](artifact-checksums.json).

Offline validation, from the repository root (no model or database access):

```sh
node docs/evaluations/2026-09-30-office-source-state/validate.mjs
```

The validator checks evidence consistency, not semantic correctness. It also verifies the sibling original v26 journal. Archived one-shot runners retain their locks; do not rerun them or remove locks as part of validation.

## Bounded follow-up direction

The observed gap is preservation of prerequisites in public role drafts and conclusions that depend on them, including proposed confirmation deadlines. Any later experiment should check those outputs alongside synthesis and retain the demonstrated positive controls for newly confirmed facts. Additional prompt length or a cleaner final answer alone is not evidence that the gap is solved. No further tuning, live calls, production application or UI approval follows from this evaluation.
