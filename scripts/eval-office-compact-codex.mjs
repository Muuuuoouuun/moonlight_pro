import { pathToFileURL } from 'node:url';
import {
  OFFICE_CODEX_EVALUATION_EXECUTION,
  describeOfficeCodexEvaluationError,
  parseOfficeCodexEvaluationArgs,
  runOfficeCodexEvaluation,
} from './eval-office-codex-async.mjs';

// Evaluation only. Production continues to use its existing provider and policy.
export const OFFICE_COMPACT_CODEX_EXECUTION = Object.freeze({
  ...OFFICE_CODEX_EVALUATION_EXECUTION,
  jobBudgetMs: 48_000,
  authoring: 'compact-v1',
});

export function runOfficeCompactCodexEvaluation(values) {
  return runOfficeCodexEvaluation(values, {
    execution: OFFICE_COMPACT_CODEX_EXECUTION,
    command: 'codex',
    argv: [],
    extraSourcePaths: ['scripts/eval-office-compact-codex.mjs'],
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  Promise.resolve().then(() => runOfficeCompactCodexEvaluation(parseOfficeCodexEvaluationArgs()))
    .catch(error => { console.error(describeOfficeCodexEvaluationError(error)); process.exitCode = 1; });
}
