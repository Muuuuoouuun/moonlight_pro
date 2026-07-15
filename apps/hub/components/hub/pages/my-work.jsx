"use client";

import React from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Badge, Card, Button, Checkbox, EmptyState, SyncBadge, Kbd, SegmentedControl, ScrollShadowX, Input, IconButton, EditDrawer } from "../hub-primitives";

// 내 작업 — one personal operating surface, three lenses over the cross-lane attention
// read model (tasks + open deals + calendar week). Design contract from the operator:
// 핵심 정보만 (one line per item), 최신 기준 default sort, and fast lens/lane/sort toggles.
// Native surfaces (Deals kanban, Projects board) stay the deep-work views — every item
// here deep-links back to its home drawer.

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

// One minimal row: [checkbox|dot] title …… meta · when. Everything else lives in the
// record's native drawer (deals) or the inline task drawer (tasks) — onOpen resolves both.
function ItemRow({ item, onComplete, onOpen }) {
  const clickable = Boolean(item.href) || item.lane === 'task';
  return (
    <div
      className="hub-row"
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? () => onOpen(item) : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(item); } } : undefined}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: 'var(--pad-y) var(--pad-x)', minHeight: 'var(--row-h)',
        borderBottom: '1px solid var(--line-soft)',
        cursor: clickable ? 'pointer' : 'default',
        boxShadow: item.bucket === 'overdue' ? 'inset 2px 0 0 var(--danger-line)'
          : item.stalled ? 'inset 2px 0 0 var(--warning-line)' : undefined,
      }}
    >
      {item.lane === 'task' ? (
        <Checkbox checked={false} onChange={() => onComplete(item)} label={`${item.title} 완료`} />
      ) : (
        <Badge tone={LANE_TONE[item.lane]} size="xs" variant="outline">{LANE_LABEL[item.lane]}</Badge>
      )}
      <span style={{ fontSize: 13, color: 'var(--fg)', flex: 1, minWidth: '35%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {item.title}
      </span>
      {item.meta && (
        // 폭 상한 + 말줄임 — 좁은 화면에서 meta가 제목(identity)을 짓누르지 않게 한다
        // (2026-07 design-review FINDING-001의 모바일 identity-first 원칙).
        <span className="mono" style={{
          fontSize: 11, color: 'var(--fg-muted)', flexShrink: 1, maxWidth: '38%',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{item.meta}</span>
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

  const [lane, setLane] = React.useState('all');
  const [bucketFilter, setBucketFilter] = React.useState('all');
  const [sort, setSort] = React.useState('recent');
  const [search, setSearch] = React.useState('');
  const [quickTitle, setQuickTitle] = React.useState('');
  const [showQuickDetail, setShowQuickDetail] = React.useState(false);
  const [quickDue, setQuickDue] = React.useState('');
  const [quickPriority, setQuickPriority] = React.useState('medium');
  const [saving, setSaving] = React.useState(false);
  const [notice, setNotice] = React.useState(null); // { tone, label }
  const [taskDraft, setTaskDraft] = React.useState(null);
  const quickRef = React.useRef(null);

  const visible = React.useMemo(() => {
    let filtered = lane === 'all' ? items : items.filter((i) => i.lane === lane);
    if (bucketFilter !== 'all') filtered = filtered.filter((i) => i.bucket === bucketFilter);
    const q = search.trim().toLowerCase();
    if (q) filtered = filtered.filter((i) => i.title.toLowerCase().includes(q));
    const sorted = [...filtered];
    if (sort === 'recent') sorted.sort((a, b) => recencyValue(b) - recencyValue(a));
    else sorted.sort((a, b) => dueValue(a) - dueValue(b));
    return sorted;
  }, [items, lane, bucketFilter, search, sort]);

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

  const completeTask = async (item) => {
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
    }
  };

  // Task detail drawer — opens on row click, edits title/status/priority/due through the
  // extended PATCH /api/hub/tasks contract (update_task now accepts a partial patch, not
  // just status). Deals still deep-link to their native Deals drawer via href.
  const openItem = (item) => {
    if (item.lane === 'task') {
      setTaskDraft({ id: item.entityId, title: item.title, status: item.status, priority: item.priority || 'medium', dueAt: item.whenAt || '' });
      return;
    }
    if (item.href) onNavigate?.(item.href);
  };

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

  // Page-level N focuses quick-add (list surface create contract, §8.1).
  React.useEffect(() => {
    const onKey = (e) => {
      if ((e.key !== 'n' && e.key !== 'N') || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      const tag = t && t.tagName ? t.tagName.toLowerCase() : '';
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || (t && t.isContentEditable)) return;
      e.preventDefault();
      quickRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const laneCounts = React.useMemo(() => {
    const counts = { all: items.length, task: 0, deal: 0, event: 0 };
    items.forEach((i) => { counts[i.lane] += 1; });
    return counts;
  }, [items]);

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
        <SegmentedControl className="hub-page-actions" options={LENSES} value={lens} onChange={setLens} />
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
            style={{
              flex: 1, height: 36, padding: '0 12px', fontSize: 13,
              background: 'var(--surface)', border: '1px solid var(--line)',
              borderRadius: 'var(--r-sm)', outline: 'none',
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
                borderRadius: 'var(--r-sm)', outline: 'none', color: 'var(--fg)',
              }}
            />
            <select
              value={quickPriority}
              onChange={(e) => setQuickPriority(e.target.value)}
              style={{
                height: 30, padding: '0 8px', fontSize: 12,
                background: 'var(--surface-2)', border: '1px solid var(--line-soft)',
                borderRadius: 'var(--r-sm)', outline: 'none', color: 'var(--fg)',
              }}
            >
              {TASK_PRIORITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <span style={{ fontSize: 11, color: 'var(--fg-faint)' }}>비워두면 기한 없음·보통 우선순위로 저장</span>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <Input icon="search" placeholder="제목 검색" value={search} onChange={setSearch} style={{ width: 180 }} />
        <SegmentedControl
          options={LANE_OPTIONS.map((o) => ({ ...o, label: `${o.label} ${laneCounts[o.key] || 0}` }))}
          value={lane}
          onChange={setLane}
        />
        {lens === 'list' && <SegmentedControl options={BUCKET_OPTIONS} value={bucketFilter} onChange={setBucketFilter} />}
        {lens !== 'week' && <SegmentedControl options={SORT_OPTIONS} value={sort} onChange={setSort} />}
        {notice && (
          <span style={{ fontSize: 11.5, color: notice.tone === 'ok' ? 'var(--success)' : 'var(--danger)' }}>
            {notice.label}
          </span>
        )}
      </div>

      {state === 'loading' && (
        <Card><div style={{ fontSize: 12.5, color: 'var(--fg-muted)', padding: 8 }}>원장을 읽는 중…</div></Card>
      )}
      {state === 'error' && (
        <Card>
          <EmptyState icon="alert" title="읽기 실패" description="attention 원장을 불러오지 못했습니다." action={<Button variant="outline" size="sm" onClick={reload}>다시 시도</Button>} />
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
          ) : (
            visible.map((item) => (
              <ItemRow key={item.id} item={item} onComplete={completeTask} onOpen={openItem} />
            ))
          )}
        </Card>
      )}

      {state === 'ready' && lens === 'board' && (
        <ScrollShadowX>
          {BUCKETS.map((b) => {
            const bucketItems = visible.filter((i) => i.bucket === b.key);
            return (
              <div key={b.key} style={{
                width: 250, flexShrink: 0, background: 'var(--surface)',
                border: '1px solid var(--line-soft)', borderRadius: 'var(--r-lg)',
                display: 'flex', flexDirection: 'column',
              }}>
                <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--line-soft)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{b.label}</span>
                  <span className="mono" style={{ fontSize: 12, color: 'var(--fg-muted)', marginLeft: 'auto' }}>{bucketItems.length}</span>
                </div>
                <div className="scroll-y" style={{ flex: 1, padding: 8, display: 'flex', flexDirection: 'column', gap: 6, minHeight: 80 }}>
                  {bucketItems.map((item) => {
                    const clickable = Boolean(item.href) || item.lane === 'task';
                    return (
                      <div
                        key={item.id}
                        className="hub-kanban-card"
                        role={clickable ? 'button' : undefined}
                        tabIndex={clickable ? 0 : undefined}
                        onClick={clickable ? () => openItem(item) : undefined}
                        onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openItem(item); } } : undefined}
                        style={{
                          background: 'var(--surface-2)', border: '1px solid var(--line-soft)',
                          borderRadius: 'var(--r-sm)', padding: '9px 10px',
                          cursor: clickable ? 'pointer' : 'default',
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
                    <div style={{ fontSize: 11.5, color: 'var(--fg-faint)', padding: '14px 6px', textAlign: 'center' }}>비어 있음</div>
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
          <WeekAgenda items={visible} sourcesCalendar={sources.calendar} onComplete={completeTask} onOpen={openItem} onNavigate={onNavigate} />
        )
      )}

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
function WeekAgenda({ items, sourcesCalendar, onComplete, onOpen, onNavigate }) {
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
            <ItemRow key={item.id} item={item} onComplete={onComplete} onOpen={onOpen} />
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
              <ItemRow key={item.id} item={item} onComplete={onComplete} onOpen={onOpen} />
            ))}
          </Card>
        );
      })}
    </div>
  );
}
