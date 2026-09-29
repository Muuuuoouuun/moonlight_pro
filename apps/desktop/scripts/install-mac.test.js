'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

const load = () => import('./install-mac.mjs');

test('기본 인자: 빌드·실행 켜짐, /Applications', async () => {
  const { parseArgs, DEFAULT_DEST } = await load();
  assert.deepEqual(parseArgs([]), { skipBuild: false, launch: true, dest: DEFAULT_DEST, dryRun: false, help: false, errors: [] });
});

test('플래그를 모두 읽는다', async () => {
  const { parseArgs } = await load();
  const o = parseArgs(['--skip-build', '--no-launch', '--dry-run', '--dest=/tmp/apps']);
  assert.equal(o.skipBuild, true);
  assert.equal(o.launch, false);
  assert.equal(o.dryRun, true);
  assert.equal(o.dest, '/tmp/apps');
  assert.deepEqual(o.errors, []);
});

test('알 수 없는 옵션·빈 --dest는 오류로 모은다', async () => {
  const { parseArgs } = await load();
  const o = parseArgs(['--bogus', '--dest=']);
  assert.equal(o.errors.length, 2);
  assert.equal(o.dest, '/Applications');
});

test('installPaths: staging·backup은 대상 옆에 둔다', async () => {
  const { installPaths } = await load();
  const p = installPaths('/tmp/apps');
  assert.equal(p.target, '/tmp/apps/Moonlight.app');
  assert.equal(p.staging, '/tmp/apps/Moonlight.app.new');
  assert.equal(p.backup, '/tmp/apps/Moonlight.app.old');
  assert.equal(p.binary, '/tmp/apps/Moonlight.app/Contents/MacOS/Moonlight');
});

test('planSteps: 전체 순서', async () => {
  const { planSteps, parseArgs } = await load();
  const ids = planSteps(parseArgs([])).map((s) => s.id);
  assert.deepEqual(ids, ['build', 'verify-built', 'quit', 'replace', 'quarantine', 'verify-installed', 'launch', 'report']);
});

test('planSteps: --skip-build는 빌드를, --no-launch는 실행을 뺀다', async () => {
  const { planSteps, parseArgs } = await load();
  const ids = planSteps(parseArgs(['--skip-build', '--no-launch'])).map((s) => s.id);
  assert.ok(!ids.includes('build'));
  assert.ok(!ids.includes('launch'));
  assert.ok(ids.indexOf('quit') < ids.indexOf('replace'), '종료가 교체보다 먼저');
  assert.ok(ids.indexOf('verify-built') < ids.indexOf('quit'), '빌드 검증이 종료보다 먼저');
});

test('macOS가 아니면 명확한 메시지로 실패하고 아무것도 실행하지 않는다', async () => {
  const { main } = await load();
  assert.equal(await main([], 'win32'), 1);
});

test('--dry-run은 0으로 끝난다', async () => {
  const { main } = await load();
  assert.equal(await main(['--dry-run', '--skip-build'], 'darwin'), 0);
});
