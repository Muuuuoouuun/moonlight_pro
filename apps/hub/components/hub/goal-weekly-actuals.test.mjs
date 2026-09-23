import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const source = await readFile(new URL('./goal-weekly-actuals.jsx', import.meta.url), 'utf8');
const goalsPage = await readFile(new URL('./pages/goals.jsx', import.meta.url), 'utf8');

test('weekly actuals never pair one scope\'s weeks with another request\'s reports', () => {
  // setReports([])는 effect 안에서 돌아 범위가 바뀐 첫 렌더에 이전 범위의 값이 새 주 열에 "실시간"으로 그려졌다.
  assert.match(source, /const requestKey = `\$\{scope\}\|\$\{today\}\|\$\{attempt\}`/);
  assert.match(source, /loaded\.key === requestKey \? loaded\.reports : \[\]/);
});

test('each week read has its own timeout, and refresh recomputes today', () => {
  assert.match(source, /AbortSignal\.any\(\[signal, AbortSignal\.timeout\(WEEK_TIMEOUT_MS\)\]\)/);
  assert.match(source, /setToday\(seoulToday\(\)\)/);
});

test('an unmeasured cell has an accessible name, and the goals header does not show a second conflicting status', () => {
  assert.match(source, /role="img" aria-label="미측정"/);
  assert.match(goalsPage, /\{!weekly && <TruthBadge state=\{model\.status\} \/>\}/);
});
