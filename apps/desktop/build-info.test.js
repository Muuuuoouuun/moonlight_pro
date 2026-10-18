'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { readBuildInfo } = require('./build-info');
const pkg = require('./package.json');

function buildTree(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'moonlight-build-contract-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const run = (command, args) => execFileSync(command, args, { cwd: directory, encoding: 'utf8', shell: process.platform === 'win32' && command === 'npm',
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: path.join(directory, 'absent-global-config'), npm_config_cache: path.join(directory, 'cache') } }).trim();
  fs.mkdirSync(path.join(directory, 'scripts'));
  fs.mkdirSync(path.join(directory, 'node_modules', '.bin'), { recursive: true });
  fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ name: 'build-contract', version: pkg.version, scripts: pkg.scripts }));
  fs.copyFileSync(path.join(__dirname, 'scripts/write-build-info.mjs'), path.join(directory, 'scripts/write-build-info.mjs'));
  // Native compilation/packaging is stubbed; this test executes the actual npm
  // command chain and inspects exactly what reaches the packaging boundary.
  for (const name of ['build-mac-pet', 'build-mac-glass']) fs.writeFileSync(path.join(directory, `scripts/${name}.mjs`), '');
  const probe = `#!/usr/bin/env node
require('node:fs').writeFileSync('packaging-input.json', JSON.stringify({args:process.argv.slice(2),build:JSON.parse(require('node:fs').readFileSync('build-info.json','utf8'))}));
`;
  fs.writeFileSync(path.join(directory, 'node_modules/.bin/electron-builder'), probe, { mode: 0o755 });
  fs.writeFileSync(path.join(directory, 'node_modules/packaging-probe.cjs'), probe);
  fs.writeFileSync(path.join(directory, 'node_modules/.bin/electron-builder.cmd'), '@node "%~dp0..\\packaging-probe.cjs" %*\r\n');
  fs.writeFileSync(path.join(directory, '.gitignore'), 'node_modules/\ncache/\nbuild-info.json\npackaging-input.json\n');
  run('git', ['init', '-q']);
  run('git', ['add', 'package.json', 'scripts', '.gitignore']);
  run('git', ['-c', 'user.name=Contract Test', '-c', 'user.email=contract@example.test', 'commit', '-qm', 'Build contract source']);
  return { directory, run, revision: () => run('git', ['rev-parse', 'HEAD']) };
}

test('Windows and Mac package commands both replace stale build metadata before packaging', t => {
  const { directory, run, revision } = buildTree(t);
  for (const [command, args] of [['build', ['--win', '--x64']], ['build:mac', ['--mac', '--arm64']]]) {
    fs.writeFileSync(path.join(directory, 'build-info.json'), JSON.stringify({ revision: '0'.repeat(40), builtAt: '2000-01-01T00:00:00Z' }));
    const started = Date.now();
    run('npm', ['run', command]);
    const captured = JSON.parse(fs.readFileSync(path.join(directory, 'packaging-input.json'), 'utf8'));
    assert.deepEqual(captured.args, args);
    assert.equal(captured.build.revision, revision());
    assert.equal(captured.build.modified, false);
    assert.ok(Date.parse(captured.build.builtAt) >= started);
    assert.deepEqual(readBuildInfo(directory), { version: pkg.version, revision: revision().slice(0, 12), builtAt: captured.build.builtAt, modified: false });
  }
  fs.appendFileSync(path.join(directory, 'scripts/build-mac-pet.mjs'), '// tracked change\n');
  run('npm', ['run', 'build:mac']);
  assert.equal(readBuildInfo(directory).modified, true);
});

test('missing or malformed build metadata is explicitly labeled development', t => {
  const { directory } = buildTree(t);
  assert.deepEqual(readBuildInfo(directory), { version: pkg.version, revision: 'development', builtAt: null, modified: false });
  fs.writeFileSync(path.join(directory, 'build-info.json'), '{malformed');
  assert.equal(readBuildInfo(directory).revision, 'development');
});
