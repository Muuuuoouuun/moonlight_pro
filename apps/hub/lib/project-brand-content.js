// Content is brand-scoped reference material, not a project_id relationship.
export function readProjectBrandContentEnvelope(data, ok = true) {
  if (!ok || !data || data.status === 'error' || data.source === 'error') return { state: 'error', items: [] };
  if (data.source === 'preview' && data.status === 'preview') return { state: 'preview', items: [] };
  if (data.source !== 'supabase' || !['live', 'partial'].includes(data.status) || !Array.isArray(data.items)) {
    return { state: 'error', items: [] };
  }
  return { state: data.status === 'partial' || data.partial ? 'partial' : 'live', items: data.items };
}

export function selectProjectBrandContent(items, brandId) {
  if (!brandId) return [];
  return items.filter(item => item.brandId === brandId).slice(0, 5);
}

export function projectBrandContentMessage(state, hasBrand) {
  if (!hasBrand) return '브랜드가 지정되지 않아 콘텐츠를 묶어 볼 수 없어요.';
  if (state === 'idle' || state === 'loading') return '같은 브랜드의 콘텐츠를 불러오는 중이에요.';
  if (state === 'error') return '콘텐츠를 읽지 못했어요. 표시된 항목이 있다면 이전 조회 결과입니다.';
  if (state === 'preview') return '콘텐츠 저장소가 연결되지 않아 실제 기록을 확인할 수 없어요.';
  if (state === 'partial') return '콘텐츠 기록을 일부만 확인했어요. 불러온 항목 안에서 표시합니다.';
  return '';
}
