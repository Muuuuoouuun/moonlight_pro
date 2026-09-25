import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseGuruArticle, GuruArticleBody } from './guru-article-markdown.jsx';

test('an internal reading post keeps its title, prose, sections and list in order', () => {
  const article = parseGuruArticle('# 고객의 현재 상태부터 듣기\n\n먼저 상황을 듣습니다.\n이어서 차이를 확인합니다.\n\n## 관점 읽기\n\n상대의 말에서 출발합니다.\n\n## 대화에서 써보기\n\n- 지금 방식은 어떤가요?\n- 바라는 결과는 무엇인가요?');
  assert.equal(article.title, '고객의 현재 상태부터 듣기');
  assert.deepEqual(article.blocks.map(block => block.type), ['paragraph', 'heading', 'paragraph', 'heading', 'list']);
  assert.equal(article.blocks[0].text, '먼저 상황을 듣습니다. 이어서 차이를 확인합니다.');
  const html = renderToStaticMarkup(React.createElement(GuruArticleBody, { article }));
  assert.match(html, /<h3>관점 읽기<\/h3>/);
  assert.match(html, /<li>지금 방식은 어떤가요\?<\/li>/);
});

test('authored Markdown never becomes executable HTML or an outbound link', () => {
  const article = parseGuruArticle('# 안전한 글\n\n<script>alert(1)</script> [원전](https://example.org)\n\n## 관점 읽기\n\n> 이것은 편집자의 설명입니다.');
  const html = renderToStaticMarkup(React.createElement(GuruArticleBody, { article }));
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script|<a\b|href=/);
  assert.match(html, /<blockquote>/);
  assert.equal(parseGuruArticle('## 제목이 없는 글'), null);
});
