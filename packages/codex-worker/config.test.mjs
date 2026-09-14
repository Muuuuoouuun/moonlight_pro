import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { readWorkerConfig, prepareJob } from './config.mjs';
const exec = promisify(execFile);

test('runtime rejects inherited home, remote plaintext and parent credentials', async () => {
  const base = { COM_MOON_CODEX_ENGINE_URL: 'http://localhost:3001', COM_MOON_CODEX_HOME: '/isolated-worker', CODEX_HOME: '/parent', COM_MOON_CODEX_WORKER_TOKEN: 'worker', COM_MOON_CODEX_PROJECTS_JSON: '{"repo":{"path":"/repo","modes":["read"]}}' };
  assert.throws(() => readWorkerConfig({ ...base, COM_MOON_CODEX_HOME: '/parent' }), /dedicated/);
  assert.throws(() => readWorkerConfig({ ...base, COM_MOON_CODEX_ENGINE_URL: 'http://engine.example.com' }), /https/);
  assert.equal(readWorkerConfig(base).model, undefined);
});

test('project context cannot escape via symlink and apply requires clean isolated worktree', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'moonlight-worker-config-'));
  try {
    const repo = join(dir, 'repo'), worktree = join(dir, 'worktree'), home = join(dir, 'worker-home');
    await mkdir(repo); await exec('git', ['init', '-q', repo]);
    await writeFile(join(repo, 'context.md'), 'A trusted reference');
    await exec('git', ['-C', repo, 'add', 'context.md']);
    await exec('git', ['-C', repo, '-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-qm', 'initial']);
    await exec('git', ['-C', repo, 'worktree', 'add', '-q', '-b', 'worker-test', worktree]);
    const config = { projects: { repo: { path: repo, applyPath: worktree, modes: ['read', 'apply'], contextRefs: { ref: 'context.md' } } }, codexHome: home, path: '/usr/bin:/bin' };
    const job = { projectId: 'repo', mode: 'read', prompt: 'Review', contextRefs: ['ref'] };
    const ready = await prepareJob(job, config);
    assert.ok(ready.prompt.includes('A trusted reference'));
    assert.equal(ready.sdkOptions.env.COM_MOON_CODEX_WORKER_TOKEN, undefined);
    assert.equal(ready.sdkOptions.config.shell_environment_policy.ignore_default_excludes, false);
    assert.equal(ready.sdkOptions.config.projects[ready.workingDirectory].trust_level, 'untrusted');
    assert.deepEqual(ready.sdkOptions.config.features, { apps: false, hooks: false, remote_plugin: false });
    await writeFile(join(dir, 'private.txt'), 'secret');
    await symlink(join(dir, 'private.txt'), join(repo, 'leak.md'));
    config.projects.repo.contextRefs.ref = 'leak.md';
    await assert.rejects(() => prepareJob(job, config), /escapes/);
    config.projects.repo.contextRefs.ref = 'context.md';
    const applied = await prepareJob({ ...job, mode: 'apply', turnCount: 1, attempt: 1 }, config);
    assert.equal(applied.workingDirectory.endsWith('/worktree'), true);
    await writeFile(join(worktree, 'context.md'), 'Existing uncommitted edit');
    await assert.rejects(() => prepareJob({ ...job, mode: 'apply', turnCount: 1, attempt: 1 }, config), /clean-worktree/);
    await writeFile(join(home, 'config.toml'), '[mcp_servers.danger]\ncommand="anything"');
    await assert.rejects(() => prepareJob(job, config), /tool-configuration/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('ordinary home checkouts exclude only the isolated operator user config and still reject project hooks', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'moonlight-home-checkout-'));
  try {
    const operatorHome = join(dir, 'operator'), repo = join(operatorHome, 'dev', 'repo'), runtimeHome = join(dir, 'runtime');
    await mkdir(join(operatorHome, '.codex'), { recursive: true });
    await writeFile(join(operatorHome, '.codex', 'config.toml'), '[mcp_servers.operator_only]\ncommand="/must-not-run"\n');
    await mkdir(repo, { recursive: true }); await exec('git', ['init', '-q', repo]);
    const config = { operatorHome, projects: { repo: { path: repo, modes: ['read'] } }, codexHome: runtimeHome, path: '/usr/bin:/bin' };
    const job = { projectId: 'repo', mode: 'read', prompt: 'Review', contextRefs: [] };
    const ready = await prepareJob(job, config);
    assert.equal(ready.sdkOptions.env.HOME.endsWith('/runtime'), true);
    assert.equal(ready.sdkOptions.env.CODEX_HOME, ready.sdkOptions.env.HOME);
    await mkdir(join(operatorHome, 'dev', '.codex'));
    await assert.rejects(() => prepareJob(job, config), /project-codex-configuration/);
    await rm(join(operatorHome, 'dev', '.codex'), { recursive: true });
    await mkdir(join(repo, '.codex'));
    await writeFile(join(repo, '.codex', 'hooks.json'), '{"hooks":{}}');
    await assert.rejects(() => prepareJob(job, config), /project-codex-configuration/);
    await assert.rejects(() => prepareJob(job, { ...config, operatorHome: repo }), /project-codex-configuration/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
