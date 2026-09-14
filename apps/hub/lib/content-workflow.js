export const STUDIO_VARIANT_MODES = { threads_post: "threads", blog: "blog", blog_insight: "blog", card_news: "carousel" };

export function studioVariantMode(type) {
  return STUDIO_VARIANT_MODES[type] || null;
}

export function contentStatusKey(item) {
  return String(item?.statusKey || item?.status || "").toLowerCase();
}

export function contentQueueScope(queue, brandFilter = "all") {
  return brandFilter === "all" ? queue : queue.filter((item) => item.brandId === brandFilter || item.brandKey === brandFilter);
}

export function contentQueueTabs(queue) {
  return [
    ["all", "전체"], ["idea", "소재함"], ["draft", "제작중"],
    ["review", "검토"], ["scheduled", "전달됨"], ["published", "발행 기록"],
  ].map(([key, label]) => ({ key, label, count: key === "all" ? queue.length : queue.filter((item) => contentStatusKey(item) === key).length }));
}

export function manualPublicationFields(targetUrl, localDate, now = Date.now()) {
  const urlText = String(targetUrl || "").trim();
  let url;
  try { url = new URL(urlText); } catch { /* report below */ }
  if (!url || !["http:", "https:"].includes(url.protocol) || url.username || url.password)
    throw new Error("발행한 게시물의 http 또는 https URL을 입력해 주세요.");
  const date = new Date(localDate);
  if (!localDate || !Number.isFinite(date.getTime()) || date.getTime() > now + 60000)
    throw new Error("유효한 과거 발행 일시를 입력해 주세요.");
  return { targetUrl: urlText, publishedAt: date.toISOString() };
}

export function publicationIsVerified(ledger, command) {
  const log = ledger.publishLogs?.find(entry => entry.id === command.logId);
  const item = ledger.items?.find(entry => entry.id === command.contentId);
  const variant = ledger.variants?.find(entry => entry.id === command.variantId);
  return ledger.source === "supabase" && log?.contentId === command.contentId &&
    log.variantId === command.variantId && log.status === "published" && log.provider === "manual" &&
    log.event === "operator_published" && log.provenance === "operator_confirmed" &&
    log.targetUrl === command.targetUrl && Date.parse(log.publishedAt) === Date.parse(command.publishedAt) &&
    item?.status === "published" && variant?.status === "published";
}
