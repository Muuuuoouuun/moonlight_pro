#!/usr/bin/env node
// Moonlight macOS 데스크톱 앱 로컬 설치 — 한 줄로 빌드 → 검증 → 종료 → 교체 → 실행까지.
//
//   npm run app:mac:install -- [--skip-build] [--no-launch] [--dest=<dir>] [--dry-run]
//
//   --skip-build   이미 만든 dist/mac-arm64/Moonlight.app 을 그대로 쓴다
//   --no-launch    설치만 하고 실행하지 않는다
//   --dest=<dir>   설치 위치(기본 /Applications)
//   --dry-run      명령을 실행하지 않고 단계만 출력한다
//
// 교체는 `<dest>/Moonlight.app.new` 에 먼저 복사한 뒤 이름만 바꾼다 — 어느 단계에서 실패해도 앱이 없어지지 않는다.
// 실행 중인 앱은 정상 종료(osascript)만 시도하고, 15초 안에 끝나지 않으면 강제 종료 없이 중단한다.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const APP_NAME = 'Moonlight.app';
export const BUNDLE_ID = 'app.moonlight.hub';
export const DEFAULT_DEST = '/Applications';
export const QUIT_TIMEOUT_MS = 15000;

const here = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(here, '..');
export const BUILT_APP = path.join(desktopDir, 'dist', 'mac-arm64', APP_NAME);

export function parseArgs(argv) {
  const opts = { skipBuild: false, launch: true, dest: DEFAULT_DEST, dryRun: false, help: false, errors: [] };
  for (const arg of argv) {
    if (arg === '--skip-build') opts.skipBuild = true;
    else if (arg === '--no-launch') opts.launch = false;
    else if (arg === '--dry-run') opts.dryRun = true;
    else if (arg === '--help' || arg === '-h') opts.help = true;
    else if (arg.startsWith('--dest=')) {
      const value = arg.slice('--dest='.length).trim();
      if (!value) opts.errors.push('--dest 값이 비어 있습니다');
      else opts.dest = value;
    } else opts.errors.push(`알 수 없는 옵션: ${arg}`);
  }
  return opts;
}

export function installPaths(dest) {
  const target = path.join(dest, APP_NAME);
  return { target, staging: `${target}.new`, backup: `${target}.old`, binary: path.join(target, 'Contents', 'MacOS', 'Moonlight') };
}

// 실행할 단계 목록. 순서와 조건(빌드 생략·실행 생략)만 정하는 순수 함수다.
export function planSteps(opts) {
  const p = installPaths(opts.dest);
  const steps = [];
  if (!opts.skipBuild) steps.push({ id: 'build', label: '빌드 (npm run build:mac)' });
  steps.push({ id: 'verify-built', label: `빌드 결과 검증 (codesign · 번들 ID ${BUNDLE_ID})` });
  steps.push({ id: 'quit', label: `실행 중이면 정상 종료 (최대 ${QUIT_TIMEOUT_MS / 1000}초 대기, 강제 종료 없음)` });
  steps.push({ id: 'replace', label: `교체: ditto → ${path.basename(p.staging)} → 기존을 ${path.basename(p.backup)}로 → 새 앱 배치 → 백업 삭제` });
  steps.push({ id: 'quarantine', label: '격리(quarantine) 속성 제거' });
  steps.push({ id: 'verify-installed', label: `설치본 검증 (${p.target})` });
  if (opts.launch) steps.push({ id: 'launch', label: '앱 실행' });
  steps.push({ id: 'report', label: '설치된 버전 출력' });
  return steps;
}

const log = (msg) => console.log(`[install:mac] ${msg}`);

function run(cmd, args, options = {}) {
  return spawnSync(cmd, args, { encoding: 'utf8', ...options });
}

function must(cmd, args, what, options) {
  const r = run(cmd, args, options);
  if (r.status !== 0) {
    const detail = `${r.stderr || ''}${r.stdout || ''}`.trim();
    throw new Error(`${what} 실패 (${cmd} ${args.join(' ')})${detail ? `\n${detail}` : ''}`);
  }
  return r;
}

function plistValue(app, key) {
  const r = run('plutil', ['-extract', key, 'raw', '-o', '-', path.join(app, 'Contents', 'Info.plist')]);
  return r.status === 0 ? r.stdout.trim() : null;
}

function verifyBundle(app, label) {
  if (!fs.existsSync(app)) throw new Error(`${label}: ${app} 이(가) 없습니다`);
  must('codesign', ['--verify', '--deep', '--strict', app], `${label} codesign 검증`);
  const id = plistValue(app, 'CFBundleIdentifier');
  if (id !== BUNDLE_ID) throw new Error(`${label}: 번들 ID가 ${id ?? '(읽기 실패)'} 입니다 (기대값 ${BUNDLE_ID})`);
  log(`${label} 검증 통과 (번들 ID ${id}, 서명 정상)`);
}

function isRunning(binary) {
  return run('pgrep', ['-f', binary]).status === 0;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function quitIfRunning(binary) {
  if (!isRunning(binary)) return log('실행 중이 아님 — 종료 단계 건너뜀');
  log('실행 중 — 정상 종료를 요청합니다');
  run('osascript', ['-e', `tell application id "${BUNDLE_ID}" to quit`]);
  const deadline = Date.now() + QUIT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (!isRunning(binary)) return log('종료 확인');
    await sleep(500);
  }
  throw new Error(`${QUIT_TIMEOUT_MS / 1000}초 안에 Moonlight가 종료되지 않았습니다. 강제 종료하지 않고 중단합니다 — 앱을 직접 종료(저장 확인 창 등)한 뒤 다시 실행하세요. 설치본은 그대로입니다.`);
}

function replaceApp(source, p) {
  fs.mkdirSync(path.dirname(p.target), { recursive: true });
  fs.rmSync(p.staging, { recursive: true, force: true });
  fs.rmSync(p.backup, { recursive: true, force: true });
  must('ditto', [source, p.staging], '새 앱 복사');
  const hadOld = fs.existsSync(p.target);
  if (hadOld) fs.renameSync(p.target, p.backup);
  try {
    fs.renameSync(p.staging, p.target);
  } catch (err) {
    if (hadOld) fs.renameSync(p.backup, p.target);
    throw new Error(`새 앱 배치 실패 — 기존 앱을 되돌렸습니다: ${err.message}`);
  }
  if (hadOld) fs.rmSync(p.backup, { recursive: true, force: true });
  log(`설치 완료: ${p.target}${hadOld ? ' (기존 앱 교체)' : ' (신규)'}`);
}

function clearQuarantine(target) {
  const has = run('xattr', ['-p', 'com.apple.quarantine', target]).status === 0;
  if (!has) return log('격리 속성 없음');
  must('xattr', ['-dr', 'com.apple.quarantine', target], '격리 속성 제거');
  log('격리 속성 제거');
}

export async function main(argv = process.argv.slice(2), platform = process.platform) {
  const opts = parseArgs(argv);
  if (opts.help) {
    console.log('사용법: npm run app:mac:install -- [--skip-build] [--no-launch] [--dest=<dir>] [--dry-run]');
    return 0;
  }
  if (opts.errors.length) {
    for (const e of opts.errors) console.error(`[install:mac] ${e}`);
    return 2;
  }
  if (platform !== 'darwin') {
    console.error(`[install:mac] macOS 전용입니다 (현재 ${platform}). Windows는 npm run app:win:build 를 쓰세요.`);
    return 1;
  }

  const p = installPaths(opts.dest);
  const steps = planSteps(opts);
  if (opts.dryRun) {
    log('--dry-run: 아래 단계를 실행하지 않고 출력만 합니다');
    log(`원본 ${BUILT_APP}`);
    log(`대상 ${p.target}`);
    steps.forEach((s, i) => log(`${i + 1}/${steps.length} ${s.label}`));
    return 0;
  }

  try {
    for (const [i, step] of steps.entries()) {
      log(`${i + 1}/${steps.length} ${step.label}`);
      if (step.id === 'build') must('npm', ['--workspace', '@com-moon/desktop', 'run', 'build:mac'], '빌드', { stdio: 'inherit', cwd: path.resolve(desktopDir, '..', '..') });
      else if (step.id === 'verify-built') verifyBundle(BUILT_APP, '빌드 결과');
      else if (step.id === 'quit') await quitIfRunning(p.binary);
      else if (step.id === 'replace') replaceApp(BUILT_APP, p);
      else if (step.id === 'quarantine') clearQuarantine(p.target);
      else if (step.id === 'verify-installed') verifyBundle(p.target, '설치본');
      else if (step.id === 'launch') must('open', ['-a', p.target], '앱 실행');
      else if (step.id === 'report') log(`설치된 버전 ${plistValue(p.target, 'CFBundleShortVersionString') ?? '(읽기 실패)'}`);
    }
  } catch (err) {
    console.error(`[install:mac] ${err.message}`);
    return 1;
  }
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
