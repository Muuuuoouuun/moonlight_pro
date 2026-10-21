// 콘텐츠 만들기(13b)·보드(13a) — 2026-10-21 운영자 확정 "13b 기본 + 13a 보드 보기". 순수 함수.
// 상태값(idea · draft · review · scheduled · published)은 그대로 두고 단계를 읽어 낸다 — 마이그레이션 없음.
//   아이디어 ○  idea, 기획 칸이 모두 빔
//   계획 ◇     idea + 근거와 사례 밖의 기획 칸 하나 이상 · 또는 draft인데 본문을 아직 안 씀(본문이 비었거나 원문 메모 그대로)
//              근거와 사례는 소재를 들여올 때 자동으로 채워지는 재료라 그것만으로는 계획이 아니다(2026-10-21 실측: idea 30건 중 26건이 근거만 있음).
//   제작 ◐     draft + 본문을 씀(어느 결과물이든)
//   다듬기 ◑   review
//   발행 대기 ● scheduled · 또는 예약(content_schedules)이 살아 있음(예약됨 · 올릴 차례 · 놓침)
//   (발행됨)   published — 보드에 올리지 않고 이번 주 칸에만 센다
// 기획을 저장하면 서버가 idea를 draft로 올린다(본문이 있으면 — 담은 소재는 메모가 본문이다). 그래도 본문을 안 썼으니 계획에 남는다.
import { BRIEF_FIELDS, draftFromDetail } from './content-workflow-client.js';
import { weekStrip } from './content-publish-log.js';

export const CONTENT_VIEWS = [{ key: 'make', label: '만들기' }, { key: 'board', label: '보드' }, { key: 'list', label: '목록' }];
export const DEFAULT_CONTENT_VIEW = 'make';
export const resolveContentView = (value) => (CONTENT_VIEWS.some((view) => view.key === value) ? value : DEFAULT_CONTENT_VIEW);

// 단계는 색이 아니라 글리프 + 글자(§5.3 lifecycle).
export const FLOW_STAGES = [
  { key: 'idea', label: '아이디어', glyph: '○', hint: '고르기만 하면 돼요' },
  { key: 'plan', label: '계획', glyph: '◇', hint: '핵심 메시지 한 줄이면 시작' },
  { key: 'make', label: '제작', glyph: '◐', hint: '동시에 2개까지' },
  { key: 'polish', label: '다듬기', glyph: '◑', hint: '읽어 보기 · 고치기' },
  { key: 'ship', label: '발행 대기', glyph: '●', hint: '예약 · 올릴 차례 · 놓침' },
];

export const FLOW_FORMATS = [
  { key: 'threads', label: '스레드', type: 'threads_post' },
  { key: 'card', label: '카드뉴스', type: 'card_news' },
  { key: 'shorts', label: '쇼츠', type: 'reels_script' },
];
export const formatOfType = (type) => FLOW_FORMATS.find((format) => format.type === type) || null;

// 핵심 메시지가 맨 위 — 이것만 있으면 시작한다.
export const PLAN_FIELDS = [BRIEF_FIELDS.find((field) => field.key === 'message'), ...BRIEF_FIELDS.filter((field) => field.key !== 'message')];
const PLAN_KEYS = new Set(PLAN_FIELDS.map((field) => field.key));
const text = (value) => (typeof value === 'string' ? value.trim() : '');

export const planCount = (brief) => PLAN_FIELDS.filter(({ key }) => text(brief?.[key])).length;
/** 운영자가 계획을 시작했는가 — 근거와 사례 밖의 칸 하나라도. */
export const planStarted = (brief) => PLAN_FIELDS.some(({ key }) => key !== 'evidence' && text(brief?.[key]));

// 바로 가능 = 지금 시작할 재료가 있음: 참고 링크, 또는 제목 한 줄을 넘는 원문 메모. 점수는 없다(운영자 프로필 §12).
// 담은 소재는 첫 줄이 제목이 되므로, 한 줄짜리 메모는 제목과 같아 재료로 치지 않는다.
export function isReadyToMake(item) {
  if (text(item?.sourceUrl)) return true;
  const memo = text(item?.sourceIdea);
  return Boolean(memo) && memo !== text(item?.title);
}

function structuredEntries(variant) {
  const key = variant?.type === 'card_news' ? 'slides' : variant?.type === 'reels_script' ? 'scenes' : null;
  if (!key) return null;
  const body = text(variant.body);
  if (!body) return [];
  try {
    const list = JSON.parse(body)?.[key];
    return Array.isArray(list) ? list.filter((entry) => entry && typeof entry === 'object') : null;
  } catch { return null; }
}

/** 본문을 썼는가. 스레드 등 글은 원문 메모 그대로면 아직 안 쓴 것, 카드뉴스·쇼츠는 장·장면이 하나라도 있으면 쓴 것. */
export function bodyWritten(variant, sourceIdea = '') {
  if (!variant) return false;
  const entries = structuredEntries(variant);
  if (entries) return entries.length > 0;
  const body = text(variant.body);
  if (entries === null && (variant.type === 'card_news' || variant.type === 'reels_script')) return Boolean(body);
  return Boolean(body) && body !== text(sourceIdea);
}

const LIVE_SCHEDULE = ['missed', 'due', 'scheduled'];
/** 이 콘텐츠의 살아 있는 예약 하나 — 놓침 → 올릴 차례 → 예약됨, 같은 상태면 이른 시각. */
export function activeSchedule(schedules, contentId) {
  return (schedules || [])
    .filter((row) => row?.contentId === contentId && LIVE_SCHEDULE.includes(row.state))
    .sort((a, b) => LIVE_SCHEDULE.indexOf(a.state) - LIVE_SCHEDULE.indexOf(b.state) || Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt))[0] || null;
}

/** 단계 키. 결과물을 하나도 못 읽었으면(목록 상한) draft는 상태를 믿고 제작으로 둔다. */
export function deriveStage(item, variants = [], schedule = null) {
  const status = String(item?.status || '').toLowerCase();
  if (status === 'published') return 'published';
  if (schedule || status === 'scheduled') return 'ship';
  if (status === 'review') return 'polish';
  if (status === 'draft') {
    if (!variants.length) return 'make';
    return variants.some((variant) => bodyWritten(variant, item.sourceIdea)) ? 'make' : 'plan';
  }
  return planStarted(item?.brief) ? 'plan' : 'idea';
}

const timeOf = (value) => { const t = Date.parse(value); return Number.isFinite(t) ? t : 0; };

/** 원장 → 단계별 카드. 발행된 것은 빼고, 단계 안에서는 최근 손댄 순(아이디어는 담은 순, 발행 대기는 놓침 먼저 · 이른 예약 먼저). */
export function buildFlow({ items = [], variants = [], schedules = [] } = {}) {
  const byContent = new Map();
  for (const variant of variants) {
    if (!byContent.has(variant.contentId)) byContent.set(variant.contentId, []);
    byContent.get(variant.contentId).push(variant);
  }
  const lanes = Object.fromEntries(FLOW_STAGES.map(({ key }) => [key, []]));
  for (const item of items) {
    const own = byContent.get(item.id) || [];
    const schedule = activeSchedule(schedules, item.id);
    const stage = deriveStage(item, own, schedule);
    if (!lanes[stage]) continue;
    const formats = FLOW_FORMATS.filter((format) => own.some((variant) => variant.type === format.type));
    lanes[stage].push({ item, stage, variants: own, schedule, ready: isReadyToMake(item), plan: planCount(item.brief), formats });
  }
  lanes.idea.sort((a, b) => timeOf(b.item.createdAt) - timeOf(a.item.createdAt));
  for (const key of ['plan', 'make', 'polish']) lanes[key].sort((a, b) => timeOf(b.item.updatedAt) - timeOf(a.item.updatedAt));
  lanes.ship.sort((a, b) => Number(b.schedule?.state === 'missed') - Number(a.schedule?.state === 'missed')
    || (a.schedule ? timeOf(a.schedule.scheduledAt) : Infinity) - (b.schedule ? timeOf(b.schedule.scheduledAt) : Infinity));
  return lanes;
}

/** 만들기의 고르기 목록 — 아직 쓰기 전(아이디어 · 계획), 최근 손댄 순. */
export function pickableCards(lanes) {
  return [...lanes.idea, ...lanes.plan].sort((a, b) => timeOf(b.item.updatedAt) - timeOf(a.item.updatedAt));
}

const THREAD_MIDDLE = 3;
const SHORTS_BEATS = ['훅', '문제', '전환', '해결', '마무리'];
const CARD_SLOTS = 5;
export const SHORTS_TARGET_SECONDS = 60;

function rowsFrom(entries, labelAt, minimum, read) {
  const count = Math.max(minimum, entries.length);
  return Array.from({ length: count }, (_, index) => ({ label: labelAt(index, count), ...read(entries[index]) }));
}

/** 형식별 대본 뼈대. 결과물 본문이 있으면 그 칸을 채우고(읽기만), 없으면 빈 칸 — 원문 메모 그대로인 글은 빈 뼈대다. */
export function formatOutline(formatKey, variant = null, sourceIdea = '') {
  const written = variant && bodyWritten(variant, sourceIdea);
  if (formatKey === 'shorts') {
    const scenes = written ? structuredEntries(variant) || [] : [];
    const rows = rowsFrom(scenes, (index) => SHORTS_BEATS[index] || `장면 ${index + 1}`, SHORTS_BEATS.length, (scene) => {
      const line = text(scene?.spoken) || text(scene?.visual);
      const seconds = Number(scene?.duration);
      return { text: line, meta: line && Number.isFinite(seconds) && seconds > 0 ? `${seconds}초` : '' };
    });
    const seconds = scenes.reduce((sum, scene) => sum + (text(scene?.spoken) || text(scene?.visual) ? Math.max(0, Number(scene?.duration) || 0) : 0), 0);
    return finish(rows, { value: seconds, of: SHORTS_TARGET_SECONDS, unit: '초' });
  }
  if (formatKey === 'card') {
    const slides = written ? structuredEntries(variant) || [] : [];
    const rows = rowsFrom(slides, (index, count) => (index === 0 ? '표지' : index === count - 1 ? '마지막 장' : `장 ${index + 1}`), CARD_SLOTS, (slide) => ({ text: text(slide?.title) || text(slide?.sub), meta: '' }));
    return finish(rows, null);
  }
  const posts = written ? text(variant.body).split(/\n\s*\n/).map(text).filter(Boolean) : [];
  const first = posts[0] || '';
  const last = posts.length > 1 ? posts[posts.length - 1] : '';
  const middle = posts.slice(1, -1);
  const read = (value) => ({ text: value || '', meta: value ? `${value.length}자` : '' });
  const rows = [
    { label: '첫 줄', ...read(first) },
    ...rowsFrom(middle, (index) => `연결 글 ${index + 1}`, THREAD_MIDDLE, read),
    { label: '마무리', ...read(last) },
  ];
  return finish(rows, { value: posts.join('').length, unit: '자' });
}

function finish(rows, measure) {
  return { rows, written: rows.filter((row) => row.text).length, total: rows.length, measure };
}

/** 이번 주 7칸(월~일, KST). 발행 = 그날 운영자 확인 발행이 있음, 예약 = 살아 있는 예약, 오늘 · 앞날은 칸 모양으로만. */
export function flowWeek(logRows, now = Date.now()) {
  return weekStrip(logRows, now).map((day) => {
    const done = day.items.some((row) => row.state === 'published');
    const scheduled = !done && day.items.some((row) => row.state === 'scheduled' || row.state === 'due');
    const state = done ? '발행' : scheduled ? '예약' : day.isToday ? '오늘' : day.isFuture ? '앞으로' : '발행 없음';
    return { key: day.key, label: day.label, today: day.isToday, future: day.isFuture, done, scheduled, aria: `${day.label}요일 ${state}` };
  });
}

/** 이번 주 발행한 날 수(하루 1개 목표, 운영자 프로필 §12). */
export const publishedDays = (week) => week.filter((day) => day.done).length;

export function studioHref(contentId, variantId = null) {
  return `/dashboard/content/studio?item=${encodeURIComponent(contentId)}${variantId ? `&variant=${encodeURIComponent(variantId)}` : ''}`;
}

/**
 * 계획(기획 6칸) 저장 명령 — 원고 작성과 같은 workflow save, 바꾼 기획 칸만 보낸다.
 * 서버가 기획을 칸 단위로 합치므로 제목·메모·본문은 건드리지 않는다. 버전은 방금 읽은 상세에서 오고,
 * 응답을 못 받으면 다시 읽고 같은 값으로 보내면 된다(같은 칸에 같은 값 — 중복이 생기지 않는다).
 * 결과물을 못 찾으면 null — 원고 작성에서 채우게 한다.
 */
export function buildPlanSave(detail, edits, requestId) {
  const draft = draftFromDetail(detail);
  if (!draft.contentId || !draft.variantId || !draft.itemUpdatedAt || !draft.variantUpdatedAt) return null;
  const brief = Object.fromEntries(Object.entries(edits || {}).filter(([key, value]) => PLAN_KEYS.has(key) && typeof value === 'string'));
  if (!Object.keys(brief).length) return null;
  return {
    action: 'save', requestId, contentId: draft.contentId, variantId: draft.variantId,
    expectedItemUpdatedAt: draft.itemUpdatedAt, expectedVariantUpdatedAt: draft.variantUpdatedAt,
    item: { brief }, variant: {}, checkpoint: false,
  };
}

/** 저장 응답이 보낸 기획을 실제로 담았는가 — 이것이 확인돼야 '저장됨'이라 말한다. */
export function planSaveConfirmed(result, command) {
  if (!['saved', 'duplicate'].includes(result?.status) || result.item?.id !== command?.contentId) return false;
  const saved = result.item?.meta?.brief || {};
  return Object.entries(command.item.brief).every(([key, value]) => saved[key] === value);
}
