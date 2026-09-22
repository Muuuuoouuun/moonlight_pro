import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { parseEnv } from 'node:util';

const root = '/Users/clmagi/Desktop/Projects/moonlight_proj';
const prefix = '/tmp/moonlight-office-output-ablation';
const previousPrefix = '/tmp/moonlight-office-minimal-ablation';
const ids = ['jolteon-evidence', 'umbreon-social', 'glaceon-social'];
const priorMeta = JSON.parse(readFileSync(`${previousPrefix}.meta.json`, 'utf8'));
const priorPrompts = readFileSync(`${previousPrefix}.prompts.jsonl`, 'utf8').trim().split('\n').map(JSON.parse);
const baseline = JSON.parse(readFileSync(`${previousPrefix}.results.json`, 'utf8')).results.filter(row => row.variant === 'A' && ids.includes(row.scenarioId));
const generalPolicy = priorMeta.generalPolicy;
const settings = { model: 'gemini-3.5-flash', thinkingLevel: 'high', maxOutputTokens: 8192 };
const answerSchema = { type: 'object', additionalProperties: false, properties: { answer: { type: 'string' } }, required: ['answer'] };
const jobs = ids.flatMap(scenarioId => {
  const previous = priorPrompts.find(row => row.scenarioId === scenarioId && row.variant === 'A');
  assert.ok(previous && previous.systemInstruction === generalPolicy);
  return ['C', 'D'].map(variant => ({ id: `${scenarioId}/${variant}`, scenarioId, variant,
    prompt: previous.prompt, systemInstruction: `${generalPolicy}\n\n${variant === 'C' ? '최종 자연어 본문만 반환한다. JSON 포장은 하지 않는다.' : 'answer 문자열 하나만 가진 JSON 객체로 최종 본문을 반환한다.'}`,
  }));
});
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const gitBefore = { head: git('rev-parse', 'HEAD'), status: git('status', '--short') };
assert.equal(gitBefore.status, '', 'Main must be clean before this isolated experiment.');
const env = parseEnv(readFileSync(`${root}/apps/engine/.env.local`, 'utf8'));
const key = env.GEMINI_API_KEY?.trim() || env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
assert.ok(key, 'The authorized Engine environment has no Gemini key.');
const serialize = value => JSON.stringify(value).replaceAll(key, '[redacted]');
const hash = value => createHash('sha256').update(value).digest('hex');
const startedAt = new Date().toISOString();
for (const suffix of ['prompts.jsonl', 'responses.jsonl']) writeFileSync(`${prefix}.${suffix}`, '', { flag: 'wx', mode: 0o600 });
writeFileSync(`${prefix}.meta.json`, serialize({ kind: 'isolated-output-format-ablation', startedAt, settings, generalPolicy,
  schemaForC: null, schemaForD: answerSchema, scenarioIds: ids, maxProviderCalls: 6, maxConcurrent: 2, retries: 0,
  deadlineMs: 45000, systemField: 'system_instruction', gitBefore, scriptHash: hash(readFileSync(new URL(import.meta.url))),
  priorPromptFileHash: hash(readFileSync(`${previousPrefix}.prompts.jsonl`)), qualityClaim: 'not-scored',
}), { flag: 'wx', mode: 0o600 });
writeFileSync(`${prefix}.baseline-a.json`, serialize(baseline), { flag: 'wx', mode: 0o600 });
const append = (suffix, value) => appendFileSync(`${prefix}.${suffix}`, `${serialize(value)}\n`, { mode: 0o600 });
const results = new Array(jobs.length);
let cursor = 0, active = 0, observedMaxConcurrent = 0;
async function worker() {
  while (cursor < jobs.length) {
    const index = cursor++, job = jobs[index];
    const body = {
      contents: [{ role: 'user', parts: [{ text: job.prompt }] }],
      system_instruction: { parts: [{ text: job.systemInstruction }] },
      generationConfig: { maxOutputTokens: settings.maxOutputTokens, thinkingConfig: { thinkingLevel: settings.thinkingLevel },
        ...(job.variant === 'D' ? { responseMimeType: 'application/json', responseJsonSchema: answerSchema } : {}),
      },
    };
    append('prompts.jsonl', { ...job, settings, requestBody: body, startedAt: new Date().toISOString() });
    const started = performance.now();
    active++; observedMaxConcurrent = Math.max(observedMaxConcurrent, active);
    let httpStatus = null, rawBody = '', data = null, failure = null, answer = null, formatError = null;
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${settings.model}:generateContent`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify(body), cache: 'no-store', signal: AbortSignal.timeout(45000),
      });
      httpStatus = response.status; rawBody = await response.text(); data = rawBody ? JSON.parse(rawBody) : null;
      if (!response.ok) throw new Error(`http-${response.status}: ${data?.error?.message || 'provider failure'}`);
      const text = (data?.candidates?.[0]?.content?.parts || []).filter(part => typeof part.text === 'string').map(part => part.text).join('\n').trim();
      answer = text;
      if (job.variant === 'D') {
        try {
          const parsed = JSON.parse(text);
          assert.ok(parsed && typeof parsed === 'object' && !Array.isArray(parsed) && Object.keys(parsed).length === 1 && typeof parsed.answer === 'string');
          answer = parsed.answer;
        } catch { formatError = 'response did not match answer-only JSON'; }
      }
    } catch (error) { failure = error instanceof Error ? error.message : String(error); }
    finally { active--; }
    const result = { id: job.id, scenarioId: job.scenarioId, variant: job.variant, elapsedMs: Math.round(performance.now() - started),
      httpStatus, modelVersion: data?.modelVersion ?? null, finishReason: data?.candidates?.[0]?.finishReason ?? null,
      usageMetadata: data?.usageMetadata ?? null, answer, formatError, failure, rawResponse: data, rawBody: data ? undefined : rawBody,
    };
    results[index] = result; append('responses.jsonl', result);
    console.log(serialize({ id: result.id, elapsedMs: result.elapsedMs, httpStatus, modelVersion: result.modelVersion, finishReason: result.finishReason, answer, formatError, failure }));
  }
}
await Promise.all([worker(), worker()]);
const gitAfter = { head: git('rev-parse', 'HEAD'), status: git('status', '--short') };
writeFileSync(`${prefix}.results.json`, serialize({ startedAt, finishedAt: new Date().toISOString(), settings, providerCalls: results.length,
  observedMaxConcurrent, retries: 0, gitBefore, gitAfter, qualityClaim: 'not-scored', results,
}), { flag: 'wx', mode: 0o600 });
console.log(JSON.stringify({ finished: true, providerCalls: results.length, observedMaxConcurrent, gitAfter, resultsPath: `${prefix}.results.json` }));
