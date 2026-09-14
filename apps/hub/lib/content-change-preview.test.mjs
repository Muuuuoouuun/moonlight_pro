import assert from 'node:assert/strict';
import { test } from 'node:test';
import { contentChangePreview } from './content-change-preview.js';

test('comparison preserves Korean, emoji, whitespace and empty edits exactly', () => {
  for (const [before, after] of [['', '초안'], ['삭제', ''], ['동일', '동일'], ['오늘 🌙 달을 본다.\n다음 문장', '오늘 🌕 달을 본다.\n다음 문장'], ['시작\n원문\n끝', '시작\n새 문장\n끝'], ['<script>x</script>', '<script>y</script>']]) {
    const result = contentChangePreview(before, after);
    assert.equal(Object.values(result.before).join(''), before);
    assert.equal(Object.values(result.after).join(''), after);
    assert.equal(result.unchanged, before === after);
  }
  const emoji = contentChangePreview('오늘 🌙 달', '오늘 🌕 달');
  assert.equal(emoji.before.changed, '🌙');
  assert.equal(emoji.after.changed, '🌕');
});

test('insertion, deletion and separated changes do not duplicate shared text', () => {
  assert.deepEqual(contentChangePreview('시작 끝', '시작 새 내용 끝').before, { prefix: '시작 ', changed: '', suffix: '끝' });
  assert.deepEqual(contentChangePreview('시작 새 내용 끝', '시작 끝').after, { prefix: '시작 ', changed: '', suffix: '끝' });
  assert.deepEqual(contentChangePreview('A old middle old Z', 'A new middle new Z').after, { prefix: 'A ', changed: 'new middle new', suffix: ' Z' });
  const long = '한'.repeat(40000);
  assert.equal(contentChangePreview(long + '전', long + '후').after.changed, '후');
});
