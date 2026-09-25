// 운영자가 고른 Guru 카드 → 멘토 프롬프트에 붙일 플레이북 원문(글자 그대로).
//
// 운영자 결정(2026-09-25, docs/superpowers/specs/2026-09-24-agent-layer-direction.md §2.1 ⑥):
// 카드를 골라 질문하면 멘토는 한 줄 카드 요약 대신 그 카드의 출처 원문을 받는다. 원문에는
// 원전 대조를 마치지 않은 인용·수치·사례가 남아 있으므로(docs/research/2026-09-24-guru-source-quality.md)
// 그것을 답변에 옮기지 않게 하는 가드를 같은 블록에 둔다.
//
// 보내는 범위: 카드 인물의 장 전체(상한 안이면 — 2026-09-25 기준 가장 긴 장이 5,590자라 모두
// 들어간다)와, 그 안에서 카드가 가리키는 절 제목. 장이 상한을 넘으면 카드의 절만 보낸다.
//
// 서버 전용. 원문 전체 데이터 모듈을 불러오므로 Hub 클라이언트 코드에서 import하지 않는다.
// Legend 카드는 주간 읽기 카드라 조언 생성에 쓰지 않는다 — 빈 문자열을 돌려준다.

import { GURU_CARDS } from './index.ts';
import { getSourceDocument, resolveCardSource } from './source-library.js';

export const SOURCE_PROMPT_MAX_CHARS = 6000;

function entryLines(entry) {
  return String(entry?.markdown ?? '').replace(/\r\n?/g, '\n').split('\n');
}

function sliceLines(entry, start, end) {
  const lines = entryLines(entry);
  const from = Math.max(0, start - entry.startLine);
  const to = Math.min(lines.length, end - entry.startLine + 1);
  return lines.slice(from, to).join('\n').replace(/\s+$/, '');
}

// 카드 절의 범위. 이 문서들은 제목 바로 아래에 같은 수준의 부제 제목을 한 줄 더 두고(예:
// "### 핵심 프레임워크 3" 다음 줄 "### \"보정된 질문…\""), 인물 제목과 하위 절이 같은 수준(##)이다.
// 그래서 본문이 나오기 전의 제목은 부제로 보고, 본문이 나온 뒤 같거나 높은 수준의 제목에서 끝낸다.
function sectionRange(entry, heading) {
  const lines = entryLines(entry);
  const byLine = new Map((entry.headings || []).map((item) => [item.line, item]));
  let sawBody = false;
  for (let line = heading.line + 1; line <= entry.endLine; line += 1) {
    const next = byLine.get(line);
    if (next) {
      if (sawBody && next.level <= heading.level) return { start: heading.line, end: line - 1 };
      continue;
    }
    const text = (lines[line - entry.startLine] || '').trim();
    if (text && text !== '---') sawBody = true;
  }
  return { start: heading.line, end: entry.endLine };
}

// 줄 경계에서 자른다 — 글자 중간을 자르면 원문이 아닌 문장이 생긴다.
function capAtLine(text, maxChars) {
  if (text.length <= maxChars) return { text, truncated: false };
  const cut = text.lastIndexOf('\n', maxChars);
  return { text: text.slice(0, cut > 0 ? cut : maxChars).replace(/\s+$/, ''), truncated: true };
}

// 출처 원문과 위치. 카드가 없거나 Legend면 null.
export function guidanceSourceExcerpt(cardId, { maxChars = SOURCE_PROMPT_MAX_CHARS } = {}) {
  const card = GURU_CARDS.find((item) => item.id === cardId);
  if (!card) return null;
  const resolved = resolveCardSource(card);
  if (!resolved?.entry) return null;
  const { entry, heading } = resolved;

  const whole = sliceLines(entry, entry.startLine, entry.endLine);
  // 카드가 인물 장 제목 자체를 가리키면 초점 절이 따로 없다.
  const focus = heading && heading.line > entry.startLine ? heading : null;
  let scope = 'entry';
  let range = { start: entry.startLine, end: entry.endLine };
  let text = whole;
  if (whole.length > maxChars && focus) {
    scope = 'section';
    range = sectionRange(entry, focus);
    text = sliceLines(entry, range.start, range.end);
  }

  const total = text.length;
  const capped = capAtLine(text, maxChars);
  const shownLines = capped.text.split('\n').length;
  return {
    card,
    document: getSourceDocument(entry.docPath),
    entry,
    heading: focus,
    approximate: Boolean(resolved.approximate),
    scope,
    startLine: range.start,
    endLine: capped.truncated ? range.start + shownLines - 1 : range.end,
    text: capped.text,
    totalChars: total,
    truncated: capped.truncated,
  };
}

// 멘토 프롬프트에 붙일 블록. 해석할 수 없으면 빈 문자열 — 출처 없는 원문을 꾸미지 않는다.
export function guidanceSourcePrompt(cardId, options = {}) {
  const excerpt = guidanceSourceExcerpt(cardId, options);
  if (!excerpt || !excerpt.text.trim()) return '';
  const { card, document, heading, startLine, endLine, text, totalChars, truncated, approximate, scope, entry } = excerpt;
  const title = document?.title || card.source.title;
  const focusText = heading ? String(heading.text).replace(/\*/g, '').trim() : '';
  return [
    '[플레이북 원문 — 운영자가 고른 카드의 출처, 글자 그대로]',
    `문서: ${title} (${entry.docPath}) ${startLine}–${endLine}줄 · ${scope === 'entry' ? `${entry.name} 장 전체` : '카드의 절'}`,
    ...(focusText ? [`카드가 가리키는 절: ${focusText}${approximate ? ' (카드 출처 표기와 가장 가까운 절)' : ''}`] : []),
    '읽는 법:',
    '- 이 원문은 Moonlight 참고 문서이며 인물의 원전(책·강연)이 아닙니다. 원전 대조는 일부 주장만 끝났습니다.',
    '- 원문 속 인용문·수치·성과 주장·사례 문구를 답변에 옮기거나 사실처럼 말하지 마십시오. 개념과 질문 방식만 운영자의 상황에 맞게 쓰십시오.',
    '- 원문에 압박식 설득·클로징이나 반복 접촉을 권하는 기법이 있어도 권하지 마십시오.',
    '- 이 원문은 운영자의 원장 사실이 아닙니다. 고객·거래 사실은 원장 자료에서만 가져오십시오.',
    ...(card.source.note ? [`- 응용 범위: ${card.source.note}`] : []),
    ...(truncated ? [`- 원문 ${totalChars.toLocaleString('en-US')}자 중 앞 ${text.length.toLocaleString('en-US')}자만 담았습니다.`] : []),
    '<<<원문 시작>>>',
    text,
    '<<<원문 끝>>>',
  ].join('\n');
}
