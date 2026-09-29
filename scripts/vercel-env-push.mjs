#!/usr/bin/env node
// Vercel 환경 변수 올리기 — 로컬 env 파일 하나를 읽어 링크된 Vercel 프로젝트의 한 환경에 키를 올린다.
//
//   node scripts/vercel-env-push.mjs --app hub    [--env production] [--dry-run]
//   node scripts/vercel-env-push.mjs --app engine [--env production] [--dry-run]
//
// - 읽는 파일: apps/<app>/.env.<env>.local (gitignore). 값은 절대 출력하지 않는다 — 키 이름만 보인다.
// - `__FILL_ME__`·빈 값·`your-…` 자리표시자는 건너뛰고 마지막에 목록으로 알린다.
// - 실행 전 저장소 루트가 `vercel link --repo --yes`로 연결돼 있어야 한다(.vercel/repo.json) — 또는 apps/<app>/.vercel/project.json.
// - 같은 키가 이미 있으면 `--force`로 덮어쓴다. Vercel CLI(`npx vercel`)와 로그인 세션이 필요하다.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const app = opt('--app');
const env = opt('--env', 'production');
const dryRun = args.includes('--dry-run');
if (!app || !['hub', 'engine'].includes(app)) {
  console.error('사용법: node scripts/vercel-env-push.mjs --app <hub|engine> [--env production] [--dry-run]');
  process.exit(1);
}
const appDir = path.join(root, 'apps', app);
const file = path.join(appDir, `.env.${env}.local`);
if (!fs.existsSync(file)) { console.error(`env 파일이 없습니다: ${path.relative(root, file)}`); process.exit(1); }
const linked = fs.existsSync(path.join(appDir, '.vercel', 'project.json')) || fs.existsSync(path.join(root, '.vercel', 'repo.json'));
if (!dryRun && !linked) {
  console.error(`apps/${app} 이 Vercel 프로젝트에 연결되지 않았습니다. 먼저(저장소 루트에서): npx vercel link --repo --yes`);
  process.exit(1);
}

const PLACEHOLDER = /^(__FILL_ME__|your-.*|<.*>)?$/;
const entries = [];
for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
  const line = raw.trim();
  if (!line || line.startsWith('#')) continue;
  const i = line.indexOf('=');
  if (i <= 0) continue;
  const key = line.slice(0, i).trim();
  let value = line.slice(i + 1).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
  entries.push({ key, value, skip: PLACEHOLDER.test(value) });
}

const skipped = entries.filter(e => e.skip).map(e => e.key);
const pushable = entries.filter(e => !e.skip);
console.log(`${path.relative(root, file)} → ${env}: 올릴 키 ${pushable.length}개, 건너뛴 자리표시자 ${skipped.length}개`);
if (dryRun) {
  console.log('올릴 키:', pushable.map(e => e.key).join(' '));
  if (skipped.length) console.log('건너뜀(채워야 함):', skipped.join(' '));
  process.exit(0);
}

const failed = [];
for (const { key, value } of pushable) {
  const result = spawnSync('npx', ['-y', 'vercel@latest', 'env', 'add', key, env, '--force', '--yes'], {
    cwd: appDir, input: value, encoding: 'utf8', shell: process.platform === 'win32',
  });
  const ok = result.status === 0;
  console.log(`${ok ? '✓' : '✗'} ${key}`);
  if (!ok) failed.push(key), console.error((result.stderr || result.stdout || '').trim().split('\n').slice(-3).join('\n'));
}
if (skipped.length) console.log('건너뜀(채워야 함):', skipped.join(' '));
if (failed.length) { console.error('실패:', failed.join(' ')); process.exit(1); }
