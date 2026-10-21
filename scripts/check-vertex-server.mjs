// One-off production-build smoke test. Uses the app's existing server credentials
// inside its deployment environment; never downloads or prints those credentials.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const app = process.argv[2];
if (!['hub', 'engine'].includes(app) || process.env.GEMINI_BACKEND !== 'vertex' || process.env.VERCEL !== '1') {
  throw new Error('Run inside a Vertex-enabled Vercel production build: node scripts/check-vertex-server.mjs hub|engine');
}
const key = app === 'engine' ? 'COM_MOON_SHARED_WEBHOOK_SECRET' : 'COM_MOON_HUB_WRITE_SECRET';
const secret = process.env[key]?.trim();
if (!secret || secret === '[SENSITIVE]') throw new Error('Application authentication is unavailable');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const next = createRequire(import.meta.url).resolve('next/dist/bin/next');
const origin = 'http://127.0.0.1:3891';
const server = spawn(process.execPath, [next, 'start', '--hostname', '127.0.0.1', '--port', '3891'], {
  cwd: resolve(root, 'apps', app), env: { ...process.env, NODE_ENV: 'production' }, stdio: ['ignore', 'ignore', 'ignore'],
});
const started = Date.now();
try {
  for (;;) {
    if (server.exitCode !== null) throw new Error('Production server failed to start');
    try {
      await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(7000) });
      break;
    } catch {
      if (Date.now() - started > 30000) throw new Error('Production server startup timed out');
      await new Promise(done => setTimeout(done, 250));
    }
  }
  const endpoint = app === 'engine' ? '/api/ai/assist' : '/api/hub/intake/multimodal';
  const body = app === 'engine'
    ? { operation: 'rewrite', instruction: '연결 점검입니다. source.text의 점검 문장만 그대로 반환해 주세요.', scope: 'personal', source: { status: 'live', scope: 'personal', sourceRefs: [{ entityType: 'connection-check', entityId: 'vertex-check' }], text: '연결 성공' } }
    : { text: '연결 점검용 메모입니다. 제목: Vertex 연결 확인. 내용: 연결 성공.', instruction: '연결 점검 메모로 분류하고 원문에 없는 인물, 일정, 업무를 추가하지 마세요.' };
  const response = await fetch(`${origin}${endpoint}`, {
    method: 'POST', headers: { 'content-type': 'application/json', [app === 'engine' ? 'x-com-moon-shared-secret' : 'x-com-moon-hub-write-secret']: secret },
    body: JSON.stringify(body), signal: AbortSignal.timeout(70000),
  });
  const data = await response.json();
  const ok = response.ok && (app === 'engine' ? data.status === 'generated' && Boolean(data.output?.trim()) : data.status === 'ok' && Boolean(data.data));
  console.log(JSON.stringify({ vertexServerCheck: app, ok, httpStatus: response.status, status: data.status,
    backend: process.env.GEMINI_BACKEND, projectId: process.env.GOOGLE_CLOUD_PROJECT,
    model: data.model || process.env.GEMINI_MODEL || 'gemini-3.5-flash', usage: data.usage || null,
    dataKeys: data.data ? Object.keys(data.data) : null, elapsedMs: Date.now() - started }));
  if (!ok) process.exitCode = 1;
} catch (error) {
  console.error(JSON.stringify({ vertexServerCheck: app, ok: false, reason: error.name === 'TimeoutError' ? 'timeout' : 'server-check-failed' }));
  process.exitCode = 1;
} finally {
  server.kill('SIGTERM');
}
