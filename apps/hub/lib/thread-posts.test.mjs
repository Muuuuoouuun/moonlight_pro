import test from 'node:test';
import assert from 'node:assert/strict';
import {
  joinThreadBlocks, mergeThreadBlockWithPrevious, postLength, replaceThreadBlock, threadBlockOffsets, threadBlocks,
  threadPostsForPublish, threadPublishIssues,
} from './thread-posts.js';

test('blocks round-trip the exact body, separators included', () => {
  for (const body of ['', '한 줄', '첫 글\n\n둘째 글', '첫 글\n\n\n\n둘째\n줄바꿈', '앞\n  \n뒤', '끝에 빈 줄\n\n', '\n\n앞이 빔']) {
    assert.equal(joinThreadBlocks(threadBlocks(body)), body);
  }
  assert.deepEqual(threadBlocks('a\n\nb\nc').parts, ['a', 'b\nc']);
  assert.deepEqual(threadBlocks('').parts, ['']);
});

test('offsets point at each block inside the stored body', () => {
  const body = '첫 글\n\n\n둘째 글\n\n셋';
  const offsets = threadBlockOffsets(threadBlocks(body));
  threadBlocks(body).parts.forEach((part, index) => assert.equal(body.slice(offsets[index], offsets[index] + part.length), part));
});

test('Enter twice inside a block splits it and moves the caret to the new block', () => {
  const result = replaceThreadBlock(threadBlocks('첫 글\n\n둘째'), 0, '첫 글\n\n', 5);
  assert.deepEqual(result.blocks.parts, ['첫 글', '', '둘째'], 'the editor keeps the empty middle block');
  assert.equal(joinThreadBlocks(result.blocks), '첫 글\n\n\n\n둘째', 'the stored body stays a plain blank-line split');
  assert.equal(result.focusIndex, 1); assert.equal(result.focusCaret, 0); assert.equal(result.split, true);
  const middle = replaceThreadBlock(threadBlocks('ab'), 0, 'a\n\nb', 3);
  assert.deepEqual(middle.blocks.parts, ['a', 'b']);
  assert.equal(middle.focusIndex, 1); assert.equal(middle.focusCaret, 0);
});

test('plain edits keep other blocks and their separators untouched', () => {
  const result = replaceThreadBlock(threadBlocks('하나\n\n\n둘\n\n셋'), 1, '둘!', 2);
  assert.equal(joinThreadBlocks(result.blocks), '하나\n\n\n둘!\n\n셋');
  assert.equal(result.split, false); assert.equal(result.focusIndex, 1); assert.equal(result.focusCaret, 2);
});

test('Backspace at a block start joins it to the previous block with one line break', () => {
  const merged = mergeThreadBlockWithPrevious(threadBlocks('하나\n\n둘'), 1);
  assert.equal(joinThreadBlocks(merged.blocks), '하나\n둘'); assert.equal(merged.focusIndex, 0); assert.equal(merged.focusCaret, 3);
  assert.equal(joinThreadBlocks(mergeThreadBlockWithPrevious(threadBlocks('하나\n\n'), 1).blocks), '하나');
  assert.equal(mergeThreadBlockWithPrevious(threadBlocks('하나'), 0), null);
});

test('posts to publish drop empty blocks and surrounding spaces; issues name the blocker', () => {
  assert.deepEqual(threadPostsForPublish('  첫 글 \n\n\n\n둘째\n줄\n\n  \n'), ['첫 글', '둘째\n줄']);
  assert.deepEqual(threadPublishIssues(['짧은 글']), []);
  assert.equal(threadPublishIssues([])[0].code, 'empty');
  const over = threadPublishIssues(['가'.repeat(501), '나']);
  assert.equal(over[0].code, 'over-limit'); assert.deepEqual(over[0].indexes, [0]);
  assert.equal(threadPublishIssues(Array.from({ length: 11 }, () => '글'))[0].code, 'too-many');
  assert.equal(postLength('😀'), 1);
});
