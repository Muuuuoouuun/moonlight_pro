import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SOURCE_ENTRIES } from '@com-moon/guru-guidance/source-library';
import { SourceHeading, SourceMarkdown, parseSourceMarkdown, safeSourceHref } from './source-markdown.jsx';

const render = (markdown, props = {}) => renderToStaticMarkup(React.createElement(SourceMarkdown, { markdown, ...props }));
const source = readFileSync(new URL('./source-markdown.jsx', import.meta.url), 'utf8');
const textOf = html => html
  .replace(/<[^>]+>/g, '')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&');
const hangul = text => (text.match(/[가-힣]/g) || []).length;

test('document headings render below the page h2/h3 and never as h1 or h2', () => {
  const html = render('# 문서\n\n## 장\n\n### 절\n\n#### 소절\n\n##### 더 깊은 절');
  assert.doesNotMatch(html, /<h[12][\s>]/);
  assert.match(html, /<h4 class="source-md__heading">문서<\/h4>/);
  assert.match(html, /<h5 class="source-md__heading">장<\/h5>/);
  assert.match(html, /<h6 class="source-md__heading">절<\/h6>/);
  assert.match(html, /<div role="heading" aria-level="7" class="source-md__heading">소절<\/div>/);
  assert.match(html, /aria-level="8"/);
  const forced = render('# 제목\n\n## 부제', { headingLevel: () => 1 });
  assert.doesNotMatch(forced, /<h[12][\s>]/, 'a caller cannot push a document heading up to h1/h2');
  assert.match(forced, /<h3 class="source-md__heading">제목<\/h3>/);
  assert.match(renderToStaticMarkup(React.createElement(SourceHeading, { level: 2 }, 'x')), /^<h3>x<\/h3>$/);
});

test('headings keep absolute line anchors for table-of-contents jumps', () => {
  const html = render('## 장\n\n본문\n\n### 절', { lineOffset: 40, anchorFor: line => `a-${line}`, focusableHeadings: true });
  assert.match(html, /<h5 id="a-40" class="source-md__heading" tabindex="-1">장<\/h5>/);
  assert.match(html, /<h6 id="a-44" class="source-md__heading" tabindex="-1">절<\/h6>/);
});

test('emphasis follows CommonMark and stays readable in Korean text', () => {
  const html = render('**S**incerity · *"할인 되나요?"* · **가장 작은 실행 가능한 시장(Smallest Viable Market)**이다 · 제작시간 **80%**는 · ***둘 다*** · 5 * 3 = 15');
  assert.match(html, /<strong>S<\/strong>incerity/);
  assert.match(html, /<em>&quot;할인 되나요\?&quot;<\/em>/);
  assert.match(html, /<strong>가장 작은 실행 가능한 시장\(Smallest Viable Market\)<\/strong>이다/);
  assert.match(html, /<strong>80%<\/strong>는/);
  assert.match(html, /<em><strong>둘 다<\/strong><\/em>/);
  assert.match(html, /5 \* 3 = 15/);
  assert.doesNotMatch(textOf(html), /\*\*/);
});

test('inline code keeps its content literal and paragraph line breaks survive', () => {
  const html = render('고객: *"할인 되나요?"*\n❌ 초보: "네"\n✅ Ziglar: **"얼마면 적절할까요?"** `a|**b**`');
  assert.match(html, /<p>고객: <em>&quot;할인 되나요\?&quot;<\/em><br\/>❌ 초보: &quot;네&quot;<br\/>✅ Ziglar: <strong>/);
  assert.match(html, /<code class="source-md__code-inline">a\|\*\*b\*\*<\/code>/);
});

test('only http and https links open, in a new tab without opener access', () => {
  const html = render('[원전](https://example.org/a?b=1) · [상대 경로](research/2026-09-24-guru-source-quality.md) · [위험](javascript:alert(1)) · [비번](https://user:pw@example.org/) · 출처: https://example.com/path_with_underscores.');
  assert.match(html, /<a class="source-md__link" href="https:\/\/example\.org\/a\?b=1" target="_blank" rel="noopener noreferrer">원전<\/a>/);
  assert.match(html, /<span class="source-md__link-text">상대 경로<span class="source-md__link-target"> \(research\/2026-09-24-guru-source-quality\.md\)<\/span><\/span>/);
  assert.doesNotMatch(html, /href="javascript/i);
  assert.match(html, /위험<span class="source-md__link-target"> \(javascript:alert\(1\)\)<\/span>/);
  assert.doesNotMatch(html, /href="https:\/\/user/, 'URLs with credentials never become links');
  assert.match(html, /<a class="source-md__link" href="https:\/\/example\.com\/path_with_underscores"[^>]*>https:\/\/example\.com\/path_with_underscores<\/a>\./);
  assert.equal(safeSourceHref('http://example.org/x'), 'http://example.org/x');
  assert.equal(safeSourceHref('mailto:a@b.c'), null);
  assert.equal(safeSourceHref('//example.org'), null);
  assert.equal(render('[손실][격차]').includes('<a'), false, 'bracket pairs without a destination stay text');
});

test('raw HTML is shown as text; only the documents\' <br> becomes a line break', () => {
  const html = render('<script>alert(1)</script> <img src=x onerror=alert(1)> | 셀<br>다음 줄');
  assert.doesNotMatch(html, /<script|<img/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt; &lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /셀<br\/>다음 줄/);
  assert.doesNotMatch(source, /dangerouslySetInnerHTML\s*[=:{]|\.innerHTML|\.outerHTML|createContextualFragment/);
});

test('nested lists, loose items, ordered starts and blockquotes keep their structure', () => {
  const html = render([
    '1. **ClassIn 영업 레인 (`sales-mentor`)**:',
    '   - 회사 세일즈 업무만 다룬다.',
    '   - 개인 브랜드와 **절대 섞지 않는다**.',
    '',
    '2. **개인 브랜드 레인**:',
    '   - 운영자 본인의 지식 비즈니스',
    '',
    '3) 다른 목록',
    '',
    '> *"지금 결정이 어려우시죠?',
    '> 같이 써볼까요?"*',
    '',
    '- 팔려고 하면 → 도망간다',
    '- 도우려고 하면 → 찾아온다',
  ].join('\n'));
  assert.match(html, /<ol><li><p><strong>ClassIn 영업 레인 \(<code class="source-md__code-inline">sales-mentor<\/code>\)<\/strong>:<\/p><ul><li>회사 세일즈 업무만 다룬다\.<\/li><li>개인 브랜드와 <strong>절대 섞지 않는다<\/strong>\.<\/li><\/ul><\/li><li><p><strong>개인 브랜드 레인<\/strong>:<\/p><ul><li>운영자 본인의 지식 비즈니스<\/li><\/ul><\/li><\/ol>/);
  assert.match(html, /<ol start="3"><li>다른 목록<\/li><\/ol>/);
  assert.match(html, /<blockquote><p><em>&quot;지금 결정이 어려우시죠\?<br\/>같이 써볼까요\?&quot;<\/em><\/p><\/blockquote>/);
  assert.match(html, /<ul><li>팔려고 하면 → 도망간다<\/li><li>도우려고 하면 → 찾아온다<\/li><\/ul>/);
});

test('GFM tables scroll inside their own box and keep every cell', () => {
  const html = render('| # | 장애물 | 고객의 속마음 |\n|---|:------:|--------------:|\n| 1 | **No Need** | "필요 없어요" |\n| 2 | No Money | 돈 | 넘치는 칸 |');
  assert.match(html, /<div class="source-md__table-wrap" role="group" aria-label="표" tabindex="0"><table class="source-md__table" style="--source-md-cols:4">/);
  assert.match(html, /<th scope="col" style="text-align:center">장애물<\/th>/);
  assert.match(html, /<td style="text-align:right">&quot;필요 없어요&quot;<\/td>/);
  assert.match(html, /<td style="text-align:center"><strong>No Need<\/strong><\/td>/);
  assert.match(html, /<td>넘치는 칸<\/td>/, 'extra cells are rendered, not dropped');
  assert.match(html, /<th scope="col"><\/th><\/tr><\/thead>/, 'the header is padded to the widest row');
  const blocks = parseSourceMarkdown('앞 문단\n| a | b |\n|---|---|\n| 1 | 2 |');
  assert.deepEqual(blocks.map(block => block.type), ['paragraph', 'table'], 'a table can follow a paragraph line directly');
});

test('fenced code, rules and plain paragraphs render verbatim', () => {
  const html = render('```mermaid\nflowchart TD\n  A["**not bold**"] --> B\n```\n\n---\n\n본문 <끝>');
  assert.match(html, /<pre class="source-md__code" tabindex="0" data-lang="mermaid"><code>flowchart TD\n  A\[&quot;\*\*not bold\*\*&quot;\] --&gt; B<\/code><\/pre>/);
  assert.match(html, /<hr\/>/);
  assert.match(html, /<p>본문 &lt;끝&gt;<\/p>/);
  const unclosed = render('```\n코드 끝 없음');
  assert.match(unclosed, /<code>코드 끝 없음<\/code>/, 'an unclosed fence still shows its text');
});

test('every original entry renders completely with no h1/h2 and no stray markers', () => {
  assert.ok(SOURCE_ENTRIES.length > 90);
  for (const entry of SOURCE_ENTRIES) {
    const html = render(entry.markdown, { lineOffset: entry.startLine });
    assert.doesNotMatch(html, /<h[12][\s>]/, entry.id);
    assert.doesNotMatch(html, /<script/i, entry.id);
    assert.equal(hangul(textOf(html)), hangul(entry.markdown), `${entry.id}: every Hangul character appears exactly once`);
    const prose = textOf(html.replace(/<(pre|code)[^>]*>[\s\S]*?<\/\1>/g, ''));
    assert.doesNotMatch(prose, /\*\*/, `${entry.id}: unparsed emphasis`);
  }
});
