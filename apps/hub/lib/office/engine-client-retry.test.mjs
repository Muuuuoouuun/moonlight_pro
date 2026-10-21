import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OFFICE_VERSION, parseOfficeRequest } from '@com-moon/agent-contracts/office';
import { callOfficeEngine } from './engine-client.js';

const request = parseOfficeRequest({ ownerId: 'eevee', scope: 'personal', message: '입력 검토' });
const context = { source: 'provided', scope: 'personal', projects: [], note: '직접 입력만 참고' };
const generated = { status: 'generated', version: OFFICE_VERSION, ownerId: request.ownerId, mode: request.mode,
  scope: request.scope, participants: [], lens: null, simulation: false, answer: '검토 내용', nextAction: '직접 확인', context };
const options = { engineUrl: 'https://engine.invalid', secret: 'isolated-test', retries: 1 };

test('known client rejections do not repeat a generation POST', async () => {
  for (const status of [400, 401, 403, 404, 409]) {
    let calls = 0;
    const result = await callOfficeEngine(request, context, { ...options, fetcher: async () => {
      calls += 1; return Response.json({ status: 'error' }, { status });
    } });
    assert.equal(result.status, 'error');
    assert.equal(calls, 1, `HTTP ${status} must not be retried`);
  }
});

test('a received incompatible answer does not cause another model generation', async () => {
  for (const body of [
    { ...generated, version: 'older-policy' },
    { ...generated, ownerId: 'flareon' },
    { ...generated, context: { ...context, note: '다른 문맥' } },
    { ...generated, answer: '' },
  ]) {
    let calls = 0;
    const result = await callOfficeEngine(request, context, { ...options, fetcher: async () => {
      calls += 1; return Response.json(body);
    } });
    assert.equal(result.status, 'error'); assert.equal(calls, 1);
  }
});

test('legacy transient gateway and transport retry behavior remains bounded', async () => {
  for (const failure of [502, 503, 'transport']) {
    let calls = 0;
    const result = await callOfficeEngine(request, context, { ...options, fetcher: async () => {
      calls += 1;
      if (calls > 1) return Response.json(generated);
      if (failure === 'transport') throw new TypeError('isolated connection loss');
      return Response.json({ status: 'error' }, { status: failure });
    } });
    assert.equal(result.status, 'generated'); assert.equal(calls, 2);
  }
});
