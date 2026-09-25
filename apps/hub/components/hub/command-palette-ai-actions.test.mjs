import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const palette = readFileSync(new URL('./hub-command-palette.jsx', import.meta.url), 'utf8');
const hubApp = readFileSync(new URL('./hub-app.jsx', import.meta.url), 'utf8');
const aiActions = [...palette.matchAll(/flat\.push\(\{ kind: 'Action', label: '(AI [^']+)', path: '([^']+)'/g)]
  .map(([, label, path]) => ({ label, path, route: path.split('?')[0] }));

test('⌘K AI actions open a route the shell actually mounts', () => {
  assert.ok(aiActions.length >= 2, 'expected the Council and Guru actions');
  for (const { label, route } of aiActions) {
    assert.ok(hubApp.includes(`'${route}':`), `${label} points at ${route}, which PAGE_MAP does not mount`);
    assert.notEqual(route, 'dashboard/system/agents', `${label} still targets the removed system/agents route`);
  }
});

test('the retired 5-persona roster has no ⌘K entry (2026-09-26 operator decision)', () => {
  for (const persona of ['order', 'sales', 'content', 'production', 'review']) {
    assert.equal(aiActions.some(({ path }) => new URLSearchParams(path.split('?')[1] || '').get('agent') === persona), false,
      `⌘K still opens the ${persona} persona`);
  }
});
