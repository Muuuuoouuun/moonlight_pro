export async function fetchGuruArticle(id, fetchImpl = fetch, { signal } = {}) {
  const response = await fetchImpl(`/api/hub/guidance-articles/${encodeURIComponent(id)}`, {
    cache: 'no-store',
    signal,
  });
  const data = await response.json();
  if (!response.ok || data?.status !== 'ok' || data.id !== id || typeof data.markdown !== 'string' || !data.markdown.startsWith('# ')) {
    throw new Error('글을 읽지 못했습니다. 잠시 후 다시 시도해주세요.');
  }
  return data;
}
