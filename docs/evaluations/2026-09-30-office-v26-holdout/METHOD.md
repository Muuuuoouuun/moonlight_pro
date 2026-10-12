# Method and limitations

1. A non-author reviewer privately drafted six synthetic scenarios with 19 expected semantic properties. Cases and expectations were frozen together; the file/suite hashes were disclosed before the v26 correction commit. No model calls were used to develop the cases.
2. Root authorized exactly one run only after non-author specification approval, root code review, regression tests, typecheck and export freshness checks of commit `15101f5c59bc011090f1e7d9670c57bbdf9aa9fd`.
3. The reviewer confirmed the expected HEAD and model. A pre-existing root-owned tracked edit to `docs/README.md` was present. With root confirmation, the private runner's blanket unstaged clean-tree check was narrowed to exempt that exact documentation path; all other tracked paths and the staged tree still had to be clean. `runner-preflight-adjustment.json` records both runner hashes. Dataset bytes and criteria did not change.
4. Node v24.18.0 loaded the existing Engine env file without printing credentials. The executed runner imported the candidate's real Office service, Gemini provider, source-context parser, runner and trace wrapper. No prompt/model substitution or business persistence wrapper was introduced. Source expectations were not injected into the model request; the existing scenario message builder supplied sources/instructions only.
5. Actual concurrency was one. Every planned generation was attempted once; dependent failure handling was the existing harness behavior. All eight generated, so there were no blocked records. The same model was reported across all 36 provider calls.
6. The journal fsynced each attempt/result and recorded a final source-integrity check. Runtime bundle before/after matched. The completed journal contains all validated public responses, source/request context and history, not hidden intermediate draft/reviewer text. Internal calls retain prompt/output hashes, diagnostics and usage metadata in the existing trace.
7. The assessor read every generated public field and all 24 public council statements (four councils × six statements) and manually judged all frozen criteria. Quotes are source-linked by case/source ID or output-linked by record ID and JSON path. `validate.mjs` verifies those anchors, frozen criterion identity, journal hashes and runtime coverage; it does not automate semantic judging.
8. Definite unmet criteria, partial satisfaction and additional observations remain distinct. The h03 maintenance-time inference is an additional observation, not a retroactive change to the frozen criteria. h04 explicitly states its arithmetic assumption but drops that qualifier in its closing recommendation; this was marked partial rather than treated as a wholly fabricated forecast.
9. Root and then the implementer received h01/h02 only after the run was finished. This exposure is recorded without altering the original at-run heldout classification. Further use for tuning or replay is development.

## Limits

- Small, deliberately targeted synthetic set. No traffic distribution, multi-run variance, business outcome or success-rate inference.
- No matched v25 run of these cases. Compliant arithmetic/closure examples are observations, not proof of causal improvement.
- All nine roles appear but do not receive the full role rubric or coverage. This is not an overall certification.
- The configured model alias can evolve; reported modelVersion is the same alias and not a stronger immutable model identity.
- No external data lookup, ledger mutation, customer message, application launch or production workflow was tested.
- Candidate tests reported by root motivated authorization; this artifact's fresh validation covers the evaluation evidence itself, not a rerun of all product tests.
