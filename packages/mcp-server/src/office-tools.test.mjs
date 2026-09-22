import assert from 'node:assert/strict';
import { test } from 'node:test';

import { registerOfficeTools } from './office-tools.js';

function registeredTools() {
  const tools = new Map();
  registerOfficeTools({
    registerTool(name, definition, handler) {
      tools.set(name, { definition, handler });
    },
  });
  return tools;
}

test('office MCP tools register request_office_agent, request_office_council, and evaluate_office_proposal', () => {
  const tools = registeredTools();
  assert.ok(tools.has('request_office_agent'));
  assert.ok(tools.has('request_office_council'));
  assert.ok(tools.has('evaluate_office_proposal'));
});

test('office MCP tools enforce COM_MOON_HUB_WRITE_SECRET', async () => {
  const tools = registeredTools();
  const prevSecret = process.env.COM_MOON_HUB_WRITE_SECRET;
  delete process.env.COM_MOON_HUB_WRITE_SECRET;

  try {
    const res = await tools.get('request_office_agent').handler({
      agentId: 'eevee',
      message: '일정 정리',
    });
    assert.equal(res.isError, true);
    assert.ok(res.content[0].text.includes('COM_MOON_HUB_WRITE_SECRET'));
  } finally {
    if (prevSecret) process.env.COM_MOON_HUB_WRITE_SECRET = prevSecret;
  }
});

test('request_office_agent forwards call to Hub office chat route', async (t) => {
  const tools = registeredTools();
  const prevSecret = process.env.COM_MOON_HUB_WRITE_SECRET;
  const originalFetch = globalThis.fetch;
  process.env.COM_MOON_HUB_WRITE_SECRET = 'test-secret';

  t.after(() => {
    if (prevSecret) process.env.COM_MOON_HUB_WRITE_SECRET = prevSecret;
    else delete process.env.COM_MOON_HUB_WRITE_SECRET;
    globalThis.fetch = originalFetch;
  });

  let requestedUrl = null;
  let requestedBody = null;

  globalThis.fetch = async (url, init) => {
    requestedUrl = String(url);
    requestedBody = JSON.parse(init.body);
    return new Response(
      JSON.stringify({
        status: 'generated',
        text: '정리했어.',
        agentId: 'eevee',
        mode: 'chat',
        evaluation: { score: 95, gate: 'PASS' },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  };

  const res = await tools.get('request_office_agent').handler({
    agentId: 'eevee',
    mode: 'chat',
    message: '업무 정리해줘',
    evaluate: true,
  });

  assert.equal(res.isError, undefined);
  assert.ok(requestedUrl.includes('/api/hub/office/chat'));
  assert.equal(requestedBody.agentId, 'eevee');
  assert.equal(requestedBody.evaluate, true);
  assert.ok(res.content[0].text.includes('정리했어'));
});

test('request_office_council convenes lead and reviewers with evaluation', async (t) => {
  const tools = registeredTools();
  const prevSecret = process.env.COM_MOON_HUB_WRITE_SECRET;
  const originalFetch = globalThis.fetch;
  process.env.COM_MOON_HUB_WRITE_SECRET = 'test-secret';

  t.after(() => {
    if (prevSecret) process.env.COM_MOON_HUB_WRITE_SECRET = prevSecret;
    else delete process.env.COM_MOON_HUB_WRITE_SECRET;
    globalThis.fetch = originalFetch;
  });

  let requestedBody = null;

  globalThis.fetch = async (url, init) => {
    requestedBody = JSON.parse(init.body);
    return new Response(
      JSON.stringify({
        status: 'generated',
        text: '종합 권고문',
        agentId: 'glaceon',
        mode: 'council',
        evaluation: { score: 85, gate: 'PASS' },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  };

  const res = await tools.get('request_office_council').handler({
    lead: 'glaceon',
    participants: ['jolteon', 'vaporeon'],
    agenda: '신규 스펙 검토',
    evaluate: true,
  });

  assert.equal(res.isError, undefined);
  assert.equal(requestedBody.agentId, 'glaceon');
  assert.equal(requestedBody.mode, 'council');
  assert.deepEqual(requestedBody.participants, ['jolteon', 'vaporeon']);
  assert.equal(requestedBody.evaluate, true);
});

test('evaluate_office_proposal routes to harsh evaluation mode', async (t) => {
  const tools = registeredTools();
  const prevSecret = process.env.COM_MOON_HUB_WRITE_SECRET;
  const originalFetch = globalThis.fetch;
  process.env.COM_MOON_HUB_WRITE_SECRET = 'test-secret';

  t.after(() => {
    if (prevSecret) process.env.COM_MOON_HUB_WRITE_SECRET = prevSecret;
    else delete process.env.COM_MOON_HUB_WRITE_SECRET;
    globalThis.fetch = originalFetch;
  });

  let requestedBody = null;

  globalThis.fetch = async (url, init) => {
    requestedBody = JSON.parse(init.body);
    return new Response(
      JSON.stringify({
        status: 'generated',
        text: '[SCORE]: 70/100\n[GATE]: REVISE\nDoD 보완 필요',
        agentId: 'glaceon',
        mode: 'critique',
        evaluation: { score: 70, gate: 'REVISE' },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  };

  const res = await tools.get('evaluate_office_proposal').handler({
    proposal: '신규 자동화 시스템 초안',
    focus: 'scope',
  });

  assert.equal(res.isError, undefined);
  assert.equal(requestedBody.agentId, 'glaceon');
  assert.equal(requestedBody.mode, 'critique');
  assert.equal(requestedBody.evaluate, true);
});
