export const STUDIO_CHANNELS = [
  { key: 'threads', label: 'Threads', type: 'threads_post' },
  { key: 'instagram', label: 'Instagram · 카드뉴스', type: 'card_news' },
  { key: 'youtube_shorts', label: 'YouTube Shorts', type: 'reels_script' },
  { key: 'blog', label: '블로그', type: 'blog_insight' },
  { key: 'x', label: 'X', type: 'x_thread' },
  { key: 'reels', label: 'Instagram Reels', type: 'reels_script' },
  { key: 'email', label: '뉴스레터', type: 'newsletter' },
];
export const BRIEF_FIELDS = [
  { key: 'audience', label: '누구에게', placeholder: '예: 수업 후 복습을 어려워하는 강사' },
  { key: 'purpose', label: '글의 목적', placeholder: '읽은 뒤 어떤 생각이나 행동이 달라질까요?' },
  { key: 'message', label: '핵심 메시지', placeholder: '이번 콘텐츠가 전할 한 문장' },
  { key: 'angle', label: '관점', placeholder: '경험담, 오해 바로잡기, 비교 등' },
  { key: 'evidence', label: '근거와 사례', placeholder: '확인된 경험·자료·링크. 없는 사실은 비워두세요.' },
  { key: 'ending', label: '마무리', placeholder: '독자에게 남길 질문이나 다음 행동' },
];
export function emptyStudioDraft(brandId = '') {
  return {
    contentId: null, variantId: null, workspaceId: null, itemUpdatedAt: null, variantUpdatedAt: null,
    title: '', variantTitle: '', sourceIdea: '', brandId,
    brief: Object.fromEntries(BRIEF_FIELDS.map(({ key }) => [key, ''])),
    nextAction: '', blocker: '', body: '', variantType: 'threads_post', channel: 'threads', status: 'draft', sourceRefs: [],
  };
}
export const formatForChannel = (channel) => STUDIO_CHANNELS.find((v) => v.key === channel)?.type || 'x_thread';
export const channelLabel = (channel) => STUDIO_CHANNELS.find((v) => v.key === channel)?.label || channel;
export const channelForType = (type) => ({ threads_post: 'threads', card_news: 'instagram', reels_script: 'reels', blog: 'blog', blog_insight: 'blog', landing_copy: 'blog', newsletter: 'email' })[type] || 'x';
export function draftFromDetail({ item, variants }, variantId) {
  if (!item?.id) throw new Error('콘텐츠를 찾을 수 없습니다.');
  const candidates = (variants || []).filter((variant) => variant.content_id === item.id);
  const targetId = variantId || item.meta?.primary_variant_id;
  const variant = targetId ? candidates.find((row) => row.id === targetId) :
    [...candidates].sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)) || a.id.localeCompare(b.id))[0];
  if (!variant && (variantId || candidates.length)) throw new Error('선택한 결과물을 찾을 수 없습니다. 콘텐츠 큐에서 다시 열어주세요.');
  const selected = variant || { id: null, variant_type: 'threads_post', channel: 'threads' };
  return {
    ...emptyStudioDraft(), contentId: item.id, workspaceId: item.workspace_id, variantId: selected.id,
    itemUpdatedAt: item.updated_at, variantUpdatedAt: selected.updated_at || null,
    title: item.title || '', variantTitle: selected.title || '', sourceIdea: item.source_idea || '',
    brandId: item.brand_id || '', brief: { ...emptyStudioDraft().brief, ...item.meta?.brief },
    nextAction: item.next_action || '', blocker: item.meta?.blocker || '', body: selected.body || '',
    variantType: selected.variant_type, channel: selected.channel || channelForType(selected.variant_type),
    status: selected.status || 'draft', sourceRefs: selected.meta?.source_refs || [],
  };
}
export function buildStudioSave(draft, requestId, checkpoint = false) {
  return {
    action: 'save', requestId, contentId: draft.contentId, variantId: draft.variantId,
    expectedItemUpdatedAt: draft.itemUpdatedAt, expectedVariantUpdatedAt: draft.variantUpdatedAt,
    item: {
      title: draft.title, sourceIdea: draft.sourceIdea, brandId: draft.brandId || null,
      brief: draft.brief, nextAction: draft.nextAction, blocker: draft.blocker,
    },
    variant: { title: draft.variantTitle, body: draft.body, variantType: draft.variantType, channel: draft.channel }, checkpoint,
  };
}
export function studioFingerprint(draft) {
  const { item, variant } = buildStudioSave(draft, '');
  return JSON.stringify({ item, variant });
}
export const isDurableStudioSave = (result) => Boolean(['saved', 'duplicate'].includes(result?.status) && result.item?.id && result.variant?.id);
export function acknowledgeStudioSave(current, sent, result) {
  if (!isDurableStudioSave(result)) throw new Error('저장이 확인되지 않았습니다.');
  return {
    draft: {
      ...current, contentId: result.item.id, variantId: result.variant.id, workspaceId: result.item.workspace_id,
      itemUpdatedAt: result.item.updated_at, variantUpdatedAt: result.variant.updated_at,
      status: result.variant.status || 'draft', sourceRefs: result.variant.meta?.source_refs || [],
    },
    dirty: studioFingerprint(current) !== studioFingerprint(sent),
  };
}
export function selectSource(body, start = 0, end = body.length) {
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end > body.length) throw new Error('선택 범위를 확인해주세요.');
  if (start === end) { start = 0; end = body.length; }
  return { start, end, text: body.slice(start, end), prefix: body.slice(0, start), suffix: body.slice(end) };
}
export const previewCandidate = (source, candidate) => (source.prefix || '') + candidate.body + (source.suffix || '');
export function isTransformStale(run, draft) {
  const source = run?.source_snapshot || run?.sourceSnapshot;
  return !source || source.variantId !== draft.variantId || source.body !== draft.body || source.variantUpdatedAt !== draft.variantUpdatedAt ||
    Boolean(source.itemUpdatedAt && source.itemUpdatedAt !== draft.itemUpdatedAt);
}
export function studioMirrorKey({ workspaceId, contentId, variantId, draftKey = 'active' }) {
  return ['v2', workspaceId || 'default', contentId || 'new', variantId || draftKey].join(':');
}
export function parseStudioStructure(body, type) {
  const key = type === 'card_news' ? 'slides' : type === 'reels_script' ? 'scenes' : null;
  if (!key) return null;
  if (!body.trim()) return { [key]: [] };
  try {
    const parsed = JSON.parse(body);
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed[key]) ||
        parsed[key].some((entry) => !entry || typeof entry !== 'object' || Array.isArray(entry))) throw new Error();
    return parsed;
  } catch { throw new Error('저장된 구조를 읽을 수 없습니다. 원본 JSON을 확인하고 수정해주세요.'); }
}
export function exportStudioVariant(draft) {
  const structured = parseStudioStructure(draft.body, draft.variantType);
  const extension = structured ? 'json' : 'txt';
  const name = (draft.variantTitle || draft.title || '콘텐츠').replace(/[\\/:*?"<>|]/g, '-').slice(0, 80);
  return { text: structured ? JSON.stringify(structured, null, 2) : draft.body, extension, mime: structured ? 'application/json' : 'text/plain', filename: name + '.' + extension };
}
export function studioTextForCopy(draft) {
  const data = parseStudioStructure(draft.body, draft.variantType);
  if (data?.slides) return data.slides.map((slide, i) => [String(i + 1), slide.title, slide.sub].filter(Boolean).join('\n')).join('\n\n');
  if (data?.scenes) return data.scenes.map((scene, i) => [
    '장면 ' + (i + 1) + (scene.duration ? ' · ' + scene.duration + '초' : ''),
    scene.visual && '화면: ' + scene.visual, scene.spoken && '대사: ' + scene.spoken,
    scene.subtitle && '자막: ' + scene.subtitle, scene.notes && '제작 메모: ' + scene.notes,
  ].filter(Boolean).join('\n')).join('\n\n');
  return draft.body;
}
const STUDIO_ERRORS = {
  'version-conflict': '다른 곳에서 수정한 내용이 있습니다. 최신 저장본을 확인한 뒤 이어서 편집해주세요.',
  'stale-source': 'AI 생성 이후 원문이 바뀌었습니다. 현재 내용으로 다시 생성해주세요.',
  'request-conflict': '이 요청의 저장 상태가 달라졌습니다. 최신 저장본을 확인해주세요.',
  'missing-api-key': 'AI 연결이 설정되지 않았습니다. 직접 편집과 저장은 계속할 수 있습니다.',
  'not-found': '콘텐츠를 찾을 수 없습니다. 콘텐츠 큐에서 다시 열어주세요.',
  'invalid-channel-format': '결과물 형식과 채널이 맞지 않습니다.',
  'payload-too-large': '내용이 너무 깁니다. 콘텐츠를 나누어 저장해주세요.',
};
export function studioErrorMessage(result, fallback = '처리하지 못했습니다. 작성한 내용은 유지됩니다. 다시 시도해주세요.') {
  if (result?.status === 'preview') return '서버 저장이 연결되지 않았습니다. 이 브라우저의 복구 사본으로 보관합니다.';
  if (result?.status === 'conflict') return STUDIO_ERRORS['version-conflict'];
  return STUDIO_ERRORS[result?.error] || fallback;
}
