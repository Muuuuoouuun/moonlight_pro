// PMS(Projects) 뷰 상수·순수 헬퍼 — projects.jsx에서 분리(모듈 스코프, React 비의존).
// 여기 있는 함수는 node --test로 직접 실행 가능하다 (.jsx는 node가 파싱하지 못해
// 지금껏 소스 문자열 매칭으로만 고정돼 있었다).
// 모듈 가변 상태(projectsLedgerCache)는 여기로 오지 않는다 — projects.jsx가 계속 소유한다.

export const EMPTY_ALL_BRAND = {
  key: 'all',
  id: 'all',
  name: '전체 브랜드',
  glyph: '◐',
  tone: 'moon',
  kind: 'index',
  desc: '모든 프로젝트',
  projects: 0,
  tasks: 0,
  open: 0,
  changes: 0,
};

export const PROJECT_VIEW_OPTIONS = [
  { key: 'tree', label: '개요' },
  { key: 'table', label: '목록' },
  { key: 'backlog', label: '백로그' },
  { key: 'board', label: 'Board' },
  { key: 'memos', label: '메모' },
  { key: 'timeline', label: 'Timeline' },
  { key: 'todos', label: 'To-dos' },
];
const PROJECT_VIEWS = new Set(PROJECT_VIEW_OPTIONS.map(v => v.key));

// Timeline view: status → left-stripe token (§5.2 — status color lives on stripes/chips,
// never as a full bar fill). §15 2026-08-05: 레일은 §8.1 inset 1px 인라인이 현행이고
// AttentionRail은 미채택이므로 이 토큰 맵과 아래 timeline 스트라이프는 그대로 둔다.
export const STATUS_LINE_TOKEN = {
  // lifecycle 스트라이프는 중립 — Moonstone은 current/selected 전용(§5.3, 5차 재감사 S).
  'In progress': 'var(--line-strong)',
  Review: 'var(--line-strong)',
  Planning: 'var(--line-strong)',
  Backlog: 'var(--line-soft)',
  Blocked: 'var(--danger-line)',
  Done: 'var(--line-strong)',
};
// 상태 라벨과 lifecycle 열거값의 정본은 ./project-pms-components 의
// PROJECT_STATUS_LABEL_KO / PROJECT_LIFECYCLE_STATE 다 — 상세 패널과 공유한다(§8.2).

// 프로젝트 장르 — 목록 모노그램 타일의 은은한 색 구분(DESIGN §15 2026-09-24 운영자 확정 예외).
// 색은 언제나 라벨과 함께 쓴다. 'other'와 미지정은 중립 타일 그대로다.
export const PROJECT_GENRES = [
  { key: 'company', label: '회사' },
  { key: 'sales', label: '세일즈' },
  { key: 'it', label: 'IT' },
  { key: 'content', label: '콘텐츠' },
  { key: 'other', label: '기타' },
];
const TINTED_GENRES = new Set(['company', 'sales', 'it', 'content']);
export function projectGenreLabel(genre) {
  return PROJECT_GENRES.find(item => item.key === genre)?.label || null;
}
export function projectGenreTint(genre) {
  return TINTED_GENRES.has(genre) ? genre : null;
}

// Container category folders (2026-07-15 spec §4.2). The ledger resolves
// `category` (meta.category → canonical map → 'general'); empty folders are
// never rendered. Collapse state is UI-only.
export const PROJECT_CATEGORIES = [
  { key: 'sns-channel', label: 'SNS 채널' },
  { key: 'ka-deal', label: 'KA·딜' },
  { key: 'general', label: '일반' },
];
// 브랜드 탭이 소유하는 분류 (2026-08-29 브랜드 탭 설계 §3). PMS는 이 분류의
// 컨테이너를 *렌더*는 하되 — 이미 프로젝트가 붙어 있을 수 있으므로 —
// 새로 만들지는 않고, 폴더는 기본 접힘으로 연다 (§4 P0-2·P0-3).
export const BRAND_OWNED_CATEGORY = 'sns-channel';
// 컨테이너 생성/편집 드로어에서 고를 수 있는 분류. 브랜드 소유 분류는 빠진다.
// 이미 그 분류인 컨테이너를 편집할 때만 현재 값이 옵션으로 되살아난다.
export const CONTAINER_CATEGORY_OPTIONS = PROJECT_CATEGORIES
  .filter(c => c.key !== BRAND_OWNED_CATEGORY)
  .map(c => ({ value: c.key, label: c.label }));
// 완료·보관된 프로젝트는 "터미널" — 기본 리스트에서 걷어내고 "완료·보관 항목 보기"
// 토글로만 다시 노출한다. 삭제도 archived로의 같은 상태 전환이라 이 집합을 공유한다.
const TERMINAL_PROJECT_STATUSES = new Set(['completed', 'archived', 'cancelled']);
export function isTerminalProject(p) {
  return TERMINAL_PROJECT_STATUSES.has(String(p?.statusKey || '').toLowerCase());
}
export const FOLDER_STORAGE_KEY = 'mlp.pms.folders';
// 사이드바 폴더 안 "진행 없음" 묶음의 펼침 상태. UI 전용, 기본 접힘.
export const IDLE_OPEN_KEY = 'mlp.pms.idle-open';
// 브랜드 사이드바 전체의 표시 상태 — 기본 접힘(2026-08-19 운영자 지시), 헤더의
// 브랜드 트리거 메뉴가 기본 셀렉터다. 수동 토글은 영속.
export const SIDEBAR_HIDDEN_KEY = 'mlp.pms.sidebar-hidden';
// List 뷰의 브랜드 섹션 접기 상태 (전체 브랜드 볼 때만). UI 전용, 브랜드 slug로 영속.
export const BRAND_SECTION_KEY = 'mlp.pms.brand-sections';

// 진행/휴면·숨김 판정은 pms-ui의 containerHasWork가 단일 정본이다 — changes는
// 프로젝트를 경유해서만 집계되므로(changes>0 ⇒ projects>0) 별도 항이 아니다
// (2026-09-01 2609 병합 리뷰에서 페이지 지역 술어 isBrandActive를 흡수).
// 리스트(tree) 뷰 상태 그룹 — 렌더와 j/k 평탄화(23차)가 같은 순서를 공유한다.
export const LIST_STATUS_GROUPS = [
  { key: 'In progress', label: '진행중', tone: 'var(--line-strong)' },
  { key: 'Blocked',     label: '막힘',   tone: 'var(--danger)' },
  { key: 'Review',      label: '검토',   tone: 'var(--line-strong)' },
  { key: 'Planning',    label: '계획',   tone: 'var(--line-strong)' },
  { key: 'Done',        label: '완료',   tone: 'var(--fg-dim)' },
  { key: 'Backlog',     label: '백로그', tone: 'var(--fg-faint)' },
];
// 사이드바 드래그 정렬 — 분류(폴더)와 컨테이너(브랜드) 순서. UI 전용, localStorage 영속.
export const FOLDER_ORDER_KEY = 'mlp.pms.folder-order';
export const BRAND_ORDER_KEY = 'mlp.pms.brand-order';
// 빈 컨테이너 노출 토글 (UI 전용, localStorage). 기본은 숨김.
export const EMPTY_CONTAINER_KEY = 'mlp.pms.show-empty-containers';

// Q116 확정 — 기한 임박순 정렬. 무기한은 정렬에 섞지 않고 그룹 꼬리로 보낸다(Q120).
// 무기한끼리는 기록 순서 유지 (Array.prototype.sort는 stable).
export function compareProjectsByDue(a, b) {
  const ta = Date.parse(a?.dueAt || '');
  const tb = Date.parse(b?.dueAt || '');
  const va = Number.isFinite(ta);
  const vb = Number.isFinite(tb);
  if (va && vb) return ta - tb;
  if (va) return -1;
  if (vb) return 1;
  return 0;
}

// To-dos 뷰 시간 구간 (monday My Work 문법 + Q120 무기한 분리, 2026-08-19 PMS 디벨롭).
// 기록 bucket은 지남→오늘·무기한→다음주로 뭉개므로 UI에서 dueAt로 직접 나눈다.
// 기준 TZ Asia/Seoul, calendar day (deep-design §10.1 시간 계약).
export const TODO_TIME_SECTIONS = ['기한 지남', '오늘', '내일', '이번 주', '이후', '기한 없음'];
// 요약 4칸 클릭 필터의 표시 라벨 (project-pms-components의 PORTFOLIO_CELLS와 동일 문구).
export const SUMMARY_FILTER_LABELS = {
  active: '진행 중',
  blockedOrOverdue: '막힘 · 지연',
  dueSoon: '7일 내 기한',
  unmeasured: '진척 미측정',
};
export function seoulDayKey(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
}
export function todoTimeSection(todo, todayKey) {
  const dueKey = todo?.dueAt ? seoulDayKey(todo.dueAt) : null;
  if (!dueKey || !todayKey) return '기한 없음';
  const diff = Math.round((Date.parse(dueKey) - Date.parse(todayKey)) / 86400000);
  // 완료된 할 일은 손실 상태가 아니다 — 지난 기한이어도 "기한 지남"으로 올리지 않는다.
  if (diff < 0) return todo.done ? '오늘' : '기한 지남';
  if (diff === 0) return '오늘';
  if (diff === 1) return '내일';
  if (diff <= 7) return '이번 주';
  return '이후';
}
export const DETAIL_FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])';

// prevOrder를 현재 존재하는 키로 정규화한 뒤, movingKey를 targetKey '앞'으로 이동한 새 순서 배열.
export function computeMovedOrder(prevOrder, currentKeys, movingKey, targetKey) {
  const present = new Set(currentKeys);
  const base = prevOrder.filter((k) => present.has(k));
  for (const k of currentKeys) if (!base.includes(k)) base.push(k);
  if (movingKey === targetKey) return base; // 자기 자신에 드롭 → 정규화만
  const from = base.indexOf(movingKey);
  if (from === -1) return base;
  base.splice(from, 1);
  const to = base.indexOf(targetKey);
  if (to === -1) base.push(movingKey);
  else base.splice(to, 0, movingKey);
  return base;
}

// Container (brand) create helpers. brands.slug must be unique per workspace and
// is required by the table; Korean names collapse to an id-based fallback.
export function slugifyContainer(name, id) {
  const base = String(name || '').toLowerCase().normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return base || `c-${String(id || '').slice(0, 8)}`;
}

// Optimistic row for preview mode (Engine not configured) — shaped like a ledger
// brand so brandGroups places it in the right category folder immediately.
export function buildLocalContainer(draft, slug) {
  return {
    key: slug,
    id: draft.id,
    name: String(draft.name || '').trim(),
    glyph: '○',
    tone: 'moon',
    kind: 'brand',
    orgScope: draft.orgScope,
    category: draft.category,
    desc: '새 컨테이너 · 저장 대기',
    preview: true,
    projects: 0,
    tasks: 0,
    open: 0,
    changes: 0,
  };
}

// `?view=tasks` is the sidebar spec's wording for the same view the page calls
// 'todos' — accept both so old and new links resolve.
export function normalizeProjectView(raw) {
  const v = String(raw || '');
  if (v === 'tasks') return 'todos';
  // 2026-09-15 09-mac1: 홈/개요·목록 별칭도 받는다 (뷰 라벨 한글화와 함께).
  if (v === 'home' || v === 'overview') return 'tree';
  if (v === 'list') return 'table';
  return PROJECT_VIEWS.has(v) ? v : 'tree';
}

// D-Day 칩 — 09-mac1(2026-09-15)에서 옮겨옴. 톤은 DESIGN.md §5.2를 따른다: danger는 기한을
// 넘긴 즉시-손실 상태에만, "오늘·임박"은 빨갛지 않고(no-warning-by-default) Moonstone은
// current/selected 전용이라 카테고리(임박)에 쓰지 않는다. 강조가 필요하면 diffDays로
// 굵기·순서를 조절한다.
export function computeDDay(dueAt) {
  if (!dueAt) return null;
  const target = new Date(dueAt);
  if (Number.isNaN(target.getTime())) return null;
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfTarget = new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime();
  const diffDays = Math.round((startOfTarget - startOfToday) / (24 * 60 * 60 * 1000));

  if (diffDays < 0) return { text: `D+${Math.abs(diffDays)}`, tone: 'danger', diffDays };
  if (diffDays === 0) return { text: 'D-Day', tone: 'neutral', diffDays: 0 };
  return { text: `D-${diffDays}`, tone: 'neutral', diffDays };
}
