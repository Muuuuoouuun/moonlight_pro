import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);
const cli = createRequire(import.meta.url).resolve('@openai/codex/bin/codex.js');

test('pinned CLI isolates operator home MCP config and accepts disabled external integration flags', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'moonlight-config-layer-'));
  try {
    const operatorHome = join(dir, 'operator'), isolatedHome = join(dir, 'runtime'), repo = join(operatorHome, 'dev', 'repo');
    await mkdir(join(operatorHome, '.codex'), { recursive: true }); await mkdir(isolatedHome); await mkdir(repo, { recursive: true });
    // Listing configuration is read-only: this nonexistent sentinel command must never run.
    await writeFile(join(operatorHome, '.codex', 'config.toml'), '[mcp_servers.operator_only]\ncommand="/must-never-run"\n');
    await exec('git', ['init', '-q', repo]);
    const project = ['-c', `projects.${JSON.stringify(repo)}.trust_level="untrusted"`];
    const run = async (home, args) => (await exec(process.execPath, [cli, ...project, ...args], { cwd: repo, env: { PATH: process.env.PATH, HOME: home, CODEX_HOME: home === operatorHome ? join(home, '.codex') : home }, timeout: 10000 })).stdout;
    const inherited = JSON.parse(await run(operatorHome, ['mcp', 'list', '--json']));
    assert.equal(inherited.some(entry => entry.name === 'operator_only'), true);
    assert.deepEqual(JSON.parse(await run(isolatedHome, ['mcp', 'list', '--json'])), []);
    const features = await run(isolatedHome, ['-c', 'features.apps=false', '-c', 'features.hooks=false', '-c', 'features.remote_plugin=false', 'features', 'list']);
    for (const name of ['apps', 'hooks', 'remote_plugin']) assert.match(features, new RegExp(`^${name}\\s+stable\\s+false$`, 'm'));
  } finally { await rm(dir, { recursive: true, force: true }); }
});
