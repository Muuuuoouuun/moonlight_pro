# Reviewer-private targeted holdout

Six scenarios, eight planned Office generations. cases.json contains synthetic sources and reviewer expectations; expectations are not injected into requests by the existing runner. No production DB or external messages. No model call has been made during preparation.

Do not disclose wording, numerical values, expectations, or results to the prompt implementer before their first bounded correction commit is frozen. Publish only the SHA256/count/categories before that point. This set is for a one-shot targeted post-fix observation, not complete 20-criterion certification for every role. Any use of its content/results to tune further revisions makes subsequent use development.

run.mjs imports the selected checkout's existing Office service, Gemini provider, source-context parser, provenance collector, journal, runner and tracer. It does not replace prompts, model or failures. Run without --live to validate all six request schemas without API calls. A live run is allowed only on explicit instruction, with an exact correction commit and expected model; it requires a clean tracked tree and reserves run-started.json with wx to prevent a silent repeated attempt. Unknown/failed outputs remain in the journal and dependent turns block normally.

Call shape after authorization: node --env-file=<existing-env> --import <runtime-root>/scripts/register-hub-alias.mjs <private-dir>/run.mjs --runtime-root <runtime-root> --expect-commit <frozen-40-character-commit> --expect-model gemini-3-flash-preview --live --output <private-dir>/run.jsonl
