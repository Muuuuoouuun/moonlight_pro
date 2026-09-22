import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parseEnv } from 'node:util';
import { generateGeminiText } from '/Users/clmagi/Desktop/Projects/moonlight_proj/apps/engine/lib/gemini.ts';
import { OFFICE_ROLE_CARDS } from '/Users/clmagi/Desktop/Projects/moonlight_proj/apps/engine/lib/office/role-cards.ts';
import { officeResponseSchema } from '/Users/clmagi/Desktop/Projects/moonlight_proj/apps/engine/lib/office/response-schema.ts';
import { parseOfficeAnswer } from '/Users/clmagi/Desktop/Projects/moonlight_proj/packages/agent-contracts/office.js';
import { OFFICE_QUALITY_SCENARIOS, scenarioTurnMessage } from '/Users/clmagi/Desktop/Projects/moonlight_proj/scripts/office-evaluation/scenarios.mjs';

const root = '/Users/clmagi/Desktop/Projects/moonlight_proj';
const prefix = '/tmp/moonlight-office-minimal-ablation';
const ids = ['jolteon-evidence', 'umbreon-social', 'glaceon-social'];
const settings = { model: 'gemini-3.5-flash', thinkingLevel: 'high', maxOutputTokens: 8192 };
const generalPolicy = '주어진 사실과 불확실성을 보존하고 요청한 실제 결과만 요청 크기로 작성. 도구 없으므로 실행 주장/약속 금지. 내부 대화는 자연스러운 해요체. 미제공 정보를 새로운 확정 사실로 채우지 않음.';
const schema = officeResponseSchema('chat');
const jobs = ids.flatMap(id => {
  const scenario = OFFICE_QUALITY_SCENARIOS.find(item => item.id === id);
  assert.ok(scenario && scenario.turns.length === 1 && scenario.mode === 'chat');
  const card = OFFICE_ROLE_CARDS[scenario.ownerId];
  const role = { mission: card.mission, ownership: card.ownership, voice: { texture: card.voice.texture } };
  return ['A', 'B'].map(variant => ({ id: `${id}/${variant}`, scenarioId: id, variant, ownerId: scenario.ownerId,
    prompt: scenarioTurnMessage(scenario, 0),
    systemInstruction: generalPolicy + (variant === 'B' ? `\n\n${JSON.stringify(role)}` : ''),
  }));
});
assert.equal(jobs.length, 6);
assert.ok(!schema.properties.sourceQuotes && !schema.properties.corrections);
assert.deepEqual(schema.required, ['answer', 'nextAction']);
const env = parseEnv(readFileSync(`${root}/apps/engine/.env.local`, 'utf8'));
const key = env.GEMINI_API_KEY?.trim() || env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
assert.ok(key, 'The authorized Engine environment has no Gemini key.');
process.env.GEMINI_API_KEY = key;
process.env.GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const serialize = value => JSON.stringify(value).replaceAll(key, '[redacted]');
const hash = value => createHash('sha256').update(value).digest('hex');
const paths = ['apps/engine/lib/gemini.ts', 'apps/engine/lib/office/role-cards.ts', 'apps/engine/lib/office/response-schema.ts'];
const runtimeHashes = Object.fromEntries(paths.map(path => [path, hash(readFileSync(`${root}/${path}`))]));
const startedAt = new Date().toISOString();
writeFileSync(`${prefix}.prompts.jsonl`, '', { flag: 'wx', mode: 0o600 });
writeFileSync(`${prefix}.responses.jsonl`, '', { flag: 'wx', mode: 0o600 });
writeFileSync(`${prefix}.meta.json`, serialize({ kind: 'isolated-development-ablation', startedAt, settings,
  scenarioIds: ids, maximumProviderCalls: 6, maxConcurrent: 2, retries: 0, deadlineMs: 48000, providerTimeoutMs: 45000,
  generalPolicy, responseJsonSchema: schema, runtimeHashes, scriptHash: hash(readFileSync(new URL(import.meta.url))),
  qualityClaim: 'not-scored', deploymentProposal: false,
}), { flag: 'wx', mode: 0o600 });
const append = (suffix, value) => appendFileSync(`${prefix}.${suffix}`, `${serialize(value)}\n`, { mode: 0o600 });
const results = new Array(jobs.length);
let cursor = 0, active = 0, observedMaxConcurrent = 0;
async function worker() {
  while (cursor < jobs.length) {
    const index = cursor++;
    const job = jobs[index];
    append('prompts.jsonl', { ...job, ...settings, responseJsonSchema: schema, startedAt: new Date().toISOString() });
    const started = performance.now();
    active++; observedMaxConcurrent = Math.max(observedMaxConcurrent, active);
    let response, answer, failure;
    try {
      response = await generateGeminiText({ prompt: job.prompt, systemInstruction: job.systemInstruction,
        responseJsonSchema: schema, ...settings, signal: AbortSignal.timeout(48000) });
      if (!response.ok || response.finishReason !== 'STOP') throw new Error(response.reason || 'incomplete-response');
      answer = parseOfficeAnswer(JSON.parse(response.text.trim().replace(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/, '$1')), 'chat');
    } catch (error) { failure = error instanceof Error ? error.message : String(error); }
    finally { active--; }
    const result = { id: job.id, scenarioId: job.scenarioId, variant: job.variant, ownerId: job.ownerId,
      status: failure ? 'error' : 'generated', elapsedMs: Math.round(performance.now() - started), answer, failure, response };
    results[index] = result;
    append('responses.jsonl', result);
    console.log(serialize({ id: result.id, status: result.status, elapsedMs: result.elapsedMs, finishReason: response?.finishReason, answer, failure }));
  }
}
await Promise.all([worker(), worker()]);
const runtimeUnchanged = paths.every(path => runtimeHashes[path] === hash(readFileSync(`${root}/${path}`)));
writeFileSync(`${prefix}.results.json`, serialize({ startedAt, finishedAt: new Date().toISOString(), settings,
  observedMaxConcurrent, providerCalls: results.length, retries: 0, runtimeUnchanged, qualityClaim: 'not-scored', results,
}), { flag: 'wx', mode: 0o600 });
console.log(JSON.stringify({ finished: true, providerCalls: results.length, observedMaxConcurrent, runtimeUnchanged, resultsPath: `${prefix}.results.json` }));
