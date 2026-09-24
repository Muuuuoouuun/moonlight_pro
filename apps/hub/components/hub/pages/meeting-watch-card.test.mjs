import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const response = (ok = true) => ({ ok });

function loadEnvelopeReader() {
  const source = readFileSync(new URL('./meeting-watch-card.jsx', import.meta.url), 'utf8');
  const javascript = ts.transpileModule(source, { fileName: 'meeting-watch-card.jsx',
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React,
      esModuleInterop: true, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  const fakeRequire = (name) => name === 'react' ? {}
    : name === 'next/link' ? function Link() {}
      : name === '../hub-primitives' ? {}
        : name === './meeting-watch-card.css' ? {} : require(name);
  new Function('require', 'module', 'exports', javascript)(fakeRequire, module, module.exports);
  return module.exports.readMeetingWatchEnvelope;
}

const readEnvelope = loadEnvelopeReader();
const item = (n) => ({ proposalId: id(n), entryId: id(n + 100), title: `고객 검토 ${n}`,
  checkAt: '2026-10-02', method: '회신 확인', stepCount: 2,
  href: 'https://untrusted.example/meeting', reviewedAt: '2026-09-23T01:00:00Z' });

test('meeting watch is a separate, source-linked read queue', () => {
  const result = readEnvelope(response(), { status: 'live', items: [item(1)], hasMore: false });
  assert.equal(result.status, 'live');
  assert.equal(result.items[0].checkAt, '2026-10-02');
  assert.equal(result.items[0].method, '회신 확인');
  assert.equal(result.items[0].stepCount, 2);
  assert.equal(result.items[0].href, `/dashboard/work/memos?note=${id(101)}`);
});

test('HTTP 200 error and preview never appear as an empty live queue', () => {
  assert.equal(readEnvelope(response(), { status: 'error', items: [] }).status, 'error');
  assert.equal(readEnvelope(response(), { status: 'preview', items: [] }).status, 'preview');
  assert.equal(readEnvelope(response(false), { status: 'live', items: [] }).status, 'error');
  assert.equal(readEnvelope(response(), { status: 'live', items: [{ ...item(1), checkAt: '2026-02-30' }] }).status, 'error');
});

test('meeting watch visibly caps a large response at 20 and retains hasMore', () => {
  const result = readEnvelope(response(), { status: 'live', items: Array.from({ length: 21 }, (_, index) => item(index + 1)), hasMore: false });
  assert.equal(result.status, 'live');
  assert.equal(result.items.length, 20);
  assert.equal(result.hasMore, true);
});

test('My Work mounts the independent meeting watch card', () => {
  const source = readFileSync(new URL('./my-work.jsx', import.meta.url), 'utf8');
  assert.match(source, /import \{ MeetingWatchCard \} from '\.\/meeting-watch-card';/);
  assert.match(source, /<MeetingWatchCard \/>/);
});
