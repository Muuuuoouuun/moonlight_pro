"use client";

import React from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Iconed } from "../hub-icons";
import { Badge, Card, Button, Checkbox, EmptyState, SyncBadge, Kbd, SegmentedControl, ScrollShadowX, Input, IconButton, EditDrawer } from "../hub-primitives";

// 내 작업 — one personal operating surface, three lenses over the cross-lane attention
// read model (tasks + open deals + calendar week). Design contract from the operator:
// 핵심 정보만 (one line per item), 최신 기준 default sort, and fast lens/lane/sort toggles.
// Native surfaces (Deals kanban, Projects board) stay the deep-work views — every item
// here deep-links back to its home drawer.
// 가시성 계층 (2026-07-17): 시그널 스트립(지남·오늘·이번 주 타일)이 첫 화면 5초 답을 맡고,
// 리스트 렌즈는 기한 버킷 그룹 헤더로 스캔 축을 제공한다. 정렬(최신/기한/우선순위)은
// 그룹 안에서만 적용 — 매크로 순서는 항상 긴급도(지남→오늘→이번 주→나중)다.
// 상세 계층 (2026-07-17 2차): 행 클릭은 모든 레인에서 우측 상세 패널(접기)을 연다 —
// 간단 요약 + 원본 서피스로 넘어가는 버튼(Deals 드로어 / 프로젝트 ?project= 딥링크 /
// Google Calendar). 할 일은 패널에서 완료·미루기(내일, 주말이면 월요일)·상세 편집.
// 같은 프로젝트 할 일이 한 버킷에 2개 이상이면 프로젝트 아코디언으로 접힌다.

const LENSES = [
  { key: 'list', label: '리스트' },
  { key: 'board', label: '보드' },
  { key: 'week', label: '주간' },
];

const LANE_OPTIONS = [
  { key: 'all', label: '전체' },
  { key: 'task', label: '할 일' },
  { key: 'deal', label: '딜' },
  { key: 'event', label: '일정' },
];

const SORT_OPTIONS = [
  { key: 'recent', label: '최신' },
  { key: 'due', label: '기한' },
  // 서버가 매긴 오늘-우선순위 (profile §4 임시 규칙: 기한 지남 → 오늘 → 클로징 임박(리드
  // 스코어) → 연락 시점 지남 → 일반). 정렬 근거는 행의 meta 자리에 reason으로 표시된다.
  { key: 'priority', label: '우선순위' },
];

const LANE_TONE = { task: 'moon', deal: 'company', event: 'info' };
const LANE_LABEL = { task: '할 일', deal: '딜', event: '일정' };

const BUCKETS = [
  { key: 'overdue', label: '지남', tone: 'danger' },
  { key: 'today', label: '오늘', tone: 'warning' },
  { key: 'week', label: '이번 주', tone: 'info' },
  { key: 'later', label: '나중', tone: 'neutral' },
];
const BUCKET_RANK = { overdue: 0, today: 1, week: 2, later: 3 };
const BUCKET_OPTIONS = [{ key: 'all', label: '전체 기한' }, ...BUCKETS];
// 서버 bucket 키가 넷 밖이면(방어) '나중'으로 흡수 — 그룹/카운트가 항목을 잃지 않게.
const normalizeBucket = (item) => (BUCKET_RANK[item.bucket] != null ? item.bucket : 'later');

// 시그널 스트립 타일 — 클릭하면 리스트 렌즈 + 해당 기한 필터 토글. '나중'은 신호가
// 아니므로 타일에서 제외 (기한 세그먼트 토글에는 그대로 있다).
const SIGNAL_TILES = [
  { key: 'overdue', label: '기한 지남', color: 'var(--danger)', stripe: 'var(--danger-line)' },
  { key: 'today', label: '오늘', color: 'var(--warning)', stripe: 'var(--warning-line)' },
  { key: 'week', label: '이번 주', color: 'var(--info)' },
];

// 리스트 그룹 헤더 텍스트 톤 — 긴급 버킷만 semantic 색, 나머지는 중립 (§5.2 절제).
const BUCKET_HEADER = {
  overdue: { label: '기한 지남', color: 'var(--danger)' },
  today: { label: '오늘', color: 'var(--warning)' },
  week: { label: '이번 주', color: 'var(--fg-dim)' },
  later: { label: '나중', color: 'var(--fg-faint)' },
};

// 미루기 목적지 — 서울 기준 다음날, 그날이 토/일이면 다음 월요일 (운영자 규칙).
function nextDeferTarget() {
  const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' });
  const dowFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', weekday: 'short' });
  for (let i = 1; i <= 3; i += 1) {
    const d = new Date(Date.now() + i * 86400000);
    const dow = dowFmt.format(d);
    if (dow !== 'Sat' && dow !== 'Sun') {
      return { dueAt: dayFmt.format(d), label: i === 1 ? '내일' : '월요일' };
    }
  }
  return { dueAt: dayFmt.format(new Date(Date.now() + 86400000)), label: '내일' };
}

// 버킷 그룹 안에서 같은 프로젝트 할 일이 2개 이상이면 첫 항목 위치에 아코디언 그룹으로
// 묶는다 (1개짜리는 행의 프로젝트 라벨로 충분 — 단독 아코디언은 소음). 그 외 항목은
// 정렬 순서를 그대로 유지한다.
function buildSectionRows(sectionItems) {
  const counts = new Map();
  sectionItems.forEach((i) => {
    if (i.lane === 'task' && i.projectId) counts.set(i.projectId, (counts.get(i.projectId) || 0) + 1);
  });
  const rows = [];
  const grouped = new Set();
  sectionItems.forEach((item) => {
    const pid = item.lane === 'task' ? item.projectId : null;
    if (pid && (counts.get(pid) || 0) >= 2) {
      if (grouped.has(pid)) return;
      grouped.add(pid);
      rows.push({
        type: 'project',
        projectId: pid,
        projectName: item.projectName || '프로젝트',
        items: sectionItems.filter((x) => x.lane === 'task' && x.projectId === pid),
      });
      return;
    }
    rows.push({ type: 'item', item });
  });
  return rows;
}

const TASK_STATUS_OPTIONS = [
  { value: 'inbox', label: '수집' },
  { value: 'todo', label: '계획' },
  { value: 'doing', label: '진행' },
  { value: 'blocked', label: '대기' },
  { value: 'done', label: '완료' },
];
const TASK_PRIORITY_OPTIONS = [
  { value: 'low', label: '낮음' },
  { value: 'medium', label: '보통' },
  { value: 'high', label: '높음' },
  { value: 'critical', label: '긴급' },
];

function readStoredOption(key, options, fallback) {
  if (typeof window === 'undefined') return fallback;
  const stored = window.localStorage.getItem(key);
  return stored && options.some((o) => o.key === stored) ? stored : fallback;
}
function writeStoredOption(key, value) {
  if (typeof window !== 'undefined') window.localStorage.setItem(key, value);
}

function recencyValue(item) {
  const t = new Date(item.recencyAt || 0).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function dueValue(item) {
  // 기한 sort: overdue first (oldest first), no-date last.
  const rank = BUCKET_RANK[item.bucket] ?? 3;
  const t = item.whenAt ? new Date(item.whenAt).getTime() : Number.MAX_SAFE_INTEGER;
  return rank * 1e15 + (Number.isNaN(t) ? Number.MAX_SAFE_INTEGER : t);
}

function priorityValue(item) {
  return Number.isFinite(item.priorityScore) ? item.priorityScore : 0;
}

function useAttentionLedger() {
  const [data, setData] = React.useState({ items: [], sources: {}, calendarReason: '' });
  const [state, setState] = React.useState('loading');

  const load = React.useCallback(async () => {
    try {
      const res = await fetch('/api/hub/attention', { cache: 'no-store' });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json || json.status === 'error') {
        setState('error');
        return;
      }
      setData({ items: json.items || [], sources: json.sources || {}, calendarReason: json.calendarReason || '' });
      setState('ready');
    } catch {
      setState('error');
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);
  return { ...data, state, reload: load };
}

// One minimal row: [checkbox|dot] title …… meta · when. 모든 레인이 클릭 시 우측 상세
// 패널을 연다 (원본 이동·미루기·편집은 패널의 액션). `completing` is the brief
// strikethrough flash before a task leaves the list (undo window handled by the caller).
// `selected` marks the row whose detail panel is open. `hideProject` suppresses the
// project label inside a project accordion (the header already names it).
function ItemRow({ item, onComplete, onOpen, completing, selected, rowRef, showReason, hideProject }) {
  // 우선순위 정렬일 때는 meta 자리에 정렬 근거(reason)를 보여준다 — 첫 화면 요구사항
  // "지금 해야 하는 이유"(profile §4)를 행 높이 증가 없이 전달.
  const projectLabel = !hideProject && item.lane === 'task' ? item.projectName || '' : '';
  const metaText = showReason && item.priorityReason
    ? item.priorityReason
    : [projectLabel, item.meta].filter(Boolean).join(' · ');
  return (
    <div
      ref={rowRef}
      className="hub-row"
      role="button"
      tabIndex={0}
      onClick={() => onOpen(item)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(item); } }}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: 'var(--pad-y) var(--pad-x)', minHeight: 'var(--row-h)',
        borderBottom: '1px solid var(--line-soft)',
        cursor: 'pointer',
        background: selected ? 'var(--surface-2)' : undefined,
        boxShadow: item.bucket === 'overdue' ? 'inset 2px 0 0 var(--danger-line)'
          : item.stalled ? 'inset 2px 0 0 var(--warning-line)' : undefined,
      }}
    >
      {item.lane === 'task' ? (
        <Checkbox checked={completing} onChange={() => onComplete(item)} label={`${item.title} 완료`} />
      ) : (
        <Badge tone={LANE_TONE[item.lane]} size="xs" variant="outline">{LANE_LABEL[item.lane]}</Badge>
      )}
      <span style={{
        fontSize: 13, color: completing ? 'var(--fg-faint)' : 'var(--fg)', flex: 1, minWidth: '35%',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        textDecoration: completing ? 'line-through' : 'none',
        transition: 'color 180ms ease',
      }}>
        {item.title}
      </span>
      {metaText && (
        // 폭 상한 + 말줄임 — 좁은 화면에서 meta가 제목(identity)을 짓누르지 않게 한다
        // (2026-07 design-review FINDING-001의 모바일 identity-first 원칙). ≤560px에서는
        // hub-tokens.css가 통째로 숨긴다: "견적 · ₩10K…"처럼 잘린 meta는 정보가치가 없고
        // 정체 신호는 stripe, 긴급도는 날짜 색이 이미 전달한다.
        // .num(sans tabular) — meta에 프로젝트명·정렬 근거 같은 단어가 섞이므로 mono로 두면
        // 이름이 ID처럼 읽힌다(§6). 금액·일수는 tabular-nums로 열 안정성 유지.
        <span className="num hub-mywork-meta" style={{
          fontSize: 11, color: 'var(--fg-muted)', flexShrink: 1, maxWidth: '38%',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{metaText}</span>
      )}
      <span className="mono" style={{
        fontSize: 11, flexShrink: 0, minWidth: 64, textAlign: 'right',
        color: item.bucket === 'overdue' ? 'var(--danger)' : item.bucket === 'today' ? 'var(--warning)' : 'var(--fg-faint)',
      }}>
        {item.whenLabel}
      </span>
    </div>
  );
}

// 우측 상세 패널 — 행 클릭 시 열리는 간단 요약 + 다음 행동. 딥워크는 각 레인의 네이티브
// 서피스(할 일 EditDrawer · Deals 드로어 · 프로젝트 · Google Calendar)로 넘긴다.
// ESC/닫기 버튼으로 접힌다 (§8.1 닫기 계약의 패널 버전).
function DetailPanel({ item, completing, deferTarget, onClose, onComplete, onDefer, onEdit, onNavigate }) {
  const bucketMeta = BUCKET_HEADER[normalizeBucket(item)];
  // mono는 계기 데이터(기한·단계·금액)만 — 상태/프로젝트명/근거 같은 '단어' 값을 mono로
  // 두면 이름이 ID처럼 읽힌다 (DESIGN §6 하이브리드 숫자 규칙).
  const rows = [
    {
      label: '기한',
      value: item.whenLabel,
      mono: true,
      tone: item.bucket === 'overdue' ? 'var(--danger)' : item.bucket === 'today' ? 'var(--warning)' : undefined,
    },
    item.lane === 'task' && {
      label: '상태',
      value: TASK_STATUS_OPTIONS.find((o) => o.value === item.status)?.label || item.status,
    },
    item.lane === 'task' && {
      label: '우선순위',
      value: TASK_PRIORITY_OPTIONS.find((o) => o.value === item.priority)?.label || item.priority,
    },
    item.lane === 'task' && item.projectName && { label: '프로젝트', value: item.projectName },
    item.lane === 'deal' && item.meta && { label: '단계·금액', value: item.meta, mono: true },
    item.lane === 'event' && item.meta && { label: '장소', value: item.meta },
    item.priorityReason && { label: '근거', value: item.priorityReason },
  ].filter(Boolean);

  return (
    <Card
      pad={false}
      className="hub-mywork-detail"
      role="complementary"
      aria-label="선택 항목 상세"
      style={{ position: 'sticky', top: 12, overflow: 'hidden' }}
    >
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--line-soft)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <Badge tone={LANE_TONE[item.lane]} size="xs" variant="outline">{LANE_LABEL[item.lane]}</Badge>
        <span style={{ fontSize: 11, color: bucketMeta.color, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          {bucketMeta.label}
        </span>
        <div style={{ flex: 1 }} />
        <IconButton icon="x" tooltip="패널 닫기 (ESC)" onClick={onClose} />
      </div>
      <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 14, fontWeight: 500, lineHeight: 1.45, textDecoration: completing ? 'line-through' : 'none' }}>
          {item.title}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {rows.map((r) => (
            <div key={r.label} style={{ display: 'flex', gap: 8, fontSize: 12, alignItems: 'baseline' }}>
              <span style={{ width: 64, flexShrink: 0, color: 'var(--fg-dim)' }}>{r.label}</span>
              <span className={r.mono ? 'mono' : undefined} style={{ color: r.tone || 'var(--fg-muted)', minWidth: 0, overflowWrap: 'anywhere' }}>{r.value}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ padding: '10px 14px', borderTop: '1px solid var(--line-soft)', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {item.lane === 'task' && (
          <>
            <Button variant="primary" size="sm" icon="check" onClick={onComplete} disabled={completing}>완료</Button>
            {/* 오늘 못하면 미루기 — 기본 다음날, 주말이면 월요일. */}
            <Button variant="secondary" size="sm" icon="clock" onClick={onDefer}>{deferTarget.label}로 미루기</Button>
            {/* 2차 액션(outline)은 한 줄로 — 세로 4단 스택보다 위계가 읽히고 패널이 짧아진다. */}
            <div style={{ display: 'flex', gap: 6 }}>
              <Button variant="outline" size="sm" icon="edit" onClick={onEdit} style={{ flex: 1 }}>상세 편집</Button>
              {item.projectId && (
                <Button
                  variant="outline"
                  size="sm"
                  icon="projects"
                  style={{ flex: 1 }}
                  onClick={() => onNavigate?.(`dashboard/work/projects?project=${encodeURIComponent(item.projectId)}`)}
                >
                  프로젝트에서 열기
                </Button>
              )}
            </div>
          </>
        )}
        {item.lane === 'deal' && (
          <Button variant="primary" size="sm" icon="arrowRight" onClick={() => item.href && onNavigate?.(item.href)}>
            Deals에서 열기
          </Button>
        )}
        {item.lane === 'event' && (
          <>
            {item.calendarLink && (
              <Button
                variant="primary"
                size="sm"
                icon="calendar"
                onClick={() => window.open(item.calendarLink, '_blank', 'noopener')}
              >
                Google Calendar에서 열기
              </Button>
            )}
            <Button variant="outline" size="sm" icon="arrowRight" onClick={() => onNavigate?.('dashboard/work/calendar')}>
              Calendar 탭 열기
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}

export function MyWork({ onNavigate }) {
  const { items, sources, calendarReason, state, reload } = useAttentionLedger();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // Lens lives in the URL (?lens=) so a view is bookmarkable, same contract as Projects ?view.
  const lensParam = searchParams?.get('lens');
  const lens = LENSES.some((l) => l.key === lensParam) ? lensParam : 'list';
  const setLens = (next) => {
    const params = new URLSearchParams(searchParams?.toString() || '');
    if (next === 'list') params.delete('lens'); else params.set('lens', next);
    router.replace(`${pathname}${params.size ? `?${params}` : ''}`);
  };

  // Lane/bucket/sort survive a refresh (localStorage) — re-picking the same filter every visit
  // was the top friction point. Restored in an effect AFTER mount (same pattern as hub-app's
  // density/theme): reading localStorage inside the useState initializer made the first client
  // render differ from SSR HTML and threw hydration mismatches whenever a stored value differed
  // from the default. Writes happen inside the change handlers, not effects — an effect-based
  // write fires on mount with the default values and clobbers storage before/between the
  // restore passes (StrictMode runs mount effects twice, making the clobber deterministic).
  const [lane, setLaneState] = React.useState('all');
  const [bucketFilter, setBucketFilterState] = React.useState('all');
  const [sort, setSortState] = React.useState('recent');
  React.useEffect(() => {
    setLaneState(readStoredOption('mlp.mywork.lane', LANE_OPTIONS, 'all'));
    setBucketFilterState(readStoredOption('mlp.mywork.bucket', BUCKET_OPTIONS, 'all'));
    setSortState(readStoredOption('mlp.mywork.sort', SORT_OPTIONS, 'recent'));
  }, []);
  const setLane = (v) => { setLaneState(v); writeStoredOption('mlp.mywork.lane', v); };
  const setBucketFilter = (v) => { setBucketFilterState(v); writeStoredOption('mlp.mywork.bucket', v); };
  const setSort = (v) => { setSortState(v); writeStoredOption('mlp.mywork.sort', v); };

  const [search, setSearch] = React.useState('');
  const [quickTitle, setQuickTitle] = React.useState('');
  const [showQuickDetail, setShowQuickDetail] = React.useState(false);
  const [quickDue, setQuickDue] = React.useState('');
  const [quickPriority, setQuickPriority] = React.useState('medium');
  const [saving, setSaving] = React.useState(false);
  const [notice, setNotice] = React.useState(null); // { tone, label, action?: { label, onClick } }
  const [taskDraft, setTaskDraft] = React.useState(null);
  // 우측 상세 패널이 보고 있는 item.id — 파생 조회라서 reload 후 항목이 사라지면
  // (완료·삭제) 패널도 같이 닫힌다.
  const [detailId, setDetailId] = React.useState(null);
  // 접힌 프로젝트 아코디언 (projectId 기준, 세션 한정).
  const [collapsedProjects, setCollapsedProjects] = React.useState(() => new Set());
  const [dragItemId, setDragItemId] = React.useState(null);
  // completingIds: brief strikethrough flash. hiddenIds: optimistically removed from view
  // while the undo window (pendingTimers) is still open — completeTask only actually fires
  // when a timer runs out, so "되돌리기" is a real cancel, not a re-create.
  const [completingIds, setCompletingIds] = React.useState(() => new Set());
  const [hiddenIds, setHiddenIds] = React.useState(() => new Set());
  const pendingTimers = React.useRef(new Map());
  const quickRef = React.useRef(null);
  const searchRef = React.useRef(null);
  const rowRefs = React.useRef([]);

  React.useEffect(() => () => {
    // Unmount safety: don't let a stale timer fire a PATCH after the page is gone.
    pendingTimers.current.forEach((timerId) => clearTimeout(timerId));
    pendingTimers.current.clear();
  }, []);

  const visible = React.useMemo(() => {
    let filtered = lane === 'all' ? items : items.filter((i) => i.lane === lane);
    filtered = filtered.filter((i) => !hiddenIds.has(i.id));
    // Bucket filter is a 리스트-only control (board already shows every bucket as its own
    // column; week already shows every day) — applying it there too would silently empty
    // most columns/days without any visible chip explaining why.
    if (lens === 'list' && bucketFilter !== 'all') filtered = filtered.filter((i) => i.bucket === bucketFilter);
    const q = search.trim().toLowerCase();
    if (q) filtered = filtered.filter((i) => i.title.toLowerCase().includes(q));
    const sorted = [...filtered];
    if (sort === 'recent') sorted.sort((a, b) => recencyValue(b) - recencyValue(a));
    else if (sort === 'priority') sorted.sort((a, b) => (priorityValue(b) - priorityValue(a)) || (recencyValue(b) - recencyValue(a)));
    else sorted.sort((a, b) => dueValue(a) - dueValue(b));
    return sorted;
  }, [items, lane, bucketFilter, search, sort, hiddenIds, lens]);

  // Durable quick-add task: POST /api/hub/tasks (Phase 1A write path). 상세 토글을 열면
  // 기한·우선순위도 한 번에 저장 — 기본은 제목만(빠른 경로) 그대로 유지.
  const createTask = async () => {
    const title = quickTitle.trim();
    if (!title || saving) return;
    setSaving(true);
    try {
      const payload = { title };
      if (showQuickDetail) {
        if (quickDue) payload.dueAt = quickDue;
        if (quickPriority && quickPriority !== 'medium') payload.priority = quickPriority;
      }
      const res = await fetch('/api/hub/tasks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.status === 'saved') {
        setQuickTitle('');
        setQuickDue('');
        setQuickPriority('medium');
        setNotice({ tone: 'ok', label: '할 일 저장됨' });
        await reload();
      } else {
        setNotice({ tone: 'err', label: data.error || `저장 실패 (${data.status || res.status})` });
      }
    } catch (error) {
      setNotice({ tone: 'err', label: error instanceof Error ? error.message : String(error) });
    } finally {
      setSaving(false);
    }
  };

  const UNDO_WINDOW_MS = 3500;
  const STRIKE_MS = 180; // matches DESIGN.md's 120–180ms motion guide

  // The actual persist — only ever called after the undo window closes (or never, if the
  // user hits 되돌리기 first). Kept separate from scheduleComplete so board-lens drags and
  // the drawer's own status field can still complete a task immediately if they need to.
  const persistComplete = async (item) => {
    try {
      const res = await fetch('/api/hub/tasks', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: item.entityId, status: 'done' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.status !== 'saved') throw new Error(data.error || `완료 저장 실패 ${res.status}`);
      setNotice({ tone: 'ok', label: '할 일 완료됨' });
      await reload();
    } catch (error) {
      setNotice({ tone: 'err', label: error instanceof Error ? error.message : String(error) });
    } finally {
      setHiddenIds((s) => { if (!s.has(item.id)) return s; const n = new Set(s); n.delete(item.id); return n; });
    }
  };

  // Checkbox click: flash strikethrough, drop out of view, then give a real 되돌리기 window
  // before the PATCH actually fires — an accidental tap is recoverable, not just visually
  // undoable-in-appearance.
  const scheduleComplete = (item) => {
    if (item.lane !== 'task') return;
    const id = item.id;
    setCompletingIds((s) => new Set(s).add(id));
    setTimeout(() => {
      setCompletingIds((s) => { const n = new Set(s); n.delete(id); return n; });
      setHiddenIds((s) => new Set(s).add(id));
    }, STRIKE_MS);

    setNotice({ tone: 'ok', label: '할 일 완료됨', action: { label: '되돌리기', onClick: () => undoComplete(item) } });

    const timerId = setTimeout(() => {
      pendingTimers.current.delete(id);
      persistComplete(item);
    }, UNDO_WINDOW_MS);
    pendingTimers.current.set(id, timerId);
  };

  const undoComplete = (item) => {
    const id = item.id;
    const timerId = pendingTimers.current.get(id);
    if (timerId) { clearTimeout(timerId); pendingTimers.current.delete(id); }
    setCompletingIds((s) => { const n = new Set(s); n.delete(id); return n; });
    setHiddenIds((s) => { const n = new Set(s); n.delete(id); return n; });
    setNotice({ tone: 'ok', label: '완료 취소됨' });
  };

  // Board-lens drag-to-reschedule + 패널 미루기 (tasks only — deals/events have no working
  // due-date write path here). Dropping on 지남 is a no-op (there's no sensible date for
  // "make this overdue").
  const rescheduleTask = async (item, dueAt, noticeLabel = '기한 변경됨') => {
    try {
      const res = await fetch('/api/hub/tasks', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: item.entityId, dueAt }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.status !== 'saved') throw new Error(data.error || `기한 변경 실패 ${res.status}`);
      setNotice({ tone: 'ok', label: noticeLabel });
      await reload();
    } catch (error) {
      setNotice({ tone: 'err', label: error instanceof Error ? error.message : String(error) });
    }
  };

  const dropOnBucket = (bucketKey) => {
    const item = visible.find((i) => i.id === dragItemId);
    setDragItemId(null);
    if (!item || item.lane !== 'task' || bucketKey === 'overdue') return;
    const seoulDate = (offsetDays) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date(Date.now() + offsetDays * 86400000));
    const dueAt = bucketKey === 'today' ? seoulDate(0) : bucketKey === 'week' ? seoulDate(1) : null; // 'later' clears the date
    rescheduleTask(item, dueAt);
  };

  // 행 클릭 → 우측 상세 패널 토글 (모든 레인). 할 일 편집(EditDrawer)·Deals 이동·
  // 프로젝트 이동·Calendar 열기는 패널 안의 액션 버튼이 담당한다.
  const openItem = (item) => setDetailId((cur) => (cur === item.id ? null : item.id));

  // Task edit drawer — 패널의 "상세 편집" 버튼에서 연다. Edits title/status/priority/due
  // through the extended PATCH /api/hub/tasks contract (update_task accepts a partial patch).
  const openTaskDraft = (item) => {
    setTaskDraft({ id: item.entityId, title: item.title, status: item.status, priority: item.priority || 'medium', dueAt: item.whenAt || '' });
  };

  const detailItem = React.useMemo(
    () => (detailId ? items.find((i) => i.id === detailId && !hiddenIds.has(i.id)) || null : null),
    [detailId, items, hiddenIds],
  );
  const deferTarget = nextDeferTarget();

  const toggleProject = (projectId) => {
    setCollapsedProjects((prev) => {
      const next = new Set(prev);
      next.has(projectId) ? next.delete(projectId) : next.add(projectId);
      return next;
    });
  };

  // ESC는 상세 패널을 접는다 — EditDrawer가 열려 있으면 드로어의 자체 ESC가 우선이고
  // 패널은 유지한다 (taskDraft 가드).
  React.useEffect(() => {
    if (!detailId) return undefined;
    const onKey = (e) => { if (e.key === 'Escape' && !taskDraft) setDetailId(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [detailId, taskDraft]);

  const persistTaskDetail = async () => {
    if (!taskDraft?.title?.trim()) return { ok: false, status: 'invalid-input' };
    try {
      const res = await fetch('/api/hub/tasks', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: taskDraft.id,
          title: taskDraft.title,
          status: taskDraft.status,
          priority: taskDraft.priority,
          dueAt: taskDraft.dueAt || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.status !== 'saved') {
        setNotice({ tone: 'err', label: data.error || `저장 실패 (${data.status || res.status})` });
        return { ok: false, status: data.status || 'error' };
      }
      setNotice({ tone: 'ok', label: '할 일 업데이트됨' });
      await reload();
      return { ok: true, status: 'saved' };
    } catch (error) {
      setNotice({ tone: 'err', label: error instanceof Error ? error.message : String(error) });
      return { ok: false, status: 'error' };
    }
  };

  // Page-level N focuses quick-add (list surface create contract, §8.1); / focuses search
  // (Linear/Notion convention).
  React.useEffect(() => {
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      const tag = t && t.tagName ? t.tagName.toLowerCase() : '';
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || (t && t.isContentEditable)) return;
      if (e.key === 'n' || e.key === 'N') { e.preventDefault(); quickRef.current?.focus(); return; }
      if (e.key === '/') { e.preventDefault(); searchRef.current?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ↑↓ moves real focus between visible rows (roving tabindex) when the list lens is open —
  // Enter/Space then just work through each row's own handler, no separate global handler
  // needed for them. Only active outside text fields, same guard as N//.
  React.useEffect(() => {
    if (lens !== 'list') return undefined;
    const onKey = (e) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const t = e.target;
      const tag = t && t.tagName ? t.tagName.toLowerCase() : '';
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      const refs = rowRefs.current.filter(Boolean);
      if (!refs.length) return;
      e.preventDefault();
      const active = document.activeElement;
      const currentIdx = refs.indexOf(active);
      const nextIdx = currentIdx === -1
        ? 0
        : e.key === 'ArrowDown'
          ? Math.min(refs.length - 1, currentIdx + 1)
          : Math.max(0, currentIdx - 1);
      refs[nextIdx]?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lens, visible.length]);

  // rowRefs 인덱스는 렌더 순서 카운터로 배정한다 — 아코디언 접힘/그룹핑 때문에 visible
  // 인덱스와 렌더 순서가 달라질 수 있다. 언마운트된 행은 React가 ref(null)로 비우고,
  // 화살표 핸들러가 Boolean 필터로 걸러낸다.
  let rowRenderIndex = 0;
  const nextRowRef = () => {
    const i = rowRenderIndex;
    rowRenderIndex += 1;
    return (el) => { rowRefs.current[i] = el; };
  };

  const laneCounts = React.useMemo(() => {
    const counts = { all: items.length, task: 0, deal: 0, event: 0 };
    items.forEach((i) => { counts[i.lane] += 1; });
    return counts;
  }, [items]);

  // 현재 레인 기준 기한 버킷 카운트 — 시그널 스트립과 기한 세그먼트가 같은 숫자를 쓴다
  // (타일 클릭 결과로 보이는 행 수와 일치해야 신뢰할 수 있는 계기가 된다).
  const bucketCounts = React.useMemo(() => {
    const counts = { overdue: 0, today: 0, week: 0, later: 0 };
    items.forEach((i) => {
      if (hiddenIds.has(i.id)) return;
      if (lane !== 'all' && i.lane !== lane) return;
      counts[normalizeBucket(i)] += 1;
    });
    return counts;
  }, [items, hiddenIds, lane]);

  // 리스트 렌즈 그룹 섹션 — 전체 기한 보기일 때만. rows는 프로젝트 아코디언까지 반영된
  // 렌더 구조 (item 행 + project 그룹 행).
  const listSections = React.useMemo(() => {
    if (bucketFilter !== 'all') return null;
    const sections = [];
    BUCKETS.forEach((b) => {
      const bucketItems = visible.filter((i) => normalizeBucket(i) === b.key);
      if (!bucketItems.length) return;
      sections.push({ key: b.key, count: bucketItems.length, rows: buildSectionRows(bucketItems) });
    });
    return sections;
  }, [bucketFilter, visible]);

  return (
    <div className="hub-page" style={{ padding: 'var(--section-gap)', display: 'flex', flexDirection: 'column', gap: 'var(--gap)', height: '100%', maxWidth: 1080, margin: '0 auto', width: '100%' }}>
      <div className="hub-page-header" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>내 작업</h2>
          <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span>할 일<SyncBadge state={sources.tasks || 'loading'} /></span>
            <span>딜<SyncBadge state={sources.deals || 'loading'} /></span>
            <span>일정<SyncBadge state={sources.calendar || 'loading'} /></span>
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <SegmentedControl className="hub-page-actions" label="보기 렌즈" options={LENSES} value={lens} onChange={setLens} />
      </div>

      {/* 시그널 스트립 — "지금 뭐가 급한가"를 숫자로 먼저 답한다 (DESIGN.md 경험 원칙 1).
          타일 클릭 = 리스트 렌즈 + 해당 기한 필터, 다시 클릭하면 전체로 복귀. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--gap)' }}>
        {SIGNAL_TILES.map((t) => {
          const count = bucketCounts[t.key] || 0;
          const active = lens === 'list' && bucketFilter === t.key;
          return (
            <button
              key={t.key}
              type="button"
              aria-pressed={active}
              onClick={() => {
                if (lens !== 'list') setLens('list');
                setBucketFilter(active ? 'all' : t.key);
              }}
              style={{
                textAlign: 'left', padding: '10px 14px', cursor: 'pointer',
                background: active ? 'var(--surface-2)' : 'var(--surface)',
                border: `1px solid ${active ? 'var(--line-strong)' : 'var(--line-soft)'}`,
                borderRadius: 'var(--r-lg)',
                boxShadow: count > 0 && t.stripe ? `inset 2px 0 0 ${t.stripe}` : undefined,
                transition: 'background 120ms ease, border-color 120ms ease',
              }}
            >
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--fg-dim)' }}>{t.label}</div>
              {/* 시그널 스트립은 이 페이지의 hero 지표 — Rhythm 카드(30px)와 같은 급의
                  .stat 크기로 "signal first"를 시각적으로도 주장한다. */}
              <div className="stat" style={{ fontSize: 26, fontWeight: 500, marginTop: 4, color: count > 0 ? t.color : 'var(--fg-faint)' }}>{count}</div>
            </button>
          );
        })}
      </div>

      {/* Quick capture — Enter saves a durable task; N focuses. 상세 토글로 기한·우선순위 추가. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            ref={quickRef}
            value={quickTitle}
            onChange={(e) => setQuickTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') createTask(); }}
            placeholder="새 할 일 — Enter로 저장"
            // outline을 죽이지 않는다 — 전역 :focus-visible 링(§11)이 키보드 포커스를 표시한다.
            style={{
              flex: 1, height: 36, padding: '0 12px', fontSize: 13,
              background: 'var(--surface)', border: '1px solid var(--line)',
              borderRadius: 'var(--r-sm)',
            }}
          />
          <IconButton
            icon={showQuickDetail ? 'x' : 'clock'}
            tooltip={showQuickDetail ? '상세 닫기' : '기한·우선순위 추가'}
            onClick={() => setShowQuickDetail((v) => !v)}
            tone={showQuickDetail ? 'danger' : undefined}
          />
          <Button variant="primary" size="sm" icon="plus" onClick={createTask} disabled={saving || !quickTitle.trim()}>
            할 일 <Kbd>N</Kbd>
          </Button>
        </div>
        {showQuickDetail && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', paddingLeft: 2 }}>
            <input
              type="date"
              value={quickDue}
              onChange={(e) => setQuickDue(e.target.value)}
              style={{
                height: 30, padding: '0 10px', fontSize: 12,
                background: 'var(--surface-2)', border: '1px solid var(--line-soft)',
                borderRadius: 'var(--r-sm)', color: 'var(--fg)',
              }}
            />
            <select
              value={quickPriority}
              onChange={(e) => setQuickPriority(e.target.value)}
              style={{
                height: 30, padding: '0 8px', fontSize: 12,
                background: 'var(--surface-2)', border: '1px solid var(--line-soft)',
                borderRadius: 'var(--r-sm)', color: 'var(--fg)',
              }}
            >
              {TASK_PRIORITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <span style={{ fontSize: 11, color: 'var(--fg-faint)' }}>비워두면 기한 없음·보통 우선순위로 저장</span>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <Input ref={searchRef} icon="search" placeholder="제목 검색 (/)" value={search} onChange={setSearch} style={{ width: 180 }} />
        <SegmentedControl
          label="레인 필터"
          options={LANE_OPTIONS.map((o) => ({ ...o, count: laneCounts[o.key] || 0 }))}
          value={lane}
          onChange={setLane}
        />
        {lens === 'list' && (
          <SegmentedControl
            label="기한 필터"
            options={BUCKET_OPTIONS.map((o) => (o.key === 'all' ? o : { ...o, count: bucketCounts[o.key] || 0 }))}
            value={bucketFilter}
            onChange={setBucketFilter}
          />
        )}
        {lens !== 'week' && <SegmentedControl label="정렬" options={SORT_OPTIONS} value={sort} onChange={setSort} />}
        {notice && (
          <span style={{ fontSize: 11.5, color: notice.tone === 'ok' ? 'var(--success)' : 'var(--danger)', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            {notice.label}
            {notice.action && (
              <button
                onClick={notice.action.onClick}
                style={{ fontSize: 11.5, color: 'var(--moon-200)', textDecoration: 'underline', cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}
              >
                {notice.action.label}
              </button>
            )}
          </span>
        )}
      </div>

      {/* 본문 그리드 — 상세 패널이 열리면 우측 300px 칼럼이 생긴다 (모바일은 세로 스택,
          hub-tokens.css .hub-mywork-grid). */}
      <div
        className="hub-mywork-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: detailItem ? 'minmax(0, 1fr) 300px' : 'minmax(0, 1fr)',
          gap: 'var(--gap)',
          alignItems: 'start',
        }}
      >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap)', minWidth: 0 }}>

      {state === 'loading' && (
        <Card><div style={{ fontSize: 12.5, color: 'var(--fg-muted)', padding: 8 }}>기록을 읽는 중…</div></Card>
      )}
      {state === 'error' && (
        <Card>
          <EmptyState icon="alert" title="읽기 실패" description="attention 기록을 불러오지 못했습니다." action={<Button variant="outline" size="sm" onClick={reload}>다시 시도</Button>} />
        </Card>
      )}

      {state === 'ready' && lens === 'list' && (
        <Card pad={false} style={{ overflow: 'hidden' }}>
          {visible.length === 0 ? (
            <EmptyState
              icon="check"
              title={search.trim() ? `"${search.trim()}" 검색 결과가 없습니다` : '표시할 항목이 없습니다'}
              description={
                search.trim()
                  ? '다른 검색어를 시도하거나 검색을 지워보세요.'
                  : lane === 'all' && bucketFilter === 'all'
                    ? '할 일을 추가하거나 딜·일정이 생기면 여기에 모입니다.'
                    : `${lane !== 'all' ? LANE_LABEL[lane] : ''}${lane !== 'all' && bucketFilter !== 'all' ? ' · ' : ''}${bucketFilter !== 'all' ? BUCKETS.find((b) => b.key === bucketFilter)?.label : ''} 조건에 항목이 없습니다.`
              }
              action={
                search.trim()
                  ? <Button variant="outline" size="sm" onClick={() => setSearch('')}>검색 지우기</Button>
                  : (lane !== 'all' || bucketFilter !== 'all')
                    ? <Button variant="outline" size="sm" onClick={() => { setLane('all'); setBucketFilter('all'); }}>필터 초기화</Button>
                    : undefined
              }
              style={{ minHeight: 180, padding: '28px 12px' }}
            />
          ) : listSections ? (
            // 전체 기한 보기: 긴급도 그룹 헤더가 스캔 축 — 빈 그룹은 그리지 않는다.
            listSections.map((section) => (
              <React.Fragment key={section.key}>
                <div style={{
                  padding: '6px var(--pad-x)', display: 'flex', alignItems: 'center', gap: 6,
                  fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em',
                  color: BUCKET_HEADER[section.key].color,
                  background: 'var(--surface-2)', borderBottom: '1px solid var(--line-soft)',
                }}>
                  {BUCKET_HEADER[section.key].label}
                  <span className="mono" style={{ fontSize: 11 }}>{section.count}</span>
                </div>
                {section.rows.map((row) => {
                  if (row.type === 'item') {
                    return (
                      <ItemRow
                        key={row.item.id}
                        item={row.item}
                        onComplete={scheduleComplete}
                        onOpen={openItem}
                        completing={completingIds.has(row.item.id)}
                        selected={detailId === row.item.id}
                        showReason={sort === 'priority'}
                        rowRef={nextRowRef()}
                      />
                    );
                  }
                  // 프로젝트 아코디언 — 같은 프로젝트 할 일 2개 이상을 접기/펴기.
                  const isCollapsed = collapsedProjects.has(row.projectId);
                  return (
                    <React.Fragment key={`project-${section.key}-${row.projectId}`}>
                      <div
                        ref={nextRowRef()}
                        className="hub-row"
                        role="button"
                        tabIndex={0}
                        aria-expanded={!isCollapsed}
                        onClick={() => toggleProject(row.projectId)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleProject(row.projectId); } }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          padding: 'var(--pad-y) var(--pad-x)', minHeight: 'var(--row-h)',
                          borderBottom: '1px solid var(--line-soft)', cursor: 'pointer',
                        }}
                      >
                        <Iconed name="chevronD" size={12} style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'none', transition: 'transform 120ms ease', color: 'var(--fg-faint)' }} />
                        <Iconed name="projects" size={13} style={{ color: 'var(--fg-dim)' }} />
                        <span style={{ fontSize: 12.5, fontWeight: 600, flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {row.projectName}
                        </span>
                        {/* 카운트 pill — projects 페이지 아코디언 헤더와 같은 처리 (드리프트 방지). */}
                        <span className="mono" style={{ fontSize: 10.5, color: 'var(--fg-faint)', background: 'var(--surface-2)', padding: '1px 6px', borderRadius: 4 }}>{row.items.length}</span>
                      </div>
                      {!isCollapsed && (
                        <div style={{ marginLeft: 10, borderLeft: '1px solid var(--line-soft)' }}>
                          {row.items.map((item) => (
                            <ItemRow
                              key={item.id}
                              item={item}
                              onComplete={scheduleComplete}
                              onOpen={openItem}
                              completing={completingIds.has(item.id)}
                              selected={detailId === item.id}
                              showReason={sort === 'priority'}
                              hideProject
                              rowRef={nextRowRef()}
                            />
                          ))}
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}
              </React.Fragment>
            ))
          ) : (
            visible.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                onComplete={scheduleComplete}
                onOpen={openItem}
                completing={completingIds.has(item.id)}
                selected={detailId === item.id}
                showReason={sort === 'priority'}
                rowRef={nextRowRef()}
              />
            ))
          )}
        </Card>
      )}

      {state === 'ready' && lens === 'board' && (
        <ScrollShadowX>
          {BUCKETS.map((b) => {
            const bucketItems = visible.filter((i) => i.bucket === b.key);
            const dropTarget = Boolean(dragItemId) && b.key !== 'overdue';
            return (
              <div key={b.key}
                onDragOver={(e) => { if (dropTarget) e.preventDefault(); }}
                onDrop={(e) => { if (dropTarget) { e.preventDefault(); dropOnBucket(b.key); } }}
                style={{
                width: 250, flexShrink: 0, background: 'var(--surface)',
                border: dropTarget ? '1px dashed var(--moon-300)' : '1px solid var(--line-soft)',
                borderRadius: 'var(--r-lg)',
                display: 'flex', flexDirection: 'column',
                transition: 'border-color 120ms ease',
              }}>
                <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--line-soft)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{b.label}</span>
                  <span className="mono" style={{ fontSize: 12, color: 'var(--fg-muted)', marginLeft: 'auto' }}>{bucketItems.length}</span>
                </div>
                <div className="scroll-y" style={{ flex: 1, padding: 8, display: 'flex', flexDirection: 'column', gap: 6, minHeight: 80 }}>
                  {bucketItems.map((item) => {
                    const clickable = Boolean(item.href) || item.lane === 'task' || item.lane === 'event';
                    const draggable = item.lane === 'task';
                    return (
                      <div
                        key={item.id}
                        className="hub-kanban-card"
                        role={clickable ? 'button' : undefined}
                        tabIndex={clickable ? 0 : undefined}
                        draggable={draggable}
                        onDragStart={draggable ? () => setDragItemId(item.id) : undefined}
                        onDragEnd={draggable ? () => setDragItemId(null) : undefined}
                        onClick={clickable ? () => openItem(item) : undefined}
                        onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openItem(item); } } : undefined}
                        style={{
                          background: 'var(--surface-2)', border: '1px solid var(--line-soft)',
                          borderRadius: 'var(--r-sm)', padding: '9px 10px',
                          cursor: draggable ? 'grab' : clickable ? 'pointer' : 'default',
                          opacity: dragItemId === item.id ? 0.4 : 1,
                          boxShadow: item.stalled ? 'inset 2px 0 0 var(--warning-line)' : undefined,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                          <Badge tone={LANE_TONE[item.lane]} size="xs" variant="outline">{LANE_LABEL[item.lane]}</Badge>
                          <span className="mono" style={{ fontSize: 10.5, color: 'var(--fg-faint)', marginLeft: 'auto' }}>{item.whenLabel}</span>
                        </div>
                        <div style={{ fontSize: 12.5, lineHeight: 1.4 }}>{item.title}</div>
                        {item.meta && <div className="mono" style={{ fontSize: 10.5, color: 'var(--fg-muted)', marginTop: 4 }}>{item.meta}</div>}
                      </div>
                    );
                  })}
                  {bucketItems.length === 0 && (
                    <div style={{ fontSize: 11.5, color: 'var(--fg-faint)', padding: '14px 6px', textAlign: 'center' }}>
                      {dropTarget ? '여기에 놓기' : '비어 있음'}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </ScrollShadowX>
      )}

      {state === 'ready' && lens === 'week' && (
        sources.calendar !== 'live' && lane === 'event' ? (
          <Card>
            <EmptyState
              icon="calendar"
              title="Google Calendar가 연결되지 않았습니다"
              description={calendarReason || '연결하면 이번 주 일정이 할 일·딜과 함께 표시됩니다.'}
              action={<Button variant="outline" size="sm" onClick={() => onNavigate?.('dashboard/work/calendar')}>Calendar 설정 열기</Button>}
              style={{ minHeight: 180, padding: '28px 12px' }}
            />
          </Card>
        ) : (
          <WeekAgenda
            items={visible}
            sourcesCalendar={sources.calendar}
            onComplete={scheduleComplete}
            onOpen={openItem}
            onNavigate={onNavigate}
            completingIds={completingIds}
            selectedId={detailId}
          />
        )
      )}

      </div>

      {detailItem && (
        <DetailPanel
          item={detailItem}
          completing={completingIds.has(detailItem.id)}
          deferTarget={deferTarget}
          onClose={() => setDetailId(null)}
          onComplete={() => scheduleComplete(detailItem)}
          onDefer={() => rescheduleTask(detailItem, deferTarget.dueAt, `${deferTarget.label}로 미룸`)}
          onEdit={() => openTaskDraft(detailItem)}
          onNavigate={onNavigate}
        />
      )}
      </div>

      <EditDrawer
        title={taskDraft ? (taskDraft.title || '할 일 편집') : ''}
        subtitle={taskDraft ? `${taskDraft.id} · 할 일 편집` : ''}
        record={taskDraft}
        fields={[
          { key: 'title', label: '제목' },
          { key: 'status', label: '상태', type: 'select', options: TASK_STATUS_OPTIONS },
          { key: 'priority', label: '우선순위', type: 'select', options: TASK_PRIORITY_OPTIONS },
          { key: 'dueAt', label: '기한', inputType: 'date' },
        ]}
        onChange={(key, val) => setTaskDraft((d) => (d ? { ...d, [key]: val } : d))}
        onSave={persistTaskDetail}
        onClose={() => setTaskDraft(null)}
      />
    </div>
  );
}

// 주간 렌즈 — 7-day agenda (grid가 아니라 목록: 모바일 우선, 미니멀). Each day lists its
// items; undated items stay out (they live in 리스트/보드 '나중').
function WeekAgenda({ items, sourcesCalendar, onComplete, onOpen, onNavigate, completingIds, selectedId }) {
  const days = React.useMemo(() => {
    const out = [];
    const now = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(now.getTime() + i * 86400000);
      const key = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
      const label = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', weekday: 'short' }).format(d);
      out.push({ key, label, isToday: i === 0 });
    }
    return out;
  }, []);

  const itemsByDay = React.useMemo(() => {
    const map = new Map(days.map((d) => [d.key, []]));
    items.forEach((item) => {
      if (!item.whenAt) return;
      const key = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(item.whenAt));
      if (map.has(key)) map.get(key).push(item);
    });
    map.forEach((list) => list.sort((a, b) => new Date(a.whenAt) - new Date(b.whenAt)));
    return map;
  }, [items, days]);

  const overdue = items.filter((i) => i.bucket === 'overdue');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap)' }}>
      {sourcesCalendar !== 'live' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: 'var(--fg-muted)' }}>
          <SyncBadge state="preview" />
          일정 레인 미연결 — 할 일·딜 기한만 표시 중입니다.
          <Button variant="ghost" size="xs" onClick={() => onNavigate?.('dashboard/work/calendar')}>연결</Button>
        </div>
      )}
      {overdue.length > 0 && (
        <Card pad={false} style={{ overflow: 'hidden', boxShadow: 'inset 2px 0 0 var(--danger-line)' }}>
          <div style={{ padding: '8px 14px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--danger)', borderBottom: '1px solid var(--line-soft)' }}>
            기한 지남 {overdue.length}
          </div>
          {overdue.map((item) => (
            <ItemRow key={item.id} item={item} onComplete={onComplete} onOpen={onOpen} completing={completingIds.has(item.id)} selected={selectedId === item.id} />
          ))}
        </Card>
      )}
      {days.map((day) => {
        const dayItems = itemsByDay.get(day.key) || [];
        return (
          <Card key={day.key} pad={false} style={{ overflow: 'hidden' }}>
            <div style={{
              padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 8,
              borderBottom: dayItems.length ? '1px solid var(--line-soft)' : 'none',
            }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: day.isToday ? 'var(--moon-200)' : 'var(--fg)' }}>
                {day.label}{day.isToday ? ' · 오늘' : ''}
              </span>
              <span className="mono" style={{ fontSize: 11, color: 'var(--fg-faint)', marginLeft: 'auto' }}>{dayItems.length || ''}</span>
            </div>
            {dayItems.map((item) => (
              <ItemRow key={item.id} item={item} onComplete={onComplete} onOpen={onOpen} completing={completingIds.has(item.id)} selected={selectedId === item.id} />
            ))}
          </Card>
        );
      })}
    </div>
  );
}
