import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { collectSourceFiles, inspectSourceSyntax, lintSource } from './lint-source.mjs';

const script = fileURLToPath(new URL('./lint-source.mjs', import.meta.url));
function directory(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'moonlight-syntax-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (file, source) => { mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); writeFileSync(path.join(root, file), source); };
  return { root, write };
}

test('syntax guard accepts valid JavaScript, JSX-in-JS, JSX, TS, TSX, MJS and CJS', async t => {
  const { root, write } = directory(t);
  write('apps/hub/page.js', 'export default function Page() { return <main>Hello</main>; }');
  write('apps/hub/view.jsx', 'export const View = () => <><span>ok</span></>;');
  write('apps/engine/index.ts', 'export const value: number = 1;');
  write('packages/ui/view.tsx', 'type Props = { label: string }; export const View = (p: Props) => <div>{p.label}</div>;');
  write('scripts/tool.mjs', 'export const run = async () => 1;');
  write('packages/tools/index.cjs', "module.exports = { ready: true };");
  const result = await lintSource({ root });
  assert.equal(result.checked, 6);
  assert.deepEqual(result.issues, []);
});

test('CLI fails malformed source and reports file, location and parse diagnostic without a source excerpt', t => {
  const { root, write } = directory(t);
  write('apps/hub/broken.jsx', 'export const Broken = () => <div>;');
  const result = spawnSync(process.execPath, [script, '--root', root], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /apps\/hub\/broken\.jsx:\d+:\d+: \[TS\d+\]/);
  assert.doesNotMatch(result.stderr, /export const Broken/);
  assert.match(result.stdout, /1 files checked/);
});

test('unresolved merge conflicts fail clearly while marker text in strings and comments is allowed', () => {
  const conflict = ['<<<<<<< HEAD', 'const selected = 1;', '=======', 'const selected = 2;', '>>>>>>> other'].join('\n');
  assert.ok(inspectSourceSyntax('scripts/conflict.mjs', conflict).some(issue => issue.code === 'MERGE_CONFLICT'));
  assert.deepEqual(inspectSourceSyntax('scripts/quoted.mjs', 'const marker = "<<<<<<< HEAD"; // =======\n'), []);
});

test('debugger guard checks actual statements rather than words in comments or string data', () => {
  assert.deepEqual(inspectSourceSyntax('scripts/safe.mjs', 'const text = "debugger;"; // debugger;\n'), []);
  const issues = inspectSourceSyntax('scripts/paused.mjs', 'function action() { debugger; }');
  assert.equal(issues.filter(issue => issue.code === 'DEBUGGER').length, 1);
});

test('source collection never opens generated output, sensitive configuration, symlinks or non-source roots', async t => {
  const { root, write } = directory(t);
  write('apps/hub/valid.js', 'export const ready = true;');
  for (const file of [
    'apps/hub/node_modules/dependency/index.js', 'apps/hub/.next/server.js', 'apps/hub/.next.qa/server.js',
    'apps/hub/.turbo/cache.js', 'apps/hub/dist/bundle.js', 'apps/hub/build/output.js', 'apps/hub/generated/client.js',
    'apps/hub/coverage/report.js', 'apps/hub/out/output.js', 'apps/hub/compiled.generated.js', 'apps/hub/bundle.min.js',
    'apps/android/www/hub-config.js', 'apps/hub/.env.mjs', 'apps/hub/credentials.js', 'apps/hub/secrets-config.mjs',
    'apps/hub/credentials/client.js', 'apps/hub/file.json', 'docs/source.js', 'outside.js',
  ]) write(file, 'const = invalid;');
  symlinkSync(path.join(root, 'outside.js'), path.join(root, 'apps/hub/linked.js'));
  symlinkSync(path.join(root, 'docs'), path.join(root, 'apps/hub/external'));
  symlinkSync(path.join(root, 'docs'), path.join(root, 'packages'));
  assert.deepEqual(await collectSourceFiles(root), [path.join('apps', 'hub', 'valid.js')]);
  const opened = [];
  const result = await lintSource({ root, readSource: file => { opened.push(path.relative(root, file)); return readFileSync(file, 'utf8'); } });
  assert.equal(result.checked, 1);
  assert.deepEqual(result.issues, []);
  assert.deepEqual(opened, [path.join('apps', 'hub', 'valid.js')]);
});

test('zero eligible files fails instead of reporting a successful empty lint run', async t => {
  const { root, write } = directory(t);
  write('apps/hub/.next.qa/server.js', 'const generated = true;');
  const result = await lintSource({ root });
  assert.equal(result.checked, 0);
  assert.equal(result.issues[0].code, 'NO_SOURCE_FILES');
  const command = spawnSync(process.execPath, [script, '--root', root], { encoding: 'utf8' });
  assert.equal(command.status, 1);
  assert.match(command.stderr, /NO_SOURCE_FILES/);
});

test('help states that syntax guard does not provide semantic linting', () => {
  const result = spawnSync(process.execPath, [script, '--help'], { encoding: 'utf8' });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Bounded syntax/);
  assert.match(result.stdout, /does not check types, imports, style or ESLint-equivalent semantics/);
});
