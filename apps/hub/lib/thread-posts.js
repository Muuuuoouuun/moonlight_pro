// Threads 연결 글 경계 — 빈 줄(공백만 있는 줄 포함)이 글을 나눈다.
// 미리보기(ResultPreview)·엔진 계약('Blank lines separate thread blocks')·올리기 서버가 같은 규칙을 쓴다.
// 편집기는 구분자를 그대로 보존해 본문 ↔ 블록 왕복이 바이트 단위로 같다(선택 영역 오프셋이 어긋나지 않게).
export const THREADS_POST_LIMIT = 500;
export const THREADS_MAX_POSTS = 10;
const SEPARATOR = /(\n\s*\n)/;
const SEPARATOR_TEST = /\n\s*\n/;

/** 글자 수 — 코드 포인트 기준(이모지 하나가 둘로 세지지 않게). */
export const postLength = (text) => [...String(text || '')].length;

/** 본문 → { parts, seps }. parts.length === seps.length + 1. 빈 본문은 빈 블록 하나. */
export function threadBlocks(body = '') {
  const pieces = String(body).split(SEPARATOR);
  const parts = [], seps = [];
  pieces.forEach((piece, index) => (index % 2 === 0 ? parts : seps).push(piece));
  return { parts, seps };
}

export function joinThreadBlocks({ parts, seps }) {
  return parts.reduce((body, part, index) => body + (index ? (seps[index - 1] ?? '\n\n') : '') + part, '');
}

/** 각 블록의 본문 안 시작 위치(선택 영역을 본문 기준으로 바꿀 때). blocks는 threadBlocks의 결과. */
export function threadBlockOffsets(blocks) {
  const offsets = [];
  let at = 0;
  blocks.parts.forEach((part, index) => { offsets.push(at); at += part.length + (blocks.seps[index]?.length || 0); });
  return offsets;
}

/**
 * 블록 하나를 고친다. 고친 값에 빈 줄이 생기면(Enter 두 번·붙여넣기) 그 자리에서 블록이 나뉜다.
 * 가운데 빈 블록은 본문에서는 빈 줄 하나로 합쳐지므로 편집기가 blocks를 상태로 들고 있다 — 본문은 언제나 join(blocks).
 * caret은 고친 값 안의 커서 위치 — 돌려주는 focus는 커서가 놓일 블록과 그 안의 위치다.
 */
export function replaceThreadBlock(blocks, index, value, caret = value.length) {
  const inner = threadBlocks(value);
  const parts = [...blocks.parts.slice(0, index), ...inner.parts, ...blocks.parts.slice(index + 1)];
  const seps = [...blocks.seps.slice(0, index), ...inner.seps, ...blocks.seps.slice(index)];
  let at = 0, focusIndex = index, focusCaret = caret;
  for (let i = 0; i < inner.parts.length; i += 1) {
    const end = at + inner.parts[i].length;
    if (caret <= end || i === inner.parts.length - 1) { focusIndex = index + i; focusCaret = Math.max(0, Math.min(caret - at, inner.parts[i].length)); break; }
    at = end + inner.seps[i].length;
  }
  return { blocks: { parts, seps }, focusIndex, focusCaret, split: inner.parts.length > 1 };
}

/** 블록 맨 앞에서 Backspace — 앞 블록과 한 줄바꿈으로 잇는다(둘 중 하나가 비면 그냥 붙인다). */
export function mergeThreadBlockWithPrevious(blocks, index) {
  if (index <= 0) return null;
  const { parts, seps } = blocks;
  const previous = parts[index - 1];
  const joiner = previous && parts[index] ? '\n' : '';
  return {
    blocks: { parts: [...parts.slice(0, index - 1), previous + joiner + parts[index], ...parts.slice(index + 1)], seps: [...seps.slice(0, index - 1), ...seps.slice(index)] },
    focusIndex: index - 1, focusCaret: previous.length + joiner.length,
  };
}

/** 올릴 글 목록 — 앞뒤 공백을 걷고 빈 블록은 뺀다. 서버가 저장된 본문에서 같은 함수로 다시 만든다. */
export function threadPostsForPublish(body = '') {
  return threadBlocks(body).parts.map((part) => part.trim()).filter(Boolean);
}

/** 올리기를 막는 이유(빨강) — 없으면 빈 배열. */
export function threadPublishIssues(posts) {
  const issues = [];
  if (!posts.length) issues.push({ code: 'empty', message: '올릴 글이 비어 있어요' });
  if (posts.length > THREADS_MAX_POSTS) issues.push({ code: 'too-many', message: `연결 글은 ${THREADS_MAX_POSTS}개까지 올릴 수 있어요` });
  const over = posts.map((post, index) => ({ index, length: postLength(post) })).filter(({ length }) => length > THREADS_POST_LIMIT);
  if (over.length) issues.push({ code: 'over-limit', indexes: over.map(({ index }) => index), message: `연결 글 ${over.length}개가 ${THREADS_POST_LIMIT}자를 넘어요 — 나눠야 올라가요` });
  return issues;
}

export const hasThreadSeparator = (value) => SEPARATOR_TEST.test(value);
