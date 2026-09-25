import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { renderFormattedMentorText } from './office-mentor-drawer.jsx';

test('renderFormattedMentorText parses markdown bold and newlines without raw asterisks', () => {
  const result = renderFormattedMentorText('**단기 집중:** 이 영역에 대해 **확인**이 필요합니다.\n다음 줄 내용');
  const html = renderToStaticMarkup(React.createElement('div', null, result));
  assert.equal(html, '<div><strong>단기 집중:</strong> 이 영역에 대해 <strong>확인</strong>이 필요합니다.<br/>다음 줄 내용</div>');
  assert.ok(!html.includes('**'));
});

test('renderFormattedMentorText returns null for non-string input and preserves plain text', () => {
  assert.equal(renderFormattedMentorText(null), null);
  assert.equal(renderFormattedMentorText(undefined), null);
  const plain = renderToStaticMarkup(React.createElement('div', null, renderFormattedMentorText('일반 텍스트만 있습니다.')));
  assert.equal(plain, '<div>일반 텍스트만 있습니다.</div>');
});
