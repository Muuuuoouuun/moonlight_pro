import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { memoCaptureHref } from '@/lib/journal-client';
import { memoHref } from '@/lib/memo-save';

test('legacy memo workspace creates in the journal while preserving its existing reads and task links', () => {
  const source = readFileSync(new URL('./memo-workspace.jsx', import.meta.url), 'utf8');
  assert.match(source, /<MemoCaptureLink\s+context=\{isCanonicalUuid\(projectFilter\) \? \{ type: "project", id: projectFilter \}/);
  assert.doesNotMatch(source, /<MemoCapture\s|from "\.\/memo-capture"/);
  assert.match(source, /\/api\/hub\/memos\$\{/);
  assert.match(source, /fetchImpl\("\/api\/hub\/memos",\s*\{\s*method: "POST"/);
  const project = '11111111-1111-4111-8111-111111111111';
  assert.equal(memoCaptureHref({ type: 'project', id: project }), `/dashboard/work/memos?new=note&contextType=project&contextId=${project}`);
  assert.equal(memoCaptureHref(), '/dashboard/work/memos?new=note');
  assert.equal(memoHref(project), `/dashboard/work/memos?note=${project}`);
});
