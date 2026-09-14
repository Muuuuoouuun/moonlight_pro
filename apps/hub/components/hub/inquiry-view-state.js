export const INQUIRY_KINDS = { sales: '영업', support: '지원', partnership: '제휴', general: '일반' };
export const INQUIRY_STATUSES = { new: '새 문의', in_progress: '처리 중', waiting: '답변 대기', closed: '처리 완료', ignored: '제외' };
export const INQUIRY_SCOPES = { all: '전체', classin: 'ClassIn', personal: '개인', unclassified: '미분류' };
export const INQUIRY_SOURCES = { all: '모든 경로', gmail: '메일', webhook: '랜딩페이지', manual: '직접 등록' };
export const optionsFor = (map) => Object.entries(map).map(([value, label]) => ({ value, label }));
export function inquiryReadState(data) {
  if (data?.status === 'live' && Array.isArray(data.rows) && Number.isSafeInteger(data.unreadCount)) return data;
  return { status: data?.status === 'preview' ? 'preview' : 'error', rows: [], unreadCount: null, total: null, error: data?.error };
}
export function inquirySeenSequence(detail) {
  if (detail?.status !== 'live' || !detail.events?.length) return null;
  const max = Math.max(...detail.events.map(e => Number(e.inbound_seq) || 0));
  return Math.min(max, Number(detail.inquiry?.last_inbound_seq) || 0);
}
export const inquirySaved = (data) => ['saved', 'duplicate'].includes(data?.status);
export function safeInquiryUrl(value) {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : null; } catch { return null; }
}
export const inquiryTime = (value) => value && Number.isFinite(Date.parse(value))
  ? new Date(value).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Seoul' }) : '기록 없음';
export function notifyInquiriesChanged() { window.dispatchEvent(new Event('moonlight:inquiries-changed')); }
export async function writeInquiry(command) {
  const r = await fetch('/api/hub/inquiries', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(command) });
  const data = await r.json().catch(() => null);
  if (!r.ok || !inquirySaved(data)) {
    const error = new Error(data?.status === 'conflict' ? '다른 변경이 있습니다. 새로 불러온 뒤 다시 저장해 주세요.'
      : data?.status === 'preview' ? '문의 저장 연결이 아직 준비되지 않았습니다.' : '저장하지 못했습니다. 입력은 유지됩니다. 다시 시도해 주세요.');
    error.code = data?.status;
    throw error;
  }
  notifyInquiriesChanged();
  return data;
}
