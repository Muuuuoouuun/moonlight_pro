import test from 'node:test';
import assert from 'node:assert/strict';

let route;
try {
  route = await import('../app/api/ai/office-chat/route.ts');
} catch (e) {
  // if not resolved, will fail in test
}

const SHARED_SECRET = 'test-shared-secret';

function mockRequest(body, headers = {}) {
  return new Request('https://engine.test/api/ai/office-chat', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-com-moon-shared-secret': SHARED_SECRET,
      ...headers,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

test('office-chat GET returns metadata for 9 agents', async () => {
  assert.ok(route, 'office-chat route must exist');
  const res = await route.GET();
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.service, 'com-moon-engine');
  assert.equal(data.endpoint, 'office-chat');
  assert.equal(data.agents.length, 9);
});

test('office-chat POST refuses unauthorized requests', async () => {
  assert.ok(route);
  const prevSecret = process.env.COM_MOON_SHARED_WEBHOOK_SECRET;
  process.env.COM_MOON_SHARED_WEBHOOK_SECRET = SHARED_SECRET;

  try {
    const res = await route.POST(
      mockRequest({ agentId: 'eevee', message: '안녕' }, { 'x-com-moon-shared-secret': 'wrong' })
    );
    assert.equal(res.status, 401);
  } finally {
    process.env.COM_MOON_SHARED_WEBHOOK_SECRET = prevSecret;
  }
});

test('office-chat POST rejects unknown agent or invalid JSON without falling back to order', async () => {
  assert.ok(route);
  const prevSecret = process.env.COM_MOON_SHARED_WEBHOOK_SECRET;
  process.env.COM_MOON_SHARED_WEBHOOK_SECRET = SHARED_SECRET;

  try {
    // Malformed JSON
    const res1 = await route.POST(mockRequest('{invalid-json'));
    assert.equal(res1.status, 400);

    // Unknown agent ID
    const res2 = await route.POST(mockRequest({ agentId: 'non-existent', message: '안녕' }));
    assert.equal(res2.status, 400);
    const data2 = await res2.json();
    assert.equal(data2.code, 'unknown-agent');

    // Unknown mode
    const res3 = await route.POST(mockRequest({ agentId: 'eevee', mode: 'super-mode', message: '안녕' }));
    assert.equal(res3.status, 400);
    const data3 = await res3.json();
    assert.equal(data3.code, 'unknown-mode');
  } finally {
    process.env.COM_MOON_SHARED_WEBHOOK_SECRET = prevSecret;
  }
});

test('office-chat POST executes Gemini chat for valid office persona', async () => {
  assert.ok(route);
  const prevSecret = process.env.COM_MOON_SHARED_WEBHOOK_SECRET;
  const prevApiKey = process.env.GEMINI_API_KEY;
  const originalFetch = globalThis.fetch;

  process.env.COM_MOON_SHARED_WEBHOOK_SECRET = SHARED_SECRET;
  process.env.GEMINI_API_KEY = 'test-gemini-key';

  try {
    globalThis.fetch = async (url, init) => {
      const urlStr = String(url);
      if (urlStr.includes('generateContent')) {
        return new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    { text: '좋아, 우선순위부터 정리할게. 지금 가장 급한 일 하나부터 보자.' },
                  ],
                },
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }
      return new Response('not found', { status: 404 });
    };

    const res = await route.POST(
      mockRequest({
        agentId: 'eevee',
        mode: 'chat',
        message: '오늘 업무가 너무 많은데 뭐부터 할까?',
      })
    );

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, 'generated');
    assert.equal(data.agentId, 'eevee');
    assert.equal(data.mode, 'chat');
    assert.ok(data.text.includes('좋아, 우선순위부터'));
  } finally {
    process.env.COM_MOON_SHARED_WEBHOOK_SECRET = prevSecret;
    process.env.GEMINI_API_KEY = prevApiKey;
    globalThis.fetch = originalFetch;
  }
});

test('office-chat POST executes council mode with simulation flag', async () => {
  assert.ok(route);
  const prevSecret = process.env.COM_MOON_SHARED_WEBHOOK_SECRET;
  const prevApiKey = process.env.GEMINI_API_KEY;
  const originalFetch = globalThis.fetch;

  process.env.COM_MOON_SHARED_WEBHOOK_SECRET = SHARED_SECRET;
  process.env.GEMINI_API_KEY = 'test-gemini-key';

  try {
    globalThis.fetch = async (url) => {
      if (String(url).includes('generateContent')) {
        return new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: `1. 👑 [주관 임원 글레이시아의 1차 판단]\n- 핵심 현주소: 초안 완성\n\n2. 💬 [참여 임원 교차 관점]\n- 쥬피썬더: 바로 연동 가능\n\n3. ⚖️ [Office Council 최종 종합 권고]\n- 추천 결정: 1단계 프로토타입 출시`,
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }
      return new Response('not found', { status: 404 });
    };

    const res = await route.POST(
      mockRequest({
        agentId: 'glaceon',
        mode: 'council',
        message: '신규 기능 릴리즈 검토',
        participants: ['jolteon', 'vaporeon'],
      })
    );

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, 'generated');
    assert.equal(data.agentId, 'glaceon');
    assert.equal(data.mode, 'council');
    assert.equal(data.isSimulation, true);
    assert.deepEqual(data.participants, ['jolteon', 'vaporeon']);
    assert.ok(data.text.includes('Office Council 최종 종합 권고'));
  } finally {
    process.env.COM_MOON_SHARED_WEBHOOK_SECRET = prevSecret;
    process.env.GEMINI_API_KEY = prevApiKey;
    globalThis.fetch = originalFetch;
  }
});

test('office-chat POST parses harsh evaluation score and gate', async () => {
  assert.ok(route);
  const prevSecret = process.env.COM_MOON_SHARED_WEBHOOK_SECRET;
  const prevApiKey = process.env.GEMINI_API_KEY;
  const originalFetch = globalThis.fetch;

  process.env.COM_MOON_SHARED_WEBHOOK_SECRET = SHARED_SECRET;
  process.env.GEMINI_API_KEY = 'test-gemini-key';

  try {
    globalThis.fetch = async (url) => {
      if (String(url).includes('generateContent')) {
        return new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: `[SCORE]: 75/100\n[GATE]: REVISE\n[EVAL_SUMMARY]: 완료 조건이 모호하고 범위가 과도합니다.\n[PENALTIES]:\n- (-15점) DoD 모호성\n- (-10점) Scope Creep\n\n1. 🚨 [치명적 맹점]\n완료 조건 불명확`,
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }
      return new Response('not found', { status: 404 });
    };

    const res = await route.POST(
      mockRequest({
        agentId: 'glaceon',
        mode: 'critique',
        message: '새로운 검색 기능 기획안 평가해줘',
        evaluate: true,
      })
    );

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, 'generated');
    assert.ok(data.evaluation);
    assert.equal(data.evaluation.score, 75);
    assert.equal(data.evaluation.gate, 'REVISE');
    assert.ok(data.evaluation.summary.includes('완료 조건이 모호'));
  } finally {
    process.env.COM_MOON_SHARED_WEBHOOK_SECRET = prevSecret;
    process.env.GEMINI_API_KEY = prevApiKey;
    globalThis.fetch = originalFetch;
  }
});
