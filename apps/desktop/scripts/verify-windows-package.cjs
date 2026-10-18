'use strict';
// Run on a real Windows runner after electron-builder. No operator profile or Hub.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { execFileSync, spawn } = require('node:child_process');
const asar = require('@electron/asar');

async function main() {
  assert.equal(process.platform, 'win32', 'requires real Windows; emulation is not sufficient');
  assert.equal(process.arch, 'x64');
  const desktop = path.resolve(__dirname, '..');
  const dist = path.join(desktop, 'dist');
  const output = path.join(dist, 'verification');
  fs.mkdirSync(output, { recursive: true });
  const version = require('../package.json').version;
  const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: desktop, encoding: 'utf8' }).trim();
  if (process.env.GITHUB_SHA) assert.equal(revision, process.env.GITHUB_SHA);
  const sha256 = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  function peMachine(file) {
    const bytes = fs.readFileSync(file);
    assert.equal(bytes.subarray(0, 2).toString(), 'MZ', file);
    const offset = bytes.readUInt32LE(0x3c);
    assert.equal(bytes.subarray(offset, offset + 4).toString(), 'PE\0\0', file);
    const machine = bytes.readUInt16LE(offset + 4);
    assert.ok([0x14c, 0x8664].includes(machine), `unsupported PE machine ${machine}`);
    return machine === 0x8664 ? 'x64' : 'x86 launcher';
  }
  const names = [`Moonlight-Setup-${version}.exe`, `Moonlight-Portable-${version}.exe`, 'win-unpacked/Moonlight.exe', 'win-unpacked/resources/app.asar'];
  const files = names.map(name => {
    const file = path.join(dist, name);
    assert.ok(fs.statSync(file).size > 0, name);
    return { name, bytes: fs.statSync(file).size, sha256: sha256(file), ...(name.endsWith('.exe') ? { peMachine: peMachine(file) } : {}) };
  });
  assert.equal(files.find(file => file.name === 'win-unpacked/Moonlight.exe').peMachine, 'x64');
  const archive = path.join(dist, 'win-unpacked/resources/app.asar');
  const read = name => asar.extractFile(archive, name);
  assert.equal(JSON.parse(read('package.json')).version, version);
  const build = JSON.parse(read('build-info.json'));
  assert.equal(build.revision, revision);
  assert.equal(build.modified, false, 'package must come from the clean checked-out source');
  assert.ok(Number.isFinite(Date.parse(build.builtAt)));
  const critical = ['main.js', 'pet/shared/contract.js', 'pet/main/pet-hub.js', 'pet/main/pet-hub-client.js',
    'pet/main/pet-office-api.js', 'pet/main/pet-pending.js', 'pet/renderer/modes/office.js', 'settings/settings.js'];
  for (const name of critical) assert.deepEqual(read(name), fs.readFileSync(path.join(desktop, name)), `packaged source differs: ${name}`);
  fs.writeFileSync(path.join(output, 'SHA256SUMS'), files.map(file => `${file.sha256}  ${file.name}`).join('\n') + '\n');
  const report = { platform: process.platform, arch: process.arch, os: os.version(), release: os.release(),
    runnerOS: process.env.RUNNER_OS || null, runnerImage: process.env.ImageOS || null,
    version, revision, build, files, sourceFilesVerified: critical, smoke: null };
  const save = () => fs.writeFileSync(path.join(output, 'windows-verification.json'), JSON.stringify(report, null, 2) + '\n');
  save();
  // NSIS assisted installer only runs the app silently with --force-run, which
  // is deliberately absent. /currentuser avoids a machine-wide installation.
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'moonlight-win-ci-'));
  const install = path.join(temporary, 'installed');
  execFileSync(path.join(dist, names[0]), ['/S', '/currentuser', `/D=${install}`], { timeout: 120000, windowsHide: true });
  const executable = path.join(install, 'Moonlight.exe');
  assert.equal(sha256(executable), files.find(file => file.name === 'win-unpacked/Moonlight.exe').sha256);
  assert.equal(sha256(path.join(install, 'resources/app.asar')), sha256(archive));
  report.installation = { mode: 'current user, disposable runner', exeMatchesUnpacked: true, archiveMatchesUnpacked: true };
  save();
  const profile = path.join(temporary, 'isolated-profile');
  const screenshot = path.join(output, 'windows-widget.png');
  let log = '';
  const code = await new Promise((resolve, reject) => {
    const child = spawn(executable, ['--smoke-widget', `--smoke-out=${screenshot}`, `--user-data-dir=${profile}`],
      { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: false });
    const timeout = setTimeout(() => {
      try { execFileSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); } catch {}
      reject(new Error('installed app smoke timeout'));
    }, 130000);
    for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { log += chunk; process.stdout.write(chunk); });
    child.once('error', error => { clearTimeout(timeout); reject(error); });
    child.once('close', code => { clearTimeout(timeout); resolve(code); });
  });
  fs.writeFileSync(path.join(output, 'windows-widget.log'), log);
  assert.equal(code, 0, 'installed application failed');
  for (const marker of ['smoke:widget-bridge', 'smoke:widget-login ok', 'smoke:widget-session-shared-and-resumed ok', 'smoke:widget ok']) {
    assert.ok(log.includes(marker), `missing installed-app proof: ${marker}`);
  }
  assert.ok(!log.includes('smoke:fail'), log);
  const png = fs.readFileSync(screenshot);
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  report.smoke = { installedAppStarted: true, isolatedLoopbackHub: true, sharedLoginTransition: true,
    rendererBridge: true, separateProfile: true, screenshot: { width: png.readUInt32BE(16), height: png.readUInt32BE(20), sha256: sha256(screenshot) },
    actualOperatorLogin: false, acrylicVisualQuality: 'not assessed by this widget smoke', windows11ConsumerInstall: false };
  save();
  console.log('windows:verified ' + JSON.stringify(report));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
