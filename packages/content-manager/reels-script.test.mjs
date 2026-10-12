import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateReelsScriptBody } from './reels-script.ts';

const scene = (patch = {}) => ({ id: 'scene-1', visual: '화면', spoken: '대사', subtitle: '', duration: 10, notes: '', ...patch });
const body = (scenes) => JSON.stringify({ scenes });

test('the shared scene contract keeps the existing duration, count and text boundaries', () => {
  for (const duration of [0.5, 10, 600]) assert.equal(validateReelsScriptBody(body([scene({ duration })])).ok, true);
  assert.equal(validateReelsScriptBody(body(Array.from({ length: 30 }, (_, index) => scene({ id: `scene-${index}`, spoken: '가'.repeat(16000) })))).ok, true);
  for (const duration of [0, -1, 601, null, '10', NaN, Infinity]) {
    assert.deepEqual(validateReelsScriptBody(body([scene({ duration })])), { ok: false, reason: 'invalid-reels-script-duration', sceneNumber: 1 });
  }
});

test('only manual drafts may be empty, and non-empty drafts use the exact AI scene contract', () => {
  for (const value of ['', '  ', body([])]) {
    assert.equal(validateReelsScriptBody(value).ok, false);
    assert.equal(validateReelsScriptBody(value, { allowEmptyDraft: true }).ok, true);
  }
  assert.equal(validateReelsScriptBody(body([scene({ visual: '', spoken: '' })]), { allowEmptyDraft: true }).ok, false);
});

test('malformed shapes, duplicate IDs and invalid text report the affected scene', () => {
  const missingField = scene(); delete missingField.notes;
  for (const [value, reason, sceneNumber] of [
    ['not JSON', 'invalid-reels-script-json'],
    ['[]', 'invalid-reels-script-scenes'],
    [JSON.stringify({ scenes: [], extra: true }), 'invalid-reels-script-scenes'],
    [body(Array.from({ length: 31 }, (_, index) => scene({ id: `scene-${index}` }))), 'invalid-reels-script-scenes'],
    [body([missingField]), 'invalid-reels-script-fields', 1],
    [body([scene({ extra: true })]), 'invalid-reels-script-fields', 1],
    [body([scene(), scene()]), 'invalid-reels-script-id', 2],
    [body([scene({ id: 'constructor' })]), 'invalid-reels-script-id', 1],
    [body([scene({ spoken: '가'.repeat(16001) })]), 'invalid-reels-script-text', 1],
    [body([scene({ spoken: '\uD800' })]), 'invalid-reels-script-text', 1],
    [body([scene({ spoken: '\u0000' })]), 'invalid-reels-script-text', 1],
    [body([scene({ visual: ' ', spoken: '' })]), 'invalid-reels-script-content', 1],
  ]) {
    assert.deepEqual(validateReelsScriptBody(value), { ok: false, reason, ...(sceneNumber ? { sceneNumber } : {}) });
  }
});
