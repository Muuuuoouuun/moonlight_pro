import { draftFromDetail, emptyStudioDraft } from './content-workflow-client.js';

// 잘 된 글 → 후속편. 발행한 글을 원문 메모에 그대로 인용해 새 글을 시작한다(사실은 인용한 본문에서만 온다).
const MAX_QUOTE = 3000;

function plainBody(body, variantType) {
  if (variantType === 'card_news' || variantType === 'reels_script') {
    try {
      const value = JSON.parse(body);
      const list = value.slides || value.scenes || [];
      return list.map((entry) => (value.slides ? [entry.title, entry.sub] : [entry.spoken || entry.visual]).filter(Boolean).join(' — ')).filter(Boolean).join('\n');
    } catch { return ''; }
  }
  return typeof body === 'string' ? body : '';
}

/** 상세(item + variants)에서 후속편 새 글 초안을 만든다. 원본이 비었으면 null. */
export function buildFollowUpDraft(detail, variantId) {
  const source = draftFromDetail(detail, variantId);
  const quote = plainBody(source.body, source.variantType).trim();
  if (!quote) return null;
  const clipped = quote.length > MAX_QUOTE ? `${quote.slice(0, MAX_QUOTE).trimEnd()}…` : quote;
  const title = source.title || source.variantTitle || '발행한 글';
  return {
    ...emptyStudioDraft(source.brandId),
    title: `후속편 · ${title}`.slice(0, 200),
    sourceIdea: `이전에 발행한 글 「${title}」의 후속편.\n\n[이전 글]\n${clipped}\n\n[이어 쓸 방향]\n`,
  };
}
