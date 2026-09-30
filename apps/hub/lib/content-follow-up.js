import { buildStudioSave, draftFromDetail, emptyStudioDraft, isDurableStudioSave } from './content-workflow-client.js';

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

// 응답이 유실된 새 글은 같은 명령으로 확인한다. 렌더 전 연속 클릭도 한 요청을 공유한다.
export function createFollowUpStarter({ read, save, requestId = () => crypto.randomUUID() }) {
  const pending = new Map();
  const completed = new Map();
  let inFlight = null;
  return (row) => {
    if (inFlight) return inFlight;
    const key = `${row.contentId}:${row.variantId}`;
    if (completed.has(key)) return Promise.resolve(completed.get(key));
    inFlight = (async () => {
      let command = pending.get(key);
      if (!command) {
        const detail = await read(row.contentId);
        if (detail?.status !== 'live') throw new Error('원본 글을 불러오지 못했어요.');
        const draft = buildFollowUpDraft(detail, row.variantId);
        if (!draft) throw new Error('본문이 비어 있어 이어 쓸 수 없어요.');
        command = buildStudioSave(draft, requestId());
        pending.set(key, command);
      }
      const result = await save(command);
      if (!isDurableStudioSave(result)) throw new Error('새 글 저장을 확인하지 못했어요. 같은 요청으로 다시 확인해 주세요.');
      pending.delete(key);
      completed.set(key, result);
      return result;
    })().finally(() => { inFlight = null; });
    return inFlight;
  };
}
