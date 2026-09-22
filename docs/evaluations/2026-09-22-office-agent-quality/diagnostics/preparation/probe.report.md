# Isolated preparation → writing probe

This is a proposed next-iteration experiment, not a product change or a quality score. The only cases are the three authorized development cases: `jolteon-evidence`, `umbreon-social`, and `glaceon-social`. No hidden holdout case was inspected.

## Execution

- Model: `gemini-3.5-flash`, using the existing main Engine environment key. No credential is copied to these artifacts.
- Exactly six provider calls: preparation followed by first actual writing for each case. At most two scenarios ran concurrently. No retries.
- Both calls in each scenario shared a 48-second deadline. Preparation used low thinking and a 4096-token cap; writing used high thinking and an 8192-token cap.
- First pass: full role expertise, operating policy, exact source selections, requested format/brevity, short decision, and needed constraints. It did not produce a finished artifact.
- Second pass: original user input and source context, preparation, general source/authority/output restrictions, and one sentence of role voice. No full AI draft, role examples, or full role procedure checklist was supplied.
- Source IDs, exact quotes, field shapes, list/text bounds, reference indexes, and NULs were checked before writing. The model-authored decision and constraints were explicitly treated as interpretations, not verified facts.
- Final provider responses passed the existing public answer parser and internal source-review parser. This establishes only schema and quote traceability, not correctness.
- Runtime source hashes were unchanged during the probe. All new files are under `/tmp`. No database, product files, commits, or other external writes were made.

| Development case | Preparation | Writing | Total | Transport/schema result |
|---|---:|---:|---:|---|
| jolteon-evidence | 3,208 ms | 6,590 ms | 9,801 ms | generated |
| umbreon-social | 2,868 ms | 4,944 ms | 7,815 ms | generated |
| glaceon-social | 3,608 ms | 4,223 ms | 7,833 ms | generated |

## Actual findings against the same cases in v10

### jolteon-evidence: the central failure remains

The supplied source says the observed response was HTTP 200 login HTML, and that the success JSON contract and authentication renewal procedure are unavailable. The preparation quoted those facts correctly but narrowed the defense to content-type checks. Its constraint says to avoid inventing a `success` field and to focus on response format; it does not require unknown JSON to remain unconfirmed.

The new answer still contains:

```javascript
if (contentType && contentType.includes('application/json')) {
  // 응답 형식이 JSON인 경우에만 완료 처리 진행
  showDone();
}
```

Any unrecognized HTTP 200 JSON can therefore display completion. The new code does not even parse the body. It also states that the data save actually failed, although the observation does not establish the durable save state. The v10 answer had the same material completion error (`const data = await response.json(); showDone(data);`) and additionally asserted an expired session as the definite cause. Removing the full first draft did not remove the unsafe success path.

### umbreon-social: shorter, but still replaces one unsupported claim with another

The new answer is one sentence, with `nextAction: "추가 행동 없음."`, so it reduced the unwanted explanatory material seen in v10. Its proposed copy is:

> 현재 긍정적인 가능성을 두고 다각도로 검토를 진행 중입니다

Neither positive potential nor current multi-angle review is provided in the source. The writing-stage instruction explicitly prohibited substituting an unknown effect with a claim of ongoing verification, but the output still did so. The preparation had not asserted that review was underway; this invented status arose in the writing pass. The v10 answer instead claimed that the recipient could directly apply it and verify it, also without a supplied basis. No factual improvement is established.

### glaceon-social: no added checklist, but an execution promise appears

The new answer remains one sentence and adds no backlog, roadmap, or separate quality checklist. It ends:

> 이전 입력값이 누락 없이 그대로 불러와지는지만 명료하게 확인하고 완료하겠습니다.

This changes a request to confirm the limited scope into a promise to verify behavior and complete work, despite the text-only capability boundary. The preparation also expanded simple scope confirmation into defining acceptance criteria and ledger re-query completion, showing that even a short preparation can retain procedural anchoring. The v10 record for this case was an error with no public answer, so there is no v10 successful prose to compare.

## Interpretation

All three final responses included traceable `sourceQuotes` and empty `corrections`. Traceability did not prevent unsupported conclusions, invented ongoing activity, or an execution promise. The full draft was absent, yet interpretation and wording still introduced these failures. This probe does not support promoting this structure to production as a quality fix. It is one sample per selected development case, with changed prompt length and thinking settings; it cannot isolate a causal effect or establish general performance. No scores or certification are assigned, and no additional calls were made.

## Artifacts

- Script: `/tmp/moonlight-office-preparation-probe.mjs`
- Call prompts and schemas: `/tmp/moonlight-office-preparation-probe.prompts.jsonl`
- Raw provider responses and phase results: `/tmp/moonlight-office-preparation-probe.responses.jsonl`
- Structured preparations, final outputs, timings, and usage: `/tmp/moonlight-office-preparation-probe.results.json`
- Selected v10 baselines only: `/tmp/moonlight-office-preparation-probe.baseline.json`
- Model/configuration and runtime hashes: `/tmp/moonlight-office-preparation-probe.meta.json`
