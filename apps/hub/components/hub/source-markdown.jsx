import React from 'react';

// Safe Markdown renderer for the verbatim Guru/Legend originals (source-library).
//
// Supports the subset those documents use: ATX headings, paragraphs, **bold**, *italic*,
// `inline code`, links, nested ordered/unordered lists, blockquotes, GFM pipe tables, hr
// and fenced code. Everything reaches the DOM as React text: no dangerouslySetInnerHTML and
// no raw HTML. The one tag the documents use, <br> inside table cells, becomes a React <br>;
// any other tag stays visible as text. Links open only for http/https URLs; any other
// target (a repository path, javascript:, …) stays readable as text instead of a link.
//
// Line breaks inside a paragraph are kept as <br>: these documents are written line by line
// (dialogue, ❌/✅ contrasts), and reading them verbatim means keeping that shape.
//
// Headings never render as <h1>/<h2>. A page owns exactly one <h2> (DESIGN.md §11), so
// callers map document levels below their own heading; levels past 6 use role="heading".
// Styles (.source-md*) live in guidance-source-reader.css, the one surface that renders it.

const FENCE_RE = /^( {0,3})(`{3,}|~{3,})(.*)$/;
const CLOSE_FENCE_RE = /^ {0,3}(`{3,}|~{3,})[ \t]*$/;
const ATX_RE = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?[ \t]*$/;
const HR_RE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const QUOTE_RE = /^ {0,3}> ?/;
const LIST_RE = /^( {0,3})([-*+]|\d{1,9}[.)])(?:([ \t]+)(.*))?$/;
const DELIMITER_CELL_RE = /^:?-+:?$/;
const MIN_HEADING_LEVEL = 3;

const isBlank = line => /^[ \t]*$/.test(line);

function expandLeadingTabs(line) {
  const match = /^[ \t]+/.exec(line);
  if (!match || !match[0].includes('\t')) return line;
  let width = 0;
  for (const char of match[0]) width = char === '\t' ? width + 4 - (width % 4) : width + 1;
  return ' '.repeat(width) + line.slice(match[0].length);
}

const leadingSpaces = line => line.length - line.trimStart().length;

function headingText(raw) {
  return String(raw ?? '').replace(/(?:^|[ \t]+)#+[ \t]*$/, '').trim();
}

function openFence(line) {
  const match = FENCE_RE.exec(line);
  if (!match) return null;
  if (match[2][0] === '`' && match[3].includes('`')) return null;
  return { indent: match[1].length, marker: match[2], info: match[3].trim() };
}

function closesFence(line, fence) {
  const match = CLOSE_FENCE_RE.exec(line);
  return Boolean(match && match[1][0] === fence.marker[0] && match[1].length >= fence.marker.length);
}

function stripIndent(line, width) {
  let index = 0;
  while (index < width && line[index] === ' ') index += 1;
  return line.slice(index);
}

function listMarker(line) {
  const match = LIST_RE.exec(line);
  if (!match || HR_RE.test(line)) return null;
  const ordered = /\d/.test(match[2]);
  return {
    indent: match[1].length,
    marker: match[2],
    ordered,
    delimiter: ordered ? match[2].slice(-1) : match[2],
    number: ordered ? Number.parseInt(match[2], 10) : null,
    spaces: match[3] ?? '',
    content: match[4] ?? '',
  };
}

function splitRow(line) {
  let text = line.trim();
  if (text.startsWith('|')) text = text.slice(1);
  if (text.endsWith('|') && !text.endsWith('\\|')) text = text.slice(0, -1);
  const cells = [];
  let current = '';
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '\\' && text[index + 1] === '|') { current += '|'; index += 1; continue; }
    if (char === '|') { cells.push(current.trim()); current = ''; continue; }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

function tableStart(line, next) {
  if (!line || !next || !line.includes('|') || !next.includes('|') || leadingSpaces(line) > 3) return null;
  const delimiter = splitRow(next);
  if (!delimiter.length || !delimiter.every(cell => DELIMITER_CELL_RE.test(cell))) return null;
  const header = splitRow(line);
  if (header.length !== delimiter.length) return null;
  const align = delimiter.map(cell => (cell.startsWith(':') && cell.endsWith(':') ? 'center'
    : cell.endsWith(':') ? 'right' : cell.startsWith(':') ? 'left' : null));
  return { header, align };
}

function startsBlock(line, next) {
  if (openFence(line) || ATX_RE.test(line) || HR_RE.test(line) || QUOTE_RE.test(line)) return true;
  const item = listMarker(line);
  if (item && item.content.trim() && (!item.ordered || item.number === 1)) return true;
  return Boolean(tableStart(line, next));
}

function endsTableRows(line) {
  return Boolean(openFence(line) || ATX_RE.test(line) || HR_RE.test(line) || QUOTE_RE.test(line) || listMarker(line));
}

function parseList(lines, start) {
  const first = listMarker(lines[start]);
  const items = [];
  let index = start;
  let loose = false;
  while (index < lines.length) {
    const item = listMarker(lines[index]);
    if (!item || item.ordered !== first.ordered || item.delimiter !== first.delimiter) break;
    const spaces = item.spaces.length;
    const contentIndent = item.indent + item.marker.length + (item.content === '' || spaces > 4 ? 1 : spaces);
    const body = [item.content === '' ? '' : `${spaces > 4 ? ' '.repeat(spaces - 1) : ''}${item.content}`];
    index += 1;
    while (index < lines.length) {
      const next = lines[index];
      if (isBlank(next)) { body.push(''); index += 1; continue; }
      if (leadingSpaces(next) >= contentIndent) { body.push(next.slice(contentIndent)); index += 1; continue; }
      break;
    }
    let trailing = 0;
    while (body.length > 1 && isBlank(body[body.length - 1])) { body.pop(); trailing += 1; }
    if (body.slice(1).some(isBlank)) loose = true;
    items.push({ children: parseBlocks(body, null) });
    if (trailing) {
      const following = index < lines.length ? listMarker(lines[index]) : null;
      if (following && following.ordered === first.ordered && following.delimiter === first.delimiter) loose = true;
      else break;
    }
  }
  return { block: { type: 'list', ordered: first.ordered, start: first.number, loose, items }, next: index };
}

// lineOffset is the absolute line number of lines[0]; headings keep it for anchors. Nested
// containers (quotes, list items) pass null, so only top-level headings carry a line.
function parseBlocks(lines, lineOffset) {
  const blocks = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (isBlank(line)) { index += 1; continue; }

    const fence = openFence(line);
    if (fence) {
      const body = [];
      let cursor = index + 1;
      while (cursor < lines.length && !closesFence(lines[cursor], fence)) {
        body.push(stripIndent(lines[cursor], fence.indent));
        cursor += 1;
      }
      blocks.push({ type: 'code', lang: fence.info.split(/\s+/)[0] || '', text: body.join('\n') });
      index = Math.min(cursor + 1, lines.length);
      continue;
    }

    const heading = ATX_RE.exec(line);
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length, text: headingText(heading[2]), line: lineOffset == null ? null : lineOffset + index });
      index += 1;
      continue;
    }

    if (HR_RE.test(line)) { blocks.push({ type: 'hr' }); index += 1; continue; }

    if (QUOTE_RE.test(line)) {
      const inner = [];
      while (index < lines.length && QUOTE_RE.test(lines[index])) {
        inner.push(lines[index].replace(QUOTE_RE, ''));
        index += 1;
      }
      blocks.push({ type: 'blockquote', children: parseBlocks(inner, null) });
      continue;
    }

    if (listMarker(line)) {
      const { block, next } = parseList(lines, index);
      blocks.push(block);
      index = next;
      continue;
    }

    const table = tableStart(line, lines[index + 1]);
    if (table) {
      const rows = [];
      let cursor = index + 2;
      while (cursor < lines.length && !isBlank(lines[cursor]) && !endsTableRows(lines[cursor])) {
        rows.push(splitRow(lines[cursor]));
        cursor += 1;
      }
      blocks.push({ type: 'table', header: table.header, align: table.align, rows });
      index = cursor;
      continue;
    }

    const paragraph = [line.trim()];
    index += 1;
    while (index < lines.length && !isBlank(lines[index]) && !startsBlock(lines[index], lines[index + 1])) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    blocks.push({ type: 'paragraph', text: paragraph.join('\n') });
  }
  return blocks;
}

export function parseSourceMarkdown(markdown, { lineOffset = 1 } = {}) {
  const lines = String(markdown ?? '').replace(/\r\n?/g, '\n').split('\n').map(expandLeadingTabs);
  return parseBlocks(lines, lineOffset);
}

// ---------------------------------------------------------------------------------------
// Inline: code spans, <br>, links, then CommonMark-style emphasis over delimiter runs.

const ESCAPABLE = new Set('!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~');
const BARE_URL_RE = /https?:\/\/[A-Za-z0-9\-._~:/?#[\]@!$&()*+,;=%]+/g;

export function safeSourceHref(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!/^https?:\/\//i.test(trimmed)) return null;
  try {
    const url = new URL(trimmed);
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

function charBefore(text, index) {
  if (index <= 0) return '';
  const code = text.charCodeAt(index - 1);
  if (code >= 0xdc00 && code <= 0xdfff && index >= 2) return text.slice(index - 2, index);
  return text[index - 1];
}

function charAfter(text, index) {
  return index >= text.length ? '' : String.fromCodePoint(text.codePointAt(index));
}

const isWhitespace = char => char === '' || /\s/u.test(char);
const isPunctuation = char => char !== '' && /[\p{P}\p{S}]/u.test(char);
// CJK-friendly emphasis: Korean writes "**…(Market)**이다" and "**80%**는" with no space
// before the particle. Strict CommonMark (and GitHub) leave those asterisks literal; here a
// Hangul/Han/Kana neighbour satisfies the "whitespace or punctuation" side of the rule.
const isCjk = char => char !== '' && /[\p{Script=Hangul}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(char);

function findCodeClose(text, from, run) {
  let index = from;
  while (index < text.length) {
    if (text[index] !== '`') { index += 1; continue; }
    let length = 1;
    while (text[index + length] === '`') length += 1;
    if (length === run) return index;
    index += length;
  }
  return -1;
}

function codeSpanText(raw) {
  const value = raw.replace(/\n/g, ' ');
  return value.length > 2 && value.startsWith(' ') && value.endsWith(' ') && value.trim() ? value.slice(1, -1) : value;
}

function skipWhitespace(text, index) {
  let cursor = index;
  while (cursor < text.length && /[ \t\n]/.test(text[cursor])) cursor += 1;
  return cursor;
}

// [label](destination "optional title"). Returns null for anything else, e.g. "[손실][격차]".
function parseLinkAt(text, start) {
  let depth = 0;
  let close = -1;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (char === '\\') { index += 1; continue; }
    if (char === '`') {
      let run = 1;
      while (text[index + run] === '`') run += 1;
      const end = findCodeClose(text, index + run, run);
      index = end >= 0 ? end + run - 1 : index + run - 1;
      continue;
    }
    if (char === '[') depth += 1;
    else if (char === ']') {
      depth -= 1;
      if (depth === 0) { close = index; break; }
    }
  }
  if (close < 0 || text[close + 1] !== '(') return null;
  let cursor = skipWhitespace(text, close + 2);
  let destination = '';
  if (text[cursor] === '<') {
    const end = text.indexOf('>', cursor + 1);
    if (end < 0 || text.slice(cursor + 1, end).includes('\n')) return null;
    destination = text.slice(cursor + 1, end);
    cursor = end + 1;
  } else {
    const begin = cursor;
    let parens = 0;
    while (cursor < text.length) {
      const char = text[cursor];
      if (char === '\\' && cursor + 1 < text.length) { cursor += 2; continue; }
      if (/\s/.test(char)) break;
      if (char === '(') parens += 1;
      else if (char === ')') {
        if (parens === 0) break;
        parens -= 1;
      }
      cursor += 1;
    }
    destination = text.slice(begin, cursor);
  }
  cursor = skipWhitespace(text, cursor);
  let title = null;
  if (text[cursor] === '"' || text[cursor] === "'" || text[cursor] === '(') {
    const closer = text[cursor] === '(' ? ')' : text[cursor];
    const end = text.indexOf(closer, cursor + 1);
    if (end < 0) return null;
    title = text.slice(cursor + 1, end);
    cursor = skipWhitespace(text, end + 1);
  }
  if (text[cursor] !== ')') return null;
  return {
    node: { type: 'link', href: safeSourceHref(destination), target: destination, title, children: parseSourceInline(text.slice(start + 1, close), { autolinks: false }) },
    end: cursor + 1,
  };
}

function tokenizeInline(text) {
  const nodes = [];
  let buffer = '';
  const flush = () => {
    if (buffer) nodes.push({ type: 'text', value: buffer });
    buffer = '';
  };
  let index = 0;
  while (index < text.length) {
    const char = text[index];
    if (char === '\\' && ESCAPABLE.has(text[index + 1])) {
      buffer += text[index + 1];
      index += 2;
      continue;
    }
    if (char === '`') {
      let run = 1;
      while (text[index + run] === '`') run += 1;
      const end = findCodeClose(text, index + run, run);
      if (end >= 0) {
        flush();
        nodes.push({ type: 'code', value: codeSpanText(text.slice(index + run, end)) });
        index = end + run;
      } else {
        buffer += '`'.repeat(run);
        index += run;
      }
      continue;
    }
    if (char === '<') {
      const br = /^<br[ \t]*\/?>/i.exec(text.slice(index, index + 8));
      if (br) {
        flush();
        nodes.push({ type: 'br' });
        index += br[0].length;
        continue;
      }
    }
    if (char === '[') {
      const link = parseLinkAt(text, index);
      if (link) {
        flush();
        nodes.push(link.node);
        index = link.end;
        continue;
      }
    }
    if (char === '*' || char === '_') {
      let run = 1;
      while (text[index + run] === char) run += 1;
      const before = charBefore(text, index);
      const after = charAfter(text, index + run);
      const left = !isWhitespace(after) && (!isPunctuation(after) || isWhitespace(before) || isPunctuation(before) || isCjk(before));
      const right = !isWhitespace(before) && (!isPunctuation(before) || isWhitespace(after) || isPunctuation(after) || isCjk(after));
      flush();
      nodes.push({
        type: 'delim', char, count: run, length: run,
        canOpen: char === '*' ? left : left && (!right || isPunctuation(before)),
        canClose: char === '*' ? right : right && (!left || isPunctuation(after)),
      });
      index += run;
      continue;
    }
    buffer += char;
    index += 1;
  }
  flush();
  return nodes;
}

const asText = node => (node.type === 'delim' ? { type: 'text', value: node.char.repeat(node.count) } : node);

function mergeText(nodes) {
  const merged = [];
  for (const node of nodes) {
    const previous = merged[merged.length - 1];
    if (node.type === 'text' && previous?.type === 'text') merged[merged.length - 1] = { type: 'text', value: previous.value + node.value };
    else if (node.type !== 'text' || node.value) merged.push(node);
  }
  return merged;
}

// CommonMark "process emphasis": closers look back for the nearest compatible opener,
// honoring the rule of three; unmatched runs stay literal text.
function resolveEmphasis(tokens) {
  const list = tokens.map(node => (node.type === 'delim' ? { ...node } : node));
  let closerIndex = 0;
  while (closerIndex < list.length) {
    const closer = list[closerIndex];
    if (closer.type !== 'delim' || !closer.canClose) { closerIndex += 1; continue; }
    let openerIndex = -1;
    for (let index = closerIndex - 1; index >= 0; index -= 1) {
      const opener = list[index];
      if (opener.type !== 'delim' || opener.char !== closer.char || !opener.canOpen) continue;
      const ruleOfThree = (opener.canClose || closer.canOpen)
        && (opener.length + closer.length) % 3 === 0
        && !(opener.length % 3 === 0 && closer.length % 3 === 0);
      if (ruleOfThree) continue;
      openerIndex = index;
      break;
    }
    if (openerIndex < 0) {
      if (!closer.canOpen) list[closerIndex] = asText(closer);
      closerIndex += 1;
      continue;
    }
    const opener = list[openerIndex];
    const used = opener.count >= 2 && closer.count >= 2 ? 2 : 1;
    opener.count -= used;
    closer.count -= used;
    const inner = mergeText(list.slice(openerIndex + 1, closerIndex).map(asText));
    list.splice(openerIndex + 1, closerIndex - openerIndex - 1, { type: used === 2 ? 'strong' : 'em', children: inner });
    closerIndex = openerIndex + 2;
    if (opener.count === 0) {
      list.splice(openerIndex, 1);
      closerIndex -= 1;
    }
    if (closer.count === 0) list.splice(closerIndex, 1);
  }
  return mergeText(list.map(asText));
}

function trimUrl(url) {
  let result = url;
  for (;;) {
    const last = result.slice(-1);
    if (last && '?!.,:*_~\'"'.includes(last)) { result = result.slice(0, -1); continue; }
    if (last === ')' && (result.match(/\)/g) || []).length > (result.match(/\(/g) || []).length) {
      result = result.slice(0, -1);
      continue;
    }
    return result;
  }
}

function autolink(nodes) {
  return nodes.flatMap(node => {
    if (node.type === 'em' || node.type === 'strong') return [{ ...node, children: autolink(node.children) }];
    if (node.type !== 'text') return [node];
    const out = [];
    let last = 0;
    for (const match of node.value.matchAll(BARE_URL_RE)) {
      const url = trimUrl(match[0]);
      const href = safeSourceHref(url);
      if (!href) continue;
      if (match.index > last) out.push({ type: 'text', value: node.value.slice(last, match.index) });
      out.push({ type: 'link', href, target: url, title: null, children: [{ type: 'text', value: url }] });
      last = match.index + url.length;
    }
    if (!out.length) return [node];
    if (last < node.value.length) out.push({ type: 'text', value: node.value.slice(last) });
    return out;
  });
}

export function parseSourceInline(text, { autolinks = true } = {}) {
  const nodes = resolveEmphasis(tokenizeInline(String(text ?? '')));
  return autolinks ? autolink(nodes) : nodes;
}

// ---------------------------------------------------------------------------------------
// Rendering

function renderText(value, key) {
  if (!value.includes('\n')) return value;
  return value.split('\n').flatMap((part, index) => (index === 0 ? [part] : [<br key={`${key}-br${index}`} />, part]));
}

function renderInline(nodes, key) {
  return nodes.map((node, index) => {
    const nodeKey = `${key}.${index}`;
    switch (node.type) {
      case 'text': return <React.Fragment key={nodeKey}>{renderText(node.value, nodeKey)}</React.Fragment>;
      case 'code': return <code key={nodeKey} className="source-md__code-inline">{node.value}</code>;
      case 'br': return <br key={nodeKey} />;
      case 'em': return <em key={nodeKey}>{renderInline(node.children, nodeKey)}</em>;
      case 'strong': return <strong key={nodeKey}>{renderInline(node.children, nodeKey)}</strong>;
      case 'link':
        return node.href
          ? <a key={nodeKey} className="source-md__link" href={node.href} title={node.title || undefined} target="_blank" rel="noopener noreferrer">{renderInline(node.children, nodeKey)}</a>
          : <span key={nodeKey} className="source-md__link-text">{renderInline(node.children, nodeKey)}<span className="source-md__link-target"> ({node.target})</span></span>;
      default: return null;
    }
  });
}

export function SourceInline({ text }) {
  return <>{renderInline(parseSourceInline(text), 'i')}</>;
}

function clampHeadingLevel(level) {
  const value = Number.isFinite(level) ? Math.round(level) : 4;
  return Math.max(MIN_HEADING_LEVEL, value);
}

// h3–h6, then role="heading" with the same aria-level. Never h1/h2.
export function SourceHeading({ level, id, className, focusable = false, children }) {
  const safeLevel = clampHeadingLevel(level);
  const props = { id, className, ...(focusable ? { tabIndex: -1 } : {}) };
  if (safeLevel <= 6) return React.createElement(`h${safeLevel}`, props, children);
  return <div role="heading" aria-level={safeLevel} {...props}>{children}</div>;
}

const alignStyle = align => (align ? { textAlign: align } : undefined);

function renderTable(block, key) {
  const columns = Math.max(block.header.length, ...block.rows.map(row => row.length));
  const pad = cells => [...cells, ...Array.from({ length: Math.max(0, columns - cells.length) }, () => '')];
  return <div key={key} className="source-md__table-wrap" role="group" aria-label="표" tabIndex={0}>
    <table className="source-md__table" style={{ '--source-md-cols': columns }}>
      <thead>
        <tr>{pad(block.header).map((cell, index) => <th key={index} scope="col" style={alignStyle(block.align[index])}>{renderInline(parseSourceInline(cell), `${key}.h${index}`)}</th>)}</tr>
      </thead>
      <tbody>
        {block.rows.map((row, rowIndex) => <tr key={rowIndex}>
          {pad(row).map((cell, index) => <td key={index} style={alignStyle(block.align[index])}>{renderInline(parseSourceInline(cell), `${key}.r${rowIndex}.${index}`)}</td>)}
        </tr>)}
      </tbody>
    </table>
  </div>;
}

function renderBlocks(blocks, context, key) {
  return blocks.map((block, index) => {
    const blockKey = `${key}.${index}`;
    switch (block.type) {
      case 'heading': {
        const id = block.line != null && context.anchorFor ? context.anchorFor(block.line) : undefined;
        return <SourceHeading key={blockKey} level={context.headingLevel(block.level)} id={id} className="source-md__heading" focusable={Boolean(id) && context.focusableHeadings}>
          {renderInline(parseSourceInline(block.text), blockKey)}
        </SourceHeading>;
      }
      case 'paragraph':
        return <p key={blockKey}>{renderInline(parseSourceInline(block.text), blockKey)}</p>;
      case 'blockquote':
        return <blockquote key={blockKey}>{renderBlocks(block.children, context, blockKey)}</blockquote>;
      case 'list': {
        const items = block.items.map((item, itemIndex) => {
          const itemKey = `${blockKey}.${itemIndex}`;
          const [head, ...rest] = item.children;
          if (!block.loose && head?.type === 'paragraph') {
            return <li key={itemKey}>{renderInline(parseSourceInline(head.text), itemKey)}{renderBlocks(rest, context, itemKey)}</li>;
          }
          return <li key={itemKey}>{renderBlocks(item.children, context, itemKey)}</li>;
        });
        return block.ordered
          ? <ol key={blockKey} start={block.start !== 1 ? block.start : undefined}>{items}</ol>
          : <ul key={blockKey}>{items}</ul>;
      }
      case 'table':
        return renderTable(block, blockKey);
      case 'code':
        return <pre key={blockKey} className="source-md__code" tabIndex={0} data-lang={block.lang || undefined}><code>{block.text}</code></pre>;
      case 'hr':
        return <hr key={blockKey} />;
      default:
        return null;
    }
  });
}

const defaultHeadingLevel = level => level + 3;

// markdown: verbatim text. lineOffset: its first line's number in the source document, so
// anchorFor(line) can give top-level headings stable ids. headingLevel(docLevel) → rendered
// level (clamped to ≥ 3; the reader passes levels below its own title).
export function SourceMarkdown({ markdown, lineOffset = 1, headingLevel = defaultHeadingLevel, anchorFor, focusableHeadings = false, className }) {
  const blocks = parseSourceMarkdown(markdown, { lineOffset });
  return <div className={['source-md', className].filter(Boolean).join(' ')}>
    {renderBlocks(blocks, { headingLevel, anchorFor, focusableHeadings }, 'b')}
  </div>;
}
