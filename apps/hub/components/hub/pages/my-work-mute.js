// 내 작업 행 숨기기 — "오늘 안 보기"(내일 자동 복귀)와 "아예 안 보기"(무기한)의 순수 로직.
//
// 왜 원장이 아니라 로컬 저장인가: 이 숨김은 **이 표면의 보기 설정**이지 원장 사실이 아니다.
// 운영자 요청은 "할 일 항목(내 작업 목록)에서만 안 보이게"였고, 딜 자체를 파이프라인에서
// 걷어내는 durable 숨김은 이미 deals.hidden_at(Revenue 보드의 '파이프라인에서 숨기기')이
// 따로 있다. 그래서 레인·기한·정렬 설정과 같은 localStorage 계층(mlp.mywork.*)에 둔다 —
// 원장에 아무것도 쓰지 않으므로 완료·기한 기록이 이 조작으로 왜곡되지 않는다.
// 대가는 브라우저 단위 저장(기기 간 공유 없음)이다. 서버로 올릴 일이 생기면 저장 형태
// { id: { until, at, lane, title } }는 그대로 두고 read/write 두 함수만 갈아끼우면 된다.
//
// until 의미: 'YYYY-MM-DD' = 그날(KST)까지 숨김 — 다음 날 자동 복귀. null = 무기한.

export const MUTE_STORAGE_KEY = 'mlp.mywork.muted';
// 오래된 무기한 항목이 무한정 쌓이지 않도록 상한 — 넘으면 오래 전에 숨긴 것부터 버린다.
export const MUTE_LIMIT = 300;

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

// KST 기준 날짜 키 — 페이지의 다른 날짜 경계(nextDeferTarget·rescheduleTask)와 같은 규칙.
export function seoulDayKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(date);
}

export function isMutedEntry(entry, todayKey) {
  if (!entry || typeof entry !== 'object') return false;
  if (entry.until === null || entry.until === undefined) return true; // 무기한
  if (!DAY_KEY.test(entry.until)) return false; // 손상된 값은 숨김으로 인정하지 않는다
  return todayKey <= entry.until;
}

// 만료된 '오늘만' 항목을 걷어낸 새 맵. 바뀐 게 없으면 같은 참조를 돌려준다(렌더 안정).
export function pruneMuted(entries, todayKey) {
  const source = entries && typeof entries === 'object' ? entries : {};
  const next = {};
  let changed = false;
  Object.keys(source).forEach((id) => {
    const entry = source[id];
    if (isMutedEntry(entry, todayKey)) next[id] = entry;
    else changed = true;
  });
  return changed ? next : source;
}

export function mutedIdSet(entries, todayKey) {
  const out = new Set();
  const source = entries && typeof entries === 'object' ? entries : {};
  Object.keys(source).forEach((id) => { if (isMutedEntry(source[id], todayKey)) out.add(id); });
  return out;
}

// mode: 'today' | 'forever'. item은 attention 행 — id 외의 필드는 '숨김 관리' 목록이
// 원장에서 사라진 항목도 이름으로 보여줄 수 있게 남긴다.
export function applyMute(entries, item, mode, now = new Date()) {
  if (!item?.id) return entries || {};
  const todayKey = seoulDayKey(now);
  const pruned = pruneMuted(entries, todayKey);
  const next = {
    ...pruned,
    [item.id]: {
      until: mode === 'forever' ? null : todayKey,
      at: now.toISOString(),
      lane: item.lane || '',
      title: item.title || '',
    },
  };
  const ids = Object.keys(next);
  if (ids.length <= MUTE_LIMIT) return next;
  const keep = ids
    .sort((a, b) => String(next[b].at || '').localeCompare(String(next[a].at || '')))
    .slice(0, MUTE_LIMIT);
  const capped = {};
  keep.forEach((id) => { capped[id] = next[id]; });
  return capped;
}

export function clearMute(entries, id) {
  const source = entries && typeof entries === 'object' ? entries : {};
  if (!(id in source)) return source;
  const next = { ...source };
  delete next[id];
  return next;
}

// storage는 Storage 형태({getItem,setItem})면 무엇이든 — 테스트는 가짜 객체를 넘긴다.
// Safari 프라이빗 등 storage 차단 환경에서는 조용히 빈 상태로 동작한다(기존 페이지 규약).
export function readMuteStore(storage, todayKey = seoulDayKey()) {
  try {
    const raw = storage?.getItem(MUTE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const valid = {};
    Object.keys(parsed).forEach((id) => {
      const entry = parsed[id];
      if (!entry || typeof entry !== 'object') return;
      const until = entry.until === null || entry.until === undefined ? null : String(entry.until);
      if (until !== null && !DAY_KEY.test(until)) return;
      valid[id] = { until, at: typeof entry.at === 'string' ? entry.at : '', lane: entry.lane || '', title: entry.title || '' };
    });
    return pruneMuted(valid, todayKey);
  } catch { return {}; }
}

export function writeMuteStore(storage, entries) {
  try { storage?.setItem(MUTE_STORAGE_KEY, JSON.stringify(entries || {})); } catch { /* storage 차단 환경 */ }
}
