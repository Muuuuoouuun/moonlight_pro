import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AI_USAGE_TABLE, buildAiUsageRow, recordAiUsage } from './ai-usage-log.ts';
import { generateGeminiText } from './gemini.ts';

const WORKSPACE = '11111111-1111-4111-8111-111111111111';
const USAGE = { promptTokenCount: 120, candidatesTokenCount: 40, thoughtsTokenCount: 30, totalTokenCount: 190, cachedContentTokenCount: 5 };

test('a usage row carries only counts, a short surface key and the model name', () => {
  const row = buildAiUsageRow({ surface: 'persona-chat', model: 'gemini-3.5-flash', usageMetadata: USAGE, prompt: '고객 비밀', text: '답변' }, WORKSPACE);
  assert.deepEqual(row, { workspace_id: WORKSPACE, surface: 'persona-chat', model: 'gemini-3.5-flash', prompt_tokens: 120, output_tokens: 40, thinking_tokens: 30, total_tokens: 190 });
  assert.deepEqual(Object.keys(row).sort(), ['model', 'output_tokens', 'prompt_tokens', 'surface', 'thinking_tokens', 'total_tokens', 'workspace_id']);
  // Free text never becomes a surface or model value.
  const odd = buildAiUsageRow({ surface: '고객 김철수 상담', model: 'model with spaces', usageMetadata: { promptTokenCount: 1 } }, WORKSPACE);
  assert.equal(odd.surface, 'unknown');
  assert.equal(odd.model, 'unknown');
  assert.equal(odd.total_tokens, 1, 'total falls back to the sum when the provider omits it');
  for (const usage of [null, undefined, [], 'x', {}, { promptTokenCount: -1, totalTokenCount: 1.5 }]) {
    assert.equal(buildAiUsageRow({ surface: 'brief', model: 'm', usageMetadata: usage }, WORKSPACE), null);
  }
});

test('recording is skipped without storage or workspace and swallows every write failure', async () => {
  const insert = async () => { throw new Error('should not be called'); };
  assert.equal(recordAiUsage({ surface: 'brief', model: 'm', usageMetadata: USAGE }, { configured: false, workspaceId: WORKSPACE, insert }), null);
  assert.equal(recordAiUsage({ surface: 'brief', model: 'm', usageMetadata: USAGE }, { configured: true, workspaceId: '', insert }), null);
  assert.equal(recordAiUsage({ surface: 'brief', model: 'm', usageMetadata: null }, { configured: true, workspaceId: WORKSPACE, insert }), null);

  const rejected = recordAiUsage({ surface: 'brief', model: 'm', usageMetadata: USAGE }, { configured: true, workspaceId: WORKSPACE, insert: async () => { throw new Error('db down'); } });
  assert.equal(await rejected, null);
  const thrown = recordAiUsage({ surface: 'brief', model: 'm', usageMetadata: USAGE }, { configured: true, workspaceId: WORKSPACE, insert: () => { throw new Error('sync'); } });
  assert.equal(await thrown, null);

  let seen;
  await recordAiUsage({ surface: 'brief', model: 'm', usageMetadata: USAGE }, { configured: true, workspaceId: WORKSPACE, insert: async (table, row, options) => { seen = { table, row, options }; } });
  assert.equal(seen.table, AI_USAGE_TABLE);
  assert.ok(seen.options.timeoutMs > 0 && seen.options.timeoutMs <= 5000, 'short write timeout');
});

test('generateGeminiText answers without waiting for the usage write and never sends prompt text to the log', async () => {
  const names = ['GEMINI_API_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'COM_MOON_DEFAULT_WORKSPACE_ID'];
  const before = { fetch: globalThis.fetch, env: Object.fromEntries(names.map(name => [name, process.env[name]])) };
  Object.assign(process.env, { GEMINI_API_KEY: 'local-test-key', SUPABASE_URL: 'https://db.test', SUPABASE_SERVICE_ROLE_KEY: 'db-test', COM_MOON_DEFAULT_WORKSPACE_ID: WORKSPACE });
  const logWrites = [];
  let releaseLog;
  const logGate = new Promise(resolve => { releaseLog = resolve; });
  try {
    globalThis.fetch = async (url, init) => {
      if (String(url).includes('googleapis')) {
        return new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '답변 본문' }] } }], usageMetadata: USAGE }));
      }
      logWrites.push({ url: String(url), body: init.body });
      await logGate; // the log write hangs until released — the answer must not wait for it
      return new Response(null, { status: 201 });
    };
    const result = await generateGeminiText({ prompt: '고객 김철수에게 보낼 제안', systemInstruction: '비밀 지침', model: 'gemini-3.5-flash', usageSurface: 'sales-mentor' });
    assert.equal(result.ok, true);
    assert.equal(result.text, '답변 본문');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(logWrites.length, 1);
    assert.match(logWrites[0].url, /\/rest\/v1\/ai_usage_log/);
    const row = JSON.parse(logWrites[0].body);
    assert.deepEqual(row, { workspace_id: WORKSPACE, surface: 'sales-mentor', model: 'gemini-3.5-flash', prompt_tokens: 120, output_tokens: 40, thinking_tokens: 30, total_tokens: 190 });
    assert.doesNotMatch(logWrites[0].body, /김철수|비밀|답변/);

    // A failing log write still leaves the answer intact.
    globalThis.fetch = async (url) => {
      if (String(url).includes('googleapis')) return new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '두 번째' }] } }], usageMetadata: USAGE }));
      throw new TypeError('network down');
    };
    const second = await generateGeminiText({ prompt: 'x' });
    assert.equal(second.ok, true);
    assert.equal(second.text, '두 번째');
  } finally {
    releaseLog();
    globalThis.fetch = before.fetch;
    for (const [name, value] of Object.entries(before.env)) value === undefined ? delete process.env[name] : process.env[name] = value;
  }
});

test('every Engine Gemini entry point tags its calls with a surface key', async () => {
  const { readFile } = await import('node:fs/promises');
  const expected = {
    '../app/api/ai/assist/route.ts': 'ai-assist',
    '../app/api/ai/brand-mentor/route.ts': 'brand-mentor',
    '../app/api/ai/brief/route.ts': 'brief',
    '../app/api/ai/pattern-analyze/route.ts': 'pattern-analysis',
    '../app/api/ai/persona-chat/route.ts': 'persona-chat',
    '../app/api/ai/sales-mentor/route.ts': 'sales-mentor',
    '../app/api/content/transform/route.ts': 'content-transform',
    './office/service.ts': 'office-chat',
    './office/routing.ts': 'office-routing',
    './office/workflow-service.ts': 'office-workflow',
    './office/deliberation.ts': 'office-council',
    './multimodal-intake.ts': 'multimodal-intake',
  };
  for (const [file, surface] of Object.entries(expected)) {
    const source = await readFile(new URL(file, import.meta.url), 'utf8');
    assert.match(source, new RegExp(`usageSurface[^\\n]*["']${surface}["']`), `${file} → ${surface}`);
  }
  // gemini.ts is the one Engine place that talks to the provider, and it records every response.
  const gemini = await readFile(new URL('./gemini.ts', import.meta.url), 'utf8');
  assert.equal((gemini.match(/:generateContent/g) || []).length, 1);
  assert.match(gemini, /recordAiUsage\(\{ surface: input\.usageSurface/);
});
