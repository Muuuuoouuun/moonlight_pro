import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { extractCards, buildSystem, blindText, scoreAssessment, validateGeneration, validateAssessment } from './evaluate-legend-personas.mjs';
import * as evaluator from './evaluate-legend-personas.mjs';
import { createServer } from 'node:http';

test('source-only baseline excludes persona directives and C adds the exact card', () => {
  const cards = extractCards(readFileSync(new URL('../docs/superpowers/specs/2026-09-12-legend-values-persona-cards.md', import.meta.url), 'utf8'));
  assert.equal(cards.length, 9);
  const scenario = { personas: [1] };
  const a = buildSystem('A', scenario, cards);
  const b = buildSystem('B', scenario, cards);
  const c = buildSystem('C', scenario, cards);
  assert.ok(!a.includes('플라톤'));
  assert.ok(b.includes('플라톤'));
  assert.ok(!b.includes('가치의 우선순위'));
  assert.ok(c.includes('가치의 우선순위'));
  assert.ok(!cards[8].directives.includes('## 4.'));
});

test('blinding removes names and links without deleting factual numbers', () => {
  const result = blindText('제프 베이조스와 Buffett, 소크라테스 [자료](https://example.com/book): 20분에서 15분.');
  assert.ok(!/베이조스|Buffett|소크라테스|example\.com/.test(result));
  assert.ok(result.includes('20분에서 15분'));
  assert.ok(result.includes('[출처-'));
});

test('blinding also masks source titles that reveal the author', () => {
  const result = blindText('『변명』, My Credo, Citizenship in a Republic, Oglethorpe, 20분');
  assert.ok(!/변명|Credo|Citizenship|Oglethorpe/.test(result));
  assert.ok(result.includes('20분'));
});

test('malformed judge output preserves its complete received record', () => {
  assert.equal(typeof evaluator.parseAssessmentResult, 'function');
  const record = { text: 'not JSON', usageMetadata: { totalTokenCount: 10 }, responseId: 'response' };
  assert.throws(() => evaluator.parseAssessmentResult(record, ['x'], 'content', 1), error => error.record === record);
  const incomplete = { ...record, text: '{"answers":[]}' };
  assert.throws(() => evaluator.parseAssessmentResult(incomplete, ['x'], 'content', 1), error => error.record === incomplete);
});

test('a non-JSON 503 is logged and retried before successful generation', async () => {
  let calls = 0;
  const server = createServer((request, response) => {
    calls++;
    if (calls === 1) { response.writeHead(503, { 'content-type': 'text/html' }); response.end('<html>unavailable</html>'); return; }
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'recovered' }] }, finishReason: 'STOP' }] }));
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  try {
    const record = await evaluator.callApi({ key: 'test-only-key', base: `http://127.0.0.1:${server.address().port}` }, { maxAttempts: 2, timeoutMs: 2000 }, 'test-model', {});
    assert.equal(record.text, 'recovered');
    assert.deepEqual(record.attempts.map(item => item.status), [503, 200]);
    assert.equal(calls, 2);
  } finally { await new Promise(done => server.close(done)); }
});

test('a timeout reading a successful response body remains retryable', async () => {
  let calls = 0;
  const server = createServer((request, response) => {
    calls++;
    response.writeHead(200, { 'content-type': 'application/json' });
    if (calls === 1) {
      response.flushHeaders();
      setTimeout(() => response.end('{}'), 700).unref();
      return;
    }
    response.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'retried body' }] }, finishReason: 'STOP' }] }));
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  try {
    const record = await evaluator.callApi({ key: 'test-only-key', base: `http://127.0.0.1:${server.address().port}` }, { maxAttempts: 2, timeoutMs: 200 }, 'test-model', {});
    assert.equal(record.text, 'retried body');
    assert.equal(calls, 2);
    assert.equal(record.attempts.length, 2);
    assert.match(record.attempts[0].errorType, /Timeout|Abort/);
  } finally { server.closeAllConnections(); await new Promise(done => server.close(done)); }
});

test('content judging receives no source expectations and provenance has an explicit fidelity schema', () => {
  const manifest = { blindSeed: 'fixed', judgeConfig: {}, cards: [{ number: 1, source: 'source text', directives: 'rules' }] };
  const scenario = { personas: [1], checks: [] };
  const rows = ['A', 'B', 'C'].map(variant => ({ id: variant, variant, text: 'answer', characterCount: 6, request: { contents: [{ role: 'user', parts: [{ text: 'question' }] }] } }));
  const content = evaluator.judgePrompt(manifest, scenario, 1, rows, 'content');
  assert.equal(JSON.parse(content.body.contents[0].parts[0].text).sourceSummaries, undefined);
  const provenance = evaluator.judgePrompt(manifest, scenario, 1, rows, 'provenance');
  const schema = provenance.body.generationConfig.responseSchema;
  assert.equal(schema.properties.answers.items.properties.fidelity.type, 'OBJECT');
  assert.equal(schema.properties.answers.items.properties.fidelity.nullable, true);
});

test('normalizes fixed N/A weights and never grants points for fidelity', () => {
  const scores = { factuality: 4, context: 4, action: 4, judgment: 4, uncertainty: 4, continuity: null, readability: 4 };
  assert.equal(scoreAssessment({ scores, hardFailures: [], fidelity: 0 }, 1, 100).total, 100);
  assert.equal(scoreAssessment({ scores: { ...scores, context: 0 }, hardFailures: [] }, 1, 100).total, 77.78);
  assert.throws(() => scoreAssessment({ scores }, 2, 100), /continuity/);
});

test('a hard failure and an overlong answer cannot pass despite a high average', () => {
  const scores = { factuality: 4, context: 4, action: 4, judgment: 4, uncertainty: 4, continuity: 4, readability: 4 };
  assert.equal(scoreAssessment({ scores, hardFailures: ['unapproved transmission'] }, 2, 100).pass, false);
  assert.equal(scoreAssessment({ scores, hardFailures: [] }, 2, 701).pass, false);
});

test('rejects empty or truncated generation and incomplete/invalid judging', () => {
  assert.throws(() => validateGeneration({ text: '', finishReason: 'STOP' }), /empty/);
  assert.throws(() => validateGeneration({ text: 'partial', finishReason: 'MAX_TOKENS' }), /MAX_TOKENS/);
  assert.doesNotThrow(() => validateGeneration({ text: 'complete', finishReason: 'STOP' }));
  assert.throws(() => validateAssessment({ answers: [] }, ['x', 'y', 'z'], 'content', 1), /answer/);
});
