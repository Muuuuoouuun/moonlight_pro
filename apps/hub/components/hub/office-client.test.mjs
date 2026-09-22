import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  requestOfficeChat,
  OFFICE_AGENTS,
  OFFICE_AGENT_IDS,
  OFFICE_MODES,
  OFFICE_DEFAULT_COUNCILS,
  OFFICE_MODE_LABEL,
  OFFICE_GATES,
  OFFICE_HARSH_RUBRICS,
} from './office-client.js';

test('office-client exports 9 personas, modes, and default council agendas', () => {
  assert.equal(OFFICE_AGENT_IDS.length, 9);
  assert.equal(OFFICE_MODES.length, 4);
  assert.ok(OFFICE_DEFAULT_COUNCILS.length >= 6);
  assert.deepEqual(OFFICE_GATES, ['PASS', 'REVISE', 'REJECT']);
  assert.ok(OFFICE_HARSH_RUBRICS.umbreon);

  assert.equal(OFFICE_AGENTS.eevee.nameKo, '이브이');
  assert.equal(OFFICE_AGENTS.vaporeon.nameKo, '샤미드');
  assert.equal(OFFICE_AGENTS.jolteon.nameKo, '쥬피썬더');
  assert.equal(OFFICE_AGENTS.flareon.nameKo, '부스터');
  assert.equal(OFFICE_AGENTS.espeon.nameKo, '에브이');
  assert.equal(OFFICE_AGENTS.umbreon.nameKo, '블래키');
  assert.equal(OFFICE_AGENTS.leafeon.nameKo, '리피아');
  assert.equal(OFFICE_AGENTS.glaceon.nameKo, '글레이시아');
  assert.equal(OFFICE_AGENTS.sylveon.nameKo, '님피아');

  assert.equal(OFFICE_MODE_LABEL.chat, '1:1 전담 대화');
  assert.equal(OFFICE_MODE_LABEL.council, 'Council 종합 협업');
});

test('requestOfficeChat parses generated response and evaluation', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        status: 'generated',
        text: '정리했어. 우선순위대로 진행하자.',
        agentId: 'eevee',
        mode: 'chat',
        runId: 'test-run-id',
        evaluation: {
          score: 90,
          gate: 'PASS',
          summary: '목적 명확',
        },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );

  const res = await requestOfficeChat({
    agentId: 'eevee',
    message: '업무 정리해줘',
    evaluate: true,
  });

  assert.equal(res.state, 'done');
  assert.equal(res.text, '정리했어. 우선순위대로 진행하자.');
  assert.equal(res.agentId, 'eevee');
  assert.equal(res.runId, 'test-run-id');
  assert.deepEqual(res.evaluation, {
    score: 90,
    gate: 'PASS',
    summary: '목적 명확',
  });
});

test('requestOfficeChat handles preview state and error state honestly', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  // Preview state
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        status: 'preview',
        error: 'COM_MOON_ENGINE_URL is not configured.',
      }),
      { status: 202, headers: { 'content-type': 'application/json' } }
    );

  const previewRes = await requestOfficeChat({
    agentId: 'vaporeon',
    message: '일정 확인',
  });
  assert.equal(previewRes.state, 'preview');
  assert.ok(previewRes.note.includes('COM_MOON_ENGINE_URL'));

  // Error state
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        status: 'error',
        error: 'unknown-agent',
      }),
      { status: 400, headers: { 'content-type': 'application/json' } }
    );

  const errorRes = await requestOfficeChat({
    agentId: 'unknown',
    message: '안녕',
  });
  assert.equal(errorRes.state, 'error');
  assert.equal(errorRes.note, 'unknown-agent');
});
