import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const desktop = new URL('../', import.meta.url);
const git = args => execFileSync('git', args, { cwd: desktop, encoding: 'utf8' }).trim();
const revision = git(['rev-parse', 'HEAD']);
if (!/^[a-f0-9]{40}$/.test(revision)) throw new Error('Cannot identify build source');
writeFileSync(new URL('build-info.json', desktop), `${JSON.stringify({ revision, builtAt: new Date().toISOString(),
  modified: git(['status', '--porcelain', '--untracked-files=no']).length > 0 }, null, 2)}\n`);
