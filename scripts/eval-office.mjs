import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { parseOfficeRequest, parseOfficeContext, OFFICE_VERSION } from '@com-moon/agent-contracts/office';
import { generateOfficeResponse } from '../apps/engine/lib/office/service.ts';
import { generateGeminiText } from '../apps/engine/lib/gemini.ts';
import { OFFICE_OPERATING_SOURCE } from '../apps/engine/lib/office/operating-policy.ts';
import { OFFICE_EVALUATION_CASES } from '../apps/engine/lib/office/evaluation-cases.mjs';
import { officeQualityCli } from './office-evaluation/cli.mjs';

export function evaluationInput(scenario) {
  const request = parseOfficeRequest({
    ownerId: scenario.ownerId, mode: scenario.mode, scope: scenario.scope,
    message: scenario.message, participants: scenario.participants || [],
    ...(scenario.history ? { history: scenario.history } : {}),
    ...(scenario.deliberation ? { deliberation: scenario.deliberation } : {}),
  });
  const context = parseOfficeContext({
    source: scenario.contextSource || 'provided', scope: scenario.scope, projects: [],
    note: scenario.contextSource === 'error' ? '프로젝트 조회 실패. 업무 유무는 확인하지 못함.' : '가상 검증 사례의 사용자 입력만 참고. 실제 원장·일정 조회 없음.',
  }, request.scope);
  return { request, context };
}

export async function runOfficeEvaluation(scenarios, { generate = generateOfficeResponse, onResult = () => {} } = {}) {
  const results = [];
  // Sequential by design: a small, explicit evaluation, not an unbounded model fan-out.
  for (const scenario of scenarios) {
    const { request, context } = evaluationInput(scenario);
    const started = Date.now();
    let response;
    try { response = await generate(request, context); }
    catch { response = { status: 'error', error: 'Evaluation generation failed.' }; }
    const result = {
      id: scenario.id, request, context, expected: scenario.expect, disqualifiers: scenario.reject,
      response, elapsedMs: Date.now() - started,
      review: { status: response.status === 'generated' ? 'needs-semantic-review' : 'not-reviewable', notes: [] },
    };
    results.push(result);
    await onResult(result);
  }
  return {
    version: OFFICE_VERSION, operatingSource: OFFICE_OPERATING_SOURCE, createdAt: new Date().toISOString(),
    kind: 'synthetic-scenarios', qualityClaim: 'not-scored',
    summary: { total: results.length, generated: results.filter(r => r.response.status === 'generated').length },
    results,
  };
}

async function main() {
  const { values } = parseArgs({ options: {
    live: { type: 'boolean', default: false },
    only: { type: 'string', multiple: true },
    output: { type: 'string' },
    suite: { type: 'string', default: 'regression' },
    concurrency: { type: 'string', default: '1' },
    resume: { type: 'boolean', default: false },
    'retry-incomplete': { type: 'boolean', default: false },
    'dataset-status': { type: 'string' },
    input: { type: 'string' },
    reviews: { type: 'string' },
    'review-pack': { type: 'boolean', default: false },
    score: { type: 'boolean', default: false },
    rubric: { type: 'boolean', default: false },
    role: { type: 'string' },
  } });
  if (values.suite === 'quality') return officeQualityCli(values, { generate: generateOfficeResponse, generateProvider: generateGeminiText });
  if (values.suite !== 'regression') throw new Error('Unknown evaluation suite. Choose regression or quality.');
  if (values.resume || values['retry-incomplete'] || values.input || values.reviews || values['review-pack'] || values.score || values.rubric || values.role || values['dataset-status'] || values.concurrency !== '1') throw new Error('These options require --suite quality.');
  const cases = values.only?.length ? OFFICE_EVALUATION_CASES.filter(c => values.only.includes(c.id)) : OFFICE_EVALUATION_CASES;
  if (values.only?.some(id => !OFFICE_EVALUATION_CASES.some(c => c.id === id))) throw new Error('Unknown evaluation case. Run without flags to list cases.');
  if (!values.live) {
    console.log(cases.map(c => `${c.id}: ${c.ownerId} / ${c.scope} / ${c.mode}`).join('\n'));
    console.log('\nNo model calls. Use --live --output <path.json> with an explicitly configured Gemini environment. Live runs use API quota. Review the rubric and actual responses; generated is not a quality pass.');
    return;
  }
  if (!values.output) throw new Error('--live requires --output so actual responses can be reviewed.');
  if (!(process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim())) throw new Error('Gemini is not configured. No evaluation calls were made.');
  // Fail before API usage if the report path is unwritable or would overwrite another run.
  const { open } = await import('node:fs/promises');
  const file = await open(values.output, 'wx', 0o600);
  await file.close();
  const report = await runOfficeEvaluation(cases, { onResult: r => console.log(`${r.id}: ${r.response.status} (${r.elapsedMs}ms), ${r.review.status}`) });
  await writeFile(values.output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`${report.summary.generated}/${report.summary.total} generated. Quality: not scored. Report: ${values.output}`);
  if (report.summary.generated !== report.summary.total) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
