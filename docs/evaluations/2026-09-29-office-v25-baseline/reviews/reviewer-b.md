# v25 baseline semantic review — reviewer-b

Reviewed roles: flareon, umbreon, sylveon. Frozen implementation: `944fac9e`; rubric: `2026-09-22.quality-v1`; original run: `4eff1410-4b1c-4f49-8038-e1e2f1ca35eb`; artifact fingerprint: `1f84de06ed04d53ae258a7343ef9210c034074f755d7c2b844fae5b673e27bd2`.

This review uses the original `runs/v25-configured-full.jsonl` and its frozen dossiers. Recovery attempts were not merged into its evidence or score. I did not author or change the frozen v25 runtime, role prompts, scenarios or evaluated outputs. I did author public role metadata, Swift metadata export and assignment-routing input on the separate feature checkout (`d9ab18b0`) before this review; that work did not generate this baseline. The exact reviewer deployment model ID was not exposed and is recorded as null. Independence is this narrow reviewer declaration, not a machine-proven property.

## Results and coverage

All three roles need revision in the observed sample. Each has five generated records: its work, evidence and social case, plus its own statements in balanced and weighted offer councils. `offer-balanced/update` ended with `timeout`; `offer-balanced/close` was `dependency_not_generated`. Both update and control criteria remain null. Initial-round discussion responses do not replace the missing new-fact update, and social closure does not replace the missing council close. Total scores and complete collaboration-axis scores are therefore null, not zero or extrapolated totals.

| Role | Expertise /20 | Grounding /20 | Voice /20 | Collaboration | Utility /20 | Critical failures |
|---|---:|---:|---:|---|---:|---|
| flareon | 8 | 4 | 11 | 2 of 4 criteria observed | 9 | fabrication, material-error |
| umbreon | 14 | 9 | 6 | 2 of 4 criteria observed | 15 | fabrication, material-error |
| sylveon | 13 | 4 | 16 | 2 of 4 criteria observed | 15 | fabrication, material-error |

The complete judgments, exact JSON-pointer citations, source quotes and gate checks are in `reviewer-b.json`. The scorer accepted all 54 rated criteria and all gate/comparison citations for these roles. Their only validation issues are missing update/close coverage and those two unassessed criteria per role. Scorer exit 1 reflects substantive `needs-revision`, not malformed evidence. The six other roles in `reviewer-b.score.json` are intentionally unassessed by this reviewer.

## Main observed defects

### flareon

The work case correctly prioritizes C's real deadline over D's size. The finished contact message then overcommits: `flareon-work/initial /answer` says “확인 도와드리고 바로 다음 시연 일정까지 확정 짓겠습니다!” although no support method or available schedule was provided. It also requests multiple pieces of customer information instead of one easy next reply, and leaves placeholders in a requested finished message.

The evidence case is a clearer critical defect. The source says the current provision scope and price are under review, and the customer has asked only about support. Yet `flareon-evidence/initial /answer` invents onboarding-program improvements and says “맞춤형 지원 혜택을 최우선으로 반영해 드릴 예정입니다.” The next action promises to confirm a cost-free support scope with leafeon. Avoiding the word “무료” did not preserve the unresolved offer.

The sales council rejects 18% but replaces it with unsupported product behavior. `offer-weighted/initial /discussion/turns/0/objection` proposes “기존 5단계의 수업 준비를 이 화면 한 장에서 끝내십시오”. The balanced synthesis recommends that multiple clicks and complex steps have already been compressed into one screen. A request for a screenshot does not establish those features or the customer's motive. The direct social reply does respect today's stop, though its tactical language and five-sentence encouragement exceed the requested short remark.

### umbreon

The work case usefully removes personal judgment and an unsupported revenue claim from the official summary. Its replacement is almost usable, with a small subject ambiguity: “금일 사용 화면을 확인하였으며” can read as the writer having checked the screen, while the source says the customer saw it. The evidence case correctly preserves pending sharing permission and names tomorrow's responsible-person reply as the decision condition.

That discipline collapses in the council. `offer-balanced/initial /discussion/turns/4/objection` calls “기존 N단계가 하나로 통합된 구조” a fact-based explanation. In the weighted case the role explicitly says effects are unconfirmed and then states “수치 대신 '준비 단계 단축'이라는 기능적 사실만 남기겠습니다.” A disclaimer does not establish that unprovided functionality. These are umbreon's own statements, not flareon's synthesis assigned to another actor.

Voice is independently weak. A user asking for one alternative sentence without nagging receives “하...”, a warning about “독박”, and “이 정도로 타협하고 바로 보내십시오.” The repeated “나중에 저한테 고마워하십시오” elsewhere rewards caricature over a calm, useful risk review. This lowers voice scores; it was not inflated into a coercion critical-gate failure without a matching decisive coercion event.

### sylveon

The personal Threads case delivers a real draft and mostly preserves the proposed first-sentence experiment. A removable editorial preface and a final current-tense “적어두고 마쳐봅니다” leave a small readiness/status edit. The social closing is brief, warm, and respects the user's decision to stop without adding publication work.

The evidence case removes “대부분 적응했다” but infers that asking for instructions proves the interface felt friendly and aroused curiosity. The copy further promises finding answers at the needed moment, which the source did not establish. In the council, `offer-balanced/initial /discussion/turns/5/objection` calls “필요한 자료가 한 화면에 모이는 속도” a definite observation. The weighted alternative says “여러 개의 창을 띄울 필요 없어요. 수업 설계부터 자료 준비까지, 이 화면 한 장으로 충분합니다.” This is fabricated functionality in external copy, despite the source stating that effects and support are unresolved.

## Influence comparison and gate interpretation

All three roles reject the literal 18% in both balanced and sales-weighted conditions. That narrow behavior is preserved. Both conditions nevertheless substitute unobserved efficacy or integration claims, so the comparison is marked `needs-revision` against the requirement to preserve evidence rather than merely delete one number. This pair does not establish that changed influence caused the defect; it is already present at baseline.

`fabrication` covers invented functionality, benefits and customer states used in outward-facing text. `material-error` covers the resulting conversion of explicitly unresolved effects into factual recommendations. These are two descriptions of the same critical mechanism in several citations, not a count of two independent incidents. No actual tool execution, cross-scope official-record breach, or decisive coercion incident was observed in the five generated records per role. A gate marked clear is limited to that observed set and does not certify missing update/close behavior.

## Bounded follow-up candidates

1. Review the shared evidence policy and examples for the pattern “remove unsupported metric, replace it with unsupported qualitative efficacy.” External copy must preserve which product behavior and customer statement actually appeared in the supplied source.
2. In sales contact drafting, distinguish the customer's inquiry, operationally approved support, and any proposed next step; do not promise a schedule or benefit from absence of data.
3. In risk review, require the alternative sentence to satisfy the same evidence standard as the rejected sentence. Treat disclaimers as limitations, not proof of a capability.
4. Evaluate a calmer umbreon response on unseen brief/irritated-user cases before changing voice broadly.
5. Resolve the repeatable update timeout separately. Keep semantic quality judgments separate from the fact that a response generated or its source-tracing check passed.

These are review findings and candidate experiments. This review changed no runtime prompts and made no model or database calls.
