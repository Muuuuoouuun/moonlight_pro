"use client";

import React from "react";
import { JournalSources } from "../journal-links";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Iconed } from "../hub-icons";
import { Badge, Card, Button, Checkbox, CheckboxRow, DateQuickPresets, EmptyState, SyncBadge, Kbd, SegmentedControl, ScrollShadowX, Input, IconButton, EditDrawer, Skeleton, TruthBadge, useToast } from "../hub-primitives";
import { focusLimitMessage, MAX_FOCUS_PER_DAY } from "@/lib/task-today";
import { UNDO_WINDOW_MS, useUndoableAction } from "../use-undoable-action";
import { triggerCelebration, triggerSparkleAt } from "../celebration-fx";
import { TASK_PRIORITY_OPTIONS, TASK_STATUS_OPTIONS } from "@/lib/pms-ui";
import { clearSubmittedQuickTaskDraft, shouldSubmitQuickTask } from "@/lib/quick-task-capture";
import { freezeTaskCommand, saveTaskCommand, TASK_OUTCOME } from "@/lib/memo-intake-tasks";
import { applyMute, clearMute, mutedIdSet, readMuteStore, seoulDayKey, writeMuteStore } from "./my-work-mute.js";
import { requestPersonaChat } from "../persona-client";
import { buildMyWorkChecklistToggle, readMyWorkChecklistReceipt } from './my-work-checklist';

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

const LANE_TONE = { task: 'neutral', deal: 'neutral', event: 'neutral' };
const LANE_LABEL = { task: '할 일', deal: '딜', event: '일정' };

const BUCKETS = [
  // 오늘 3개 — 운영자가 오늘로 고른 할 일(meta.focus_dates). 기한 버킷보다 앞선다(2026-09-20 §6.2).
  { key: 'focus', label: '오늘 3개', tone: 'moon' },
  { key: 'overdue', label: '지남', tone: 'danger' },
  { key: 'today', label: '오늘', tone: 'neutral' },
  { key: 'week', label: '이번 주', tone: 'neutral' },
  { key: 'later', label: '나중', tone: 'neutral' },
];
const BUCKET_RANK = { focus: 0, overdue: 1, today: 2, week: 3, later: 4 };
const BUCKET_OPTIONS = [{ key: 'all', label: '전체 기한' }, ...BUCKETS];
// 서버 bucket 키가 넷 밖이면(방어) '나중'으로 흡수 — 그룹/카운트가 항목을 잃지 않게.
const normalizeBucket = (item) => (BUCKET_RANK[item.bucket] != null ? item.bucket : 'later');
// 오늘 3개는 원래 기한을 보존하지만, 명시적으로 해제한 과거 알림은 다시 경고하지 않는다.
const visibleDueBucket = (item) => item.deadlineAlertSuppressed ? 'later' : (item.dueBucket || item.bucket);

// 시그널 스트립 타일 — 클릭하면 리스트 렌즈 + 해당 기한 필터 토글. '나중'은 신호가
// 아니므로 타일에서 제외 (기한 세그먼트 토글에는 그대로 있다).
const SIGNAL_TILES = [
  { key: 'focus', label: '오늘 3개', color: 'var(--moon-300)' },
  { key: 'overdue', label: '기한 지남', color: 'var(--danger)', stripe: 'var(--danger)' },
  { key: 'today', label: '오늘', color: 'var(--fg)' },
  { key: 'week', label: '이번 주', color: 'var(--fg-dim)' },
];

// 리스트 그룹 헤더 텍스트 톤 — 긴급 버킷만 semantic 색, 나머지는 중립 (§5.2 절제).
const BUCKET_HEADER = {
  focus: { label: '오늘 3개', color: 'var(--moon-300)' },
  overdue: { label: '기한 지남', color: 'var(--danger)' },
  today: { label: '오늘', color: 'var(--fg-dim)' },
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
//
// groupEvents(2026-07-17 운영자 피드백 "모든 일정이 다 나와서 체크하기 힘듦"): 일정은
// 읽기 전용 컨텍스트라 체크 대상(할 일·딜)과 같은 행으로 섞이면 스캔을 망친다. 실행
// 항목을 먼저 두고, 일정은 섹션 맨 뒤 "일정 N" 아코디언 하나로 묶는다(시간순 정렬).
// 레인 필터가 '일정'이거나 검색 중일 때는 호출부가 groupEvents를 끈다 — 그때는 일정
// 자체가 찾는 대상이므로 접으면 안 된다.
function buildSectionRows(sectionItems, groupEvents = false) {
  const listItems = groupEvents ? sectionItems.filter((i) => i.lane !== 'event') : sectionItems;
  const events = groupEvents ? sectionItems.filter((i) => i.lane === 'event') : [];
  const counts = new Map();
  listItems.forEach((i) => {
    if (i.lane === 'task' && i.projectId) counts.set(i.projectId, (counts.get(i.projectId) || 0) + 1);
  });
  const rows = [];
  const grouped = new Set();
  listItems.forEach((item) => {
    const pid = item.lane === 'task' ? item.projectId : null;
    if (pid && (counts.get(pid) || 0) >= 2) {
      if (grouped.has(pid)) return;
      grouped.add(pid);
      rows.push({
        type: 'project',
        projectId: pid,
        projectName: item.projectName || '프로젝트',
        items: listItems.filter((x) => x.lane === 'task' && x.projectId === pid),
      });
      return;
    }
    rows.push({ type: 'item', item });
  });
  if (events.length) {
    rows.push({
      type: 'events',
      items: [...events].sort((a, b) => new Date(a.whenAt || 0) - new Date(b.whenAt || 0)),
    });
  }
  return rows;
}

function readStoredOption(key, options, fallback) {
  if (typeof window === 'undefined') return fallback;
  try {
    const stored = window.localStorage.getItem(key);
    return stored && options.some((o) => o.key === stored) ? stored : fallback;
  } catch { return fallback; } // Safari private 등 storage 차단 환경
}
function writeStoredOption(key, value) {
  try { if (typeof window !== 'undefined') window.localStorage.setItem(key, value); } catch { /* ignore */ }
}

function recencyValue(item) {
  const t = new Date(item.recencyAt || 0).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function dueValue(item) {
  // 기한 sort: overdue first (oldest first), no-date last.
  // 모르는 버킷은 '나중'으로 — `focus`가 0번으로 들어와 순위가 한 칸씩 밀렸으므로 숫자 대신 키로 적는다.
  const rank = BUCKET_RANK[item.bucket] ?? BUCKET_RANK.later;
  const t = item.whenAt ? new Date(item.whenAt).getTime() : Number.MAX_SAFE_INTEGER;
  return rank * 1e15 + (Number.isNaN(t) ? Number.MAX_SAFE_INTEGER : t);
}

function priorityValue(item) {
  return Number.isFinite(item.priorityScore) ? item.priorityScore : 0;
}

// 모듈 스코프 stale-while-revalidate — 탭 복귀마다 10콜+캘린더 체인을 기다리며 목록이
// 비던 것을 제거(4차 재감사 속도 M). 캐시 즉시 서빙 + 항상 배경 재검증.
const ATTENTION_CACHE_SERVABLE_MS = 5 * 60 * 1000;
let attentionLedgerCache = null; // { at, data, state }

function useAttentionLedger() {
  const cachedAttention = attentionLedgerCache
    && Date.now() - attentionLedgerCache.at < ATTENTION_CACHE_SERVABLE_MS
    ? attentionLedgerCache
    : null;
  const [data, setData] = React.useState(cachedAttention ? cachedAttention.data : { items: [], sources: {}, calendarReason: '', projects: [], focusToday: null });
  const [state, setState] = React.useState(cachedAttention ? cachedAttention.state : 'loading');
  // 완료/미루기 뒤 reload가 겹치면 늦은 이전 응답이 최신 목록을 덮는다 — 최신 요청만 반영.
  const requestRef = React.useRef(0);

  const load = React.useCallback(async () => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    const isCurrent = () => requestRef.current === requestId;
    try {
      const res = await fetch('/api/hub/attention', { cache: 'no-store' });
      const json = await res.json().catch(() => null);
      if (!isCurrent()) return null;
      if (!res.ok || !json || json.status === 'error') {
        // 캐시 서빙 중이면 error로 화면을 비우지 않고 오래된 데이터임을 표시한다.
        // 단, 신선도 게이트를 통과한(=실제로 서빙 중인) 캐시만 — 만료 캐시 위에서
        // 'stale'을 선언하면 빈 목록이 "마지막 데이터"로 위장된다(5차 재감사 S).
        const servingCache = attentionLedgerCache
          && Date.now() - attentionLedgerCache.at < ATTENTION_CACHE_SERVABLE_MS;
        setState(servingCache ? 'stale' : 'error');
        return null;
      }
      const nextData = { items: json.items || [], sources: json.sources || {}, calendarReason: json.calendarReason || '', projects: json.projects || [], focusToday: json.focusToday || null };
      attentionLedgerCache = { at: Date.now(), data: nextData, state: 'ready' };
      setData(nextData);
      setState('ready');
      return json;
    } catch {
      if (isCurrent()) {
        const servingCache = attentionLedgerCache
          && Date.now() - attentionLedgerCache.at < ATTENTION_CACHE_SERVABLE_MS;
        setState(servingCache ? 'stale' : 'error');
      }
      return null;
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
function ItemRow({ item, onComplete, onOpen, completing, selected, rowRef, showReason, hideProject, justAdded, onDefer, mutedEntry, onMute, onUnmute, onToggleFocus, focusFull }) {
  // 오늘 3개는 원래 기한을 보이되, 해제한 과거 기한은 경고색을 되살리지 않는다.
  const dueBucket = visibleDueBucket(item);
  // 우선순위 정렬일 때는 meta 자리에 정렬 근거(reason)를 보여준다 — 첫 화면 요구사항
  // "지금 해야 하는 이유"(profile §4)를 행 높이 증가 없이 전달.
  const projectLabel = !hideProject && item.lane === 'task' ? item.projectName || '' : '';
  const metaText = showReason && item.priorityReason
    ? item.priorityReason
    : [projectLabel, item.meta].filter(Boolean).join(' · ');

  // Mobile swipe gesture: right > 55px to complete, left < -55px to defer
  const touchStartRef = React.useRef({ x: 0, y: 0, time: 0 });
  const [swipeOffset, setSwipeOffset] = React.useState(0);
  const [swipeAction, setSwipeAction] = React.useState(null);

  const handleTouchStart = (e) => {
    if (item.lane !== 'task') return;
    const t = e.touches[0];
    touchStartRef.current = { x: t.clientX, y: t.clientY, time: Date.now() };
    setSwipeOffset(0);
    setSwipeAction(null);
  };

  const handleTouchMove = (e) => {
    if (item.lane !== 'task') return;
    const t = e.touches[0];
    const dx = t.clientX - touchStartRef.current.x;
    const dy = t.clientY - touchStartRef.current.y;
    // If vertical scrolling is dominant, ignore swipe
    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dx) < 24) return;

    // Damped offset
    const damped = Math.sign(dx) * Math.min(84, Math.abs(dx) * 0.7);
    setSwipeOffset(damped);
    if (dx > 55) setSwipeAction('complete');
    else if (dx < -55 && onDefer) setSwipeAction('defer');
    else setSwipeAction(null);
  };

  const handleTouchEnd = () => {
    if (item.lane !== 'task') return;
    const currentOffset = swipeOffset;
    setSwipeOffset(0);
    setSwipeAction(null);

    if (currentOffset > 50) {
      onComplete(item);
    } else if (currentOffset < -50 && onDefer) {
      onDefer(item);
    }
  };

  return (
    <div
      ref={rowRef}
      id={`mywork-row-${item.id}`}
      className="hub-row"
      role="button"
      tabIndex={0}
      onClick={() => onOpen(item)}
      onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onOpen(item); } }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: 'var(--pad-y) var(--pad-x)', minHeight: 'var(--row-h)',
        borderBottom: '1px solid var(--line-soft)',
        cursor: 'pointer',
        position: 'relative',
        touchAction: 'pan-y',
        transform: swipeOffset ? `translateX(${swipeOffset}px)` : undefined,
        // 스와이프 방향은 라벨·아이콘·행 이동이 말한다 — 배경색으로 분류하지 않는다(§5.3).
        // 초록/파랑 raw rgba는 §5.2의 "페이지 안 하드코딩 금지"에도 걸렸다.
        background: swipeAction
          ? 'var(--surface-3)'
          : justAdded
          ? 'var(--surface-3)'
          : selected
          ? 'var(--surface-2)'
          : undefined,
        boxShadow: dueBucket === 'overdue' ? 'inset 1px 0 0 var(--danger)'
          : item.stalled ? 'inset 1px 0 0 var(--line-strong)'
            : justAdded ? 'inset 1px 0 0 var(--accent)' : undefined,
        transition: swipeOffset ? 'none' : 'transform var(--dur-enter) var(--ease-hub), background var(--dur-enter) ease, box-shadow var(--dur-enter) ease',
      }}
    >
      {item.lane === 'task' ? (
        <Checkbox checked={completing} onChange={(_next, e) => onComplete(item, e)} label={`${item.title} 완료`} />
      ) : (
        <Badge tone={LANE_TONE[item.lane]} size="xs" variant="outline">{LANE_LABEL[item.lane]}</Badge>
      )}
      {/* 완료 표현(흐린 색·취소선·전이)은 .hub-task-completed(hub-tokens.css)가 소유한다 —
          인라인 textDecoration·transition은 그 클래스를 이겨 중복·드리프트만 만든다. */}
      <span className={completing ? 'hub-task-completed' : undefined} style={{
        fontSize: 13, color: 'var(--fg)', flex: 1, minWidth: '35%',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        opacity: completing ? 0.65 : 1,
      }}>
        {item.title}
      </span>
      {/* §5.3: 완료는 check 글리프 + 중립 텍스트(초록 금지), 미루기는 clock 글리프.
          이모지는 §15 2026-09-22가 첫 화면에서 걷어낸 어휘라 새로 쓰지 않는다. */}
      {swipeAction === 'complete' && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: 'var(--fg)' }}>
          <Iconed name="check" size={12} /> 완료
        </span>
      )}
      {swipeAction === 'defer' && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)' }}>
          <Iconed name="clock" size={12} /> 미루기
        </span>
      )}
      {metaText && !swipeAction && (
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
      {/* 숨김 상태는 색이 아니라 라벨로 말한다(§5.3) — '숨김 N' 토글을 켰을 때만 보이는 행. */}
      {mutedEntry && (
        <Badge tone="neutral" size="xs" variant="outline">{mutedEntry.until ? '오늘 숨김' : '숨김'}</Badge>
      )}
      <span className="mono" style={{
        fontSize: 11, flexShrink: 0, minWidth: 64, textAlign: 'right',
        color: dueBucket === 'overdue' ? 'var(--danger)' : dueBucket === 'today' ? 'var(--fg-muted)' : 'var(--fg-faint)',
      }}>
        {item.whenLabel}
      </span>
      {item.lane === 'task' && onToggleFocus && !swipeAction && (
        // 오늘 3개 토글(§6.2) — 고른 행은 항상 보이고(data-open), 안 고른 행은 hover/포커스에서 드러난다.
        // 색은 선택 상태(Moonstone, §5.2 selected)에만 쓰고 라벨(툴팁·aria-pressed)이 뜻을 말한다.
        // 상한(서버 요약 기준 3건)에 닿으면 넣기는 비활성(§8.1).
        <span className="hub-row-action" data-open={item.focusToday ? 'true' : undefined}>
          <IconButton
            icon="star"
            size={24}
            iconSize={13}
            tooltip={item.focusToday ? '오늘 3개에서 빼기' : focusFull ? `오늘 3개가 찼습니다 (${MAX_FOCUS_PER_DAY}/${MAX_FOCUS_PER_DAY})` : '오늘 3개에 넣기'}
            aria-pressed={item.focusToday ? 'true' : 'false'}
            disabled={!item.focusToday && Boolean(focusFull)}
            className={item.focusToday ? 'hub-iconbtn--star-active' : ''}
            onClick={(e) => { e.stopPropagation(); onToggleFocus(item); }}
            onKeyDown={(e) => e.stopPropagation()}
          />
        </span>
      )}
      {/* 행 보조 액션 — hover/포커스에서만 드러나는 한 번 클릭 정리(.hub-row-action).
          여기 있는 건 되돌리기 쉬운 '오늘 안 보기' 하나뿐이고, '아예 안 보기'는 행을 열어
          상세 패널에서 고른다(무기한 숨김은 의도적으로 한 단계 더 깊게 둔다). */}
      {onMute && !swipeAction && (
        // 래퍼가 .hub-row-action을 갖는다 — IconButton은 display를 인라인으로 쓰기 때문에
        // 버튼 자체에 건 display 규칙(터치 기기에서 숨김)은 이기지 못한다.
        <span className="hub-row-action" data-open={mutedEntry ? 'true' : undefined}>
          {mutedEntry ? (
            <IconButton
              icon="eye"
              size={24}
              iconSize={13}
              tooltip="목록에 다시 표시"
              onClick={(e) => { e.stopPropagation(); onUnmute(item); }}
              onKeyDown={(e) => e.stopPropagation()}
            />
          ) : (
            <IconButton
              icon="eyeOff"
              size={24}
              iconSize={13}
              tooltip="오늘 안 보기 — 내일 다시 표시"
              onClick={(e) => { e.stopPropagation(); onMute(item, 'today'); }}
              onKeyDown={(e) => e.stopPropagation()}
            />
          )}
        </span>
      )}
    </div>
  );
}

function TaskDecomposeSection({ task, onTaskCreated }) {
  const [open, setOpen] = React.useState(false);
  // decompose.status: idle | loading | done | preview | error — preview·error를 "분해 결과 없음"으로 그리지 않는다(§5.3).
  const [decompose, setDecompose] = React.useState({ status: 'idle', note: '' });
  const [actions, setActions] = React.useState([]);
  const toast = useToast();
  const patchAction = (id, patch) => setActions((prev) => prev.map((item) => item.id === id ? { ...item, ...patch } : item));

  const handleDecompose = async () => {
    setOpen(true);
    setDecompose({ status: 'loading', note: '' });
    try {
      const res = await requestPersonaChat({
        personaId: "order",
        mode: "extract-actions",
        draft: `[실행 분해 대상 할 일]: ${task.title}\n프로젝트: ${task.projectName || '없음'}\n우선순위: ${task.priority || '보통'}\n\n이 할 일을 운영자가 부담 없이 10분~15분 안에 착수하고 완료할 수 있는 구체적인 3단계 하위 실행 액션으로 분해해줘.`,
      });
      if (res.state === "done") {
        const lines = res.text.split("\n");
        const parsed = [];
        for (const line of lines) {
          const trimmed = line.trim();
          const match = trimmed.match(/^[-*•0-9.]+\s*\[?[ xX]?\]?\s*(.+)$/);
          if (match && match[1] && !match[1].startsWith("[") && match[1].length > 2 && !match[1].includes("핵심 요약") && !match[1].includes("추천 다음 액션")) {
            parsed.push(match[1].replace(/^\[|\]$/g, "").trim());
          } else if (trimmed.startsWith("1.") || trimmed.startsWith("2.") || trimmed.startsWith("3.")) {
            parsed.push(trimmed.replace(/^[0-9.]+\s*/, "").trim());
          }
        }
        // 후보마다 고정 id를 붙인다 — 등록 상태도, 재시도 때 다시 보낼 명령 id도 이 id에 묶인다.
        setActions(parsed.slice(0, 3).map((title) => ({ id: crypto.randomUUID(), task: title, status: 'pending', error: null })));
        setDecompose({ status: 'done', note: '' });
      } else {
        setActions([]);
        setDecompose({ status: res.state === 'preview' ? 'preview' : 'error', note: res.note || '' });
      }
    } catch (e) {
      setActions([]);
      setDecompose({ status: 'error', note: e?.message || '' });
    }
  };

  // 이미 분해했으면 다시 AI를 부르지 않고 펼친다 — 재분해는 새 id를 만들어 이미 등록한 후보를
  // 다시 등록 가능한 상태로 되돌린다.
  const reopen = () => ['done', 'loading'].includes(decompose.status) ? setOpen(true) : handleDecompose();

  // res.ok만 보면 202 preview가 "등록됨"이 되고 재시도마다 새 할 일이 생긴다. 첫 시도 전에 명령을
  // 굳히고(같은 id 재전송 = 엔진 duplicate), 저장 판정은 공용 경로(saveTaskCommand)가 봉투로 한다.
  const handleAddSubtask = async (action) => {
    if (action.status === 'sending' || action.status === 'saved') return;
    const frozen = freezeTaskCommand(action, { projectId: task.projectId || null, source: 'my-work-decompose' });
    patchAction(action.id, { command: frozen.command, status: 'sending', error: null });
    const outcome = await saveTaskCommand(frozen.command);
    patchAction(action.id, outcome);
    if (outcome.status === 'saved') {
      toast.success(`'${action.task}' 할 일로 등록됨`);
      onTaskCreated?.();
    }
  };

  return (
    <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
      {!open && (
        <Button type="button" variant="outline" size="sm" icon="sparkle" aria-expanded={false} onClick={reopen} style={{ width: "100%" }}>
          {decompose.status === 'done' ? "분해한 액션 보기" : decompose.status === 'loading' ? "3단계 액션 분해 중…" : "AI 실행 3단계 쪼개기"}
        </Button>
      )}

      {open && (
        <div
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--line-soft)",
            borderRadius: "var(--r-sm)",
            padding: "8px 10px",
            display: "flex",
            flexDirection: "column",
            gap: 6,
            fontSize: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <span style={{ fontWeight: 600, color: "var(--fg)", display: "flex", alignItems: "center", gap: 4 }}>
              <Iconed name="sparkle" size={12} style={{ color: "var(--fg-muted)" }} />
              추천 3단계 실행 분해
            </span>
            <Button type="button" variant="ghost" size="sm" aria-expanded={true} onClick={() => setOpen(false)}>접기</Button>
          </div>

          {decompose.status === 'loading' ? (
            <Skeleton lines={3} height={14} gap={6} label="할 일을 실행 단위로 분해 중" />
          ) : decompose.status === 'preview' || decompose.status === 'error' ? (
            <div role={decompose.status === 'error' ? 'alert' : 'status'} style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 6 }}>
              <TruthBadge state={decompose.status} label={decompose.status === 'preview' ? 'Preview · AI 연결 필요' : '분해 실패'} />
              <span style={{ color: "var(--fg-muted)" }}>
                {decompose.status === 'preview' ? 'AI 엔진이 연결되지 않아 액션을 분해하지 않았어요. 연결한 뒤 다시 분해하세요.' : `액션을 분해하지 못했어요.${decompose.note ? ` (${decompose.note})` : ''}`}
              </span>
              <Button type="button" variant="outline" size="xs" onClick={handleDecompose}>다시 분해</Button>
            </div>
          ) : actions.length > 0 ? (
            <div aria-live="polite" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {actions.map((action, i) => {
                const saved = action.status === 'saved';
                const sending = action.status === 'sending';
                const settled = TASK_OUTCOME[action.status];
                return (
                  <div
                    key={action.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                      gap: 6,
                      background: "var(--surface-3)",
                      padding: "4px 8px",
                      borderRadius: "var(--r-xs)",
                    }}
                  >
                    <span style={{ flex: "1 1 160px", color: "var(--fg)", overflowWrap: "anywhere" }}>
                      {i + 1}. {action.task}
                    </span>
                    {settled && <TruthBadge state={settled.truth} label={settled.label} />}
                    <Button
                      variant={saved ? "ghost" : "outline"}
                      size="xs"
                      disabled={saved || sending}
                      icon={saved ? "check" : "plus"}
                      onClick={() => handleAddSubtask(action)}
                    >
                      {saved ? "등록됨" : sending ? "등록 중…" : settled ? settled.retry : "추가"}
                    </Button>
                    {settled && action.error && <span style={{ flexBasis: "100%", color: "var(--fg-muted)", fontSize: 11 }}>{action.error}</span>}
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ color: "var(--fg-muted)" }}>분해된 액션이 없습니다.</div>
          )}
        </div>
      )}
    </div>
  );
}

function DealOutreachSection({ deal }) {
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [draftText, setDraftText] = React.useState("");
  const [copied, setCopied] = React.useState(false);
  const toast = useToast();

  const handleGenerate = async () => {
    setLoading(true);
    setOpen(true);
    try {
      const res = await requestPersonaChat({
        personaId: "sales",
        mode: "outreach-draft",
        draft: `[고객 딜 연락 맥락]\n고객/딜: ${deal.title}\n단계 및 금액: ${deal.meta || "미정"}\n우선순위/상태: ${deal.priorityReason || ""}\n\n위 고객에게 카카오톡 또는 문자로 가볍게 안부를 묻고 다음 일정을 조율할 수 있는 3~4문장의 부담 없는 연락 메시지를 써줘.`,
      });
      setLoading(false);
      if (res.state === "done") {
        setDraftText(res.text);
      } else {
        toast.error(res.note || "초안 생성 실패");
      }
    } catch (e) {
      setLoading(false);
      toast.error(e.message || "오류 발생");
    }
  };

  const handleCopy = () => {
    if (!draftText) return;
    navigator.clipboard.writeText(draftText);
    setCopied(true);
    toast.success("메시지 초안이 복사되었습니다. 메신저에 붙여넣으세요.");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
      {!open && (
        <button
          type="button"
          onClick={handleGenerate}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            height: 28,
            fontSize: 11,
            fontWeight: 500,
            borderRadius: "var(--r-xs)",
            border: "1px dashed var(--line-strong)",
            background: "var(--surface-2)",
            color: "var(--moon-200)",
            cursor: "pointer",
            width: "100%",
          }}
        >
          <Iconed name="sparkle" size={12} />
          {loading ? "연락 초안 작성 중…" : "✍️ 카톡/문자 연락 초안 생성"}
        </button>
      )}

      {open && (
        <div
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--line-soft)",
            borderRadius: "var(--r-sm)",
            padding: "8px 10px",
            display: "flex",
            flexDirection: "column",
            gap: 6,
            fontSize: 11.5,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontWeight: 600, color: "var(--fg)", display: "flex", alignItems: "center", gap: 4 }}>
              <Iconed name="sparkle" size={12} style={{ color: "var(--moon-300)" }} />
              추천 연락 초안
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", color: "var(--fg-faint)", cursor: "pointer", fontSize: 10 }}
            >
              접기
            </button>
          </div>

          {loading ? (
            <div style={{ color: "var(--fg-muted)", fontSize: 11, padding: "8px 0" }}>
              고객 맥락에 맞는 초안을 작성하고 있습니다…
            </div>
          ) : draftText ? (
            <>
              <div
                style={{
                  background: "var(--surface-3)",
                  padding: "8px",
                  borderRadius: "var(--r-xs)",
                  whiteSpace: "pre-wrap",
                  fontSize: 11.5,
                  lineHeight: 1.5,
                  color: "var(--fg)",
                }}
              >
                {draftText}
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <Button variant="outline" size="xs" icon={copied ? "check" : "copy"} onClick={handleCopy}>
                  {copied ? "복사됨 ✓" : "본문 복사"}
                </Button>
              </div>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}

// 우측 상세 패널 — 행 클릭 시 열리는 간단 요약 + 다음 행동. 딥워크는 각 레인의 네이티브
// 서피스(할 일 EditDrawer · Deals 드로어 · 프로젝트 · Google Calendar)로 넘긴다.
// ESC/닫기 버튼으로 접힌다 (§8.1 닫기 계약의 패널 버전).
function DetailPanel({ item, completing, deferTarget, onClose, onComplete, onDefer, onEdit, onNavigate, mutedEntry, onMute, onUnmute, onTaskCreated, onToggleFocus, onToggleChecklist, checklistSaving, focusFull }) {
  const bucketMeta = BUCKET_HEADER[normalizeBucket(item)];
  const checklist = item.lane === 'task' && Array.isArray(item.checklist) ? item.checklist : [];
  const checklistDone = checklist.filter((step) => step.done).length;
  // mono는 계기 데이터(기한·단계·금액)만 — 상태/프로젝트명/근거 같은 '단어' 값을 mono로
  // 두면 이름이 ID처럼 읽힌다 (DESIGN §6 하이브리드 숫자 규칙).
  const rows = [
    {
      label: '기한',
      value: item.whenLabel,
      mono: true,
      tone: visibleDueBucket(item) === 'overdue' ? 'var(--danger)' : undefined,
    },
    item.lane === 'task' && item.focusToday && { label: '오늘 3개', value: '고름' },
    item.lane === 'task' && {
      label: '상태',
      value: TASK_STATUS_OPTIONS.find((o) => o.value === item.status)?.label || item.status,
    },
    item.lane === 'task' && {
      label: '우선순위',
      value: TASK_PRIORITY_OPTIONS.find((o) => o.value === item.priority)?.label || item.priority,
    },
    item.lane === 'task' && item.projectName && { label: '프로젝트', value: item.projectName },
    item.lane === 'task' && item.nextAction && { label: '다음 행동', value: item.nextAction },
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
      <div style={{ padding: 'var(--pad-y) var(--pad-x)', borderBottom: '1px solid var(--line-soft)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <Badge tone={LANE_TONE[item.lane]} size="xs" variant="outline">{LANE_LABEL[item.lane]}</Badge>
        <span style={{ fontSize: 11, color: bucketMeta.color, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          {bucketMeta.label}
        </span>
        <div style={{ flex: 1 }} />
        <IconButton icon="x" tooltip="패널 닫기 (ESC)" onClick={onClose} />
      </div>
      <div style={{ padding: 'var(--pad-y) var(--pad-x)', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 14, fontWeight: 500, lineHeight: 1.45, textDecoration: completing ? 'line-through' : 'none' }}>
          {item.title}
        </div>
        <JournalSources refs={item.sourceRefs} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {rows.map((r) => (
            <div key={r.label} style={{ display: 'flex', gap: 8, fontSize: 12, alignItems: 'baseline' }}>
              <span style={{ width: 64, flexShrink: 0, color: 'var(--fg-dim)' }}>{r.label}</span>
              <span className={r.mono ? 'mono' : undefined} style={{ color: r.tone || 'var(--fg-muted)', minWidth: 0, overflowWrap: 'anywhere' }}>{r.value}</span>
            </div>
          ))}
        </div>

        {checklist.length > 0 && (
          <section aria-label="할 일 체크리스트" aria-busy={checklistSaving ? 'true' : undefined}
            style={{ borderTop: '1px solid var(--line-soft)', paddingTop: 10 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
              <strong style={{ fontSize: 12, fontWeight: 600 }}>체크리스트</strong>
              <span className="num" style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{checklistDone}/{checklist.length}</span>
              {checklistSaving && <span role="status" style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--fg-muted)' }}>저장 중…</span>}
            </div>
            {!item.updatedAt && <p role="status" style={{ fontSize: 12, color: 'var(--fg-muted)' }}>작업 버전을 확인한 뒤 체크할 수 있어요.</p>}
            {checklist.map((step) => (
              <div key={step.id} style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <CheckboxRow checked={step.done} text={step.title} disabled={checklistSaving || !item.updatedAt}
                  onChange={() => onToggleChecklist?.(item, step.id)}
                  style={{ flex: 1, minWidth: 0, minHeight: 44, textAlign: 'left', overflowWrap: 'anywhere' }} />
                {step.dueAt && <span className="mono" style={{ flexShrink: 0, fontSize: 12, color: 'var(--fg-muted)' }}>{step.dueAt}</span>}
              </div>
            ))}
          </section>
        )}

        {/* AI 보조 섹션: 할 일 실행 분해 또는 딜 연락 초안 */}
        {item.lane === 'task' && (
          <TaskDecomposeSection key={item.id} task={item} onTaskCreated={onTaskCreated} />
        )}
        {item.lane === 'deal' && (
          <DealOutreachSection deal={item} />
        )}
      </div>
      <div style={{ padding: 'var(--pad-y) var(--pad-x)', borderTop: '1px solid var(--line-soft)', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {item.lane === 'task' && (
          <>
            <Button variant="primary" size="sm" icon="check" onClick={onComplete} disabled={completing}>완료</Button>
            {/* 오늘 3개 — 사람이 고른 오늘의 일. 서버가 하루 3건을 강제한다(2026-09-20 §6.2). */}
            {onToggleFocus && (
              <Button
                variant={item.focusToday ? 'outline' : 'secondary'}
                size="sm"
                icon="star"
                onClick={onToggleFocus}
                disabled={!item.focusToday && Boolean(focusFull)}
              >
                {item.focusToday ? '오늘 3개에서 빼기' : focusFull ? `오늘 3개가 찼습니다 (${MAX_FOCUS_PER_DAY}/${MAX_FOCUS_PER_DAY})` : '오늘 3개에 넣기'}
              </Button>
            )}
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
        {/* 숨기기 — 기록은 그대로 두고 이 목록에서만 걷어낸다. 딜을 파이프라인에서까지
            치우는 건 Revenue 보드의 '파이프라인에서 숨기기'(deals.hidden_at)가 따로 한다.
            되돌리기: 오늘 숨김은 내일 자동 복귀, 무기한 숨김은 툴바의 '숨김 N' 토글. */}
        <div style={{ borderTop: '1px solid var(--line-soft)', marginTop: 2, paddingTop: 8, display: 'flex', gap: 6 }}>
          {mutedEntry ? (
            <Button variant="outline" size="sm" icon="eye" onClick={onUnmute} style={{ flex: 1 }}>목록에 다시 표시</Button>
          ) : (
            <>
              <Button variant="ghost" size="sm" icon="clock" onClick={() => onMute('today')} style={{ flex: 1 }}>오늘 안 보기</Button>
              <Button variant="ghost" size="sm" icon="eyeOff" onClick={() => onMute('forever')} style={{ flex: 1 }}>아예 안 보기</Button>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}

export function MyWork({ onNavigate }) {
  const { items, sources, calendarReason, projects, focusToday, state, reload } = useAttentionLedger();
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
  // 기본 정렬은 기한 임박순 — Q116 확정(2026-08-18): 종류 무관 기한순, 동일 기한은
  // 고객 > 프로젝트 > 콘텐츠. '최신'은 수동 토글로 유지.
  const [sort, setSortState] = React.useState('due');
  React.useEffect(() => {
    setLaneState(readStoredOption('mlp.mywork.lane', LANE_OPTIONS, 'all'));
    setBucketFilterState(readStoredOption('mlp.mywork.bucket', BUCKET_OPTIONS, 'all'));
    setSortState(readStoredOption('mlp.mywork.sort', SORT_OPTIONS, 'recent'));
  }, []);
  const setLane = (v) => { setLaneState(v); writeStoredOption('mlp.mywork.lane', v); };
  const setBucketFilter = (v) => { setBucketFilterState(v); writeStoredOption('mlp.mywork.bucket', v); };
  const setSort = (v) => { setSortState(v); writeStoredOption('mlp.mywork.sort', v); };

  // 숨김(뮤트) — '오늘 안 보기'(내일 자동 복귀)와 '아예 안 보기'(무기한). 기록 사실이
  // 아니라 이 표면의 보기 설정이라 lane/bucket/sort와 같은 localStorage 계층에 둔다
  // (근거는 my-work-mute.js 머리주석). 읽기도 같은 이유로 마운트 후 이펙트에서 —
  // useState 초기화에서 읽으면 SSR HTML과 첫 렌더가 갈려 하이드레이션 불일치가 난다.
  const [muted, setMuted] = React.useState(() => ({}));
  const [showMuted, setShowMuted] = React.useState(false);
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    setMuted(readMuteStore(window.localStorage));
  }, []);
  const todayKey = seoulDayKey();
  const mutedIds = React.useMemo(() => mutedIdSet(muted, todayKey), [muted, todayKey]);

  const [search, setSearch] = React.useState('');
  const [quickDraft, setQuickDraft] = React.useState({ title: '', dueAt: '', priority: 'medium' });
  const { title: quickTitle, dueAt: quickDue, priority: quickPriority } = quickDraft;
  const setQuickTitle = value => setQuickDraft(current => ({ ...current, title: value }));
  const setQuickDue = value => setQuickDraft(current => ({ ...current, dueAt: value }));
  const setQuickPriority = value => setQuickDraft(current => ({ ...current, priority: value }));
  const [showQuickDetail, setShowQuickDetail] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const quickSavingRef = React.useRef(false);
  const [notice, setNotice] = React.useState(null); // { tone, label, action?: { label, onClick } }
  const [taskDraft, setTaskDraft] = React.useState(null);
  const [checklistSavingId, setChecklistSavingId] = React.useState(null);
  const checklistSavingRef = React.useRef(false);
  // 방금 추가한 할 일의 attention item.id — 저장 직후 그 행으로 스크롤 + 잠깐 하이라이트해서
  // "나중"(기한 없음) 버킷 맨 아래로 들어가도 추가된 걸 바로 확인하게 한다. 몇 초 뒤 해제.
  const [justAddedId, setJustAddedId] = React.useState(null);
  const toast = useToast();
  // 우측 상세 패널이 보고 있는 item.id — 파생 조회라서 reload 후 항목이 사라지면
  // (완료·삭제) 패널도 같이 닫힌다.
  const [detailId, setDetailId] = React.useState(null);
  const taskDeepLinkRef = React.useRef(null);
  // 접힌 프로젝트 아코디언 (projectId 기준, 세션 한정).
  const [collapsedProjects, setCollapsedProjects] = React.useState(() => new Set());
  // 일정 아코디언 펼침 상태 (버킷 키 기준) — 오늘 일정은 하루의 컨텍스트라 기본 펼침,
  // 이번 주·나중은 실행 항목을 밀어내는 주범이라 기본 접힘.
  const [expandedEventBuckets, setExpandedEventBuckets] = React.useState(() => new Set(['today']));
  const [dragItemId, setDragItemId] = React.useState(null);
  // completingIds: brief strikethrough flash. hiddenIds: optimistically removed from view
  // while the undo window (useUndoableAction) is still open — completeTask only actually
  // fires when a timer runs out, so "되돌리기" is a real cancel, not a re-create.
  const [completingIds, setCompletingIds] = React.useState(() => new Set());
  const [hiddenIds, setHiddenIds] = React.useState(() => new Set());
  // 낙관적 기한 변경 오버레이 — PATCH 응답을 기다리지 않고 카드가 즉시 버킷을 옮긴다.
  // 배경 reload가 서버 진실로 덮으면 해당 패치를 걷어낸다.
  const [itemPatches, setItemPatches] = React.useState({});
  // 공유 되돌리기 훅 — 언마운트 시 clear가 아니라 **flush**한다. 이전 구현은 타이머만
  // 지워서 "완료됨" 영수증 후 3.5초 내 페이지 이탈 시 PATCH가 조용히 증발했다.
  const { schedule: scheduleUndoable, cancel: cancelUndoable } = useUndoableAction();
  const quickRef = React.useRef(null);
  const searchRef = React.useRef(null);
  const rowRefs = React.useRef([]);

  const visible = React.useMemo(() => {
    const patched = Object.keys(itemPatches).length
      ? items.map((i) => (itemPatches[i.id] ? { ...i, ...itemPatches[i.id] } : i))
      : items;
    let filtered = lane === 'all' ? patched : patched.filter((i) => i.lane === lane);
    filtered = filtered.filter((i) => !hiddenIds.has(i.id));
    // 숨긴 항목은 '숨김 N' 토글을 켰을 때만 (뱃지 + 다시 표시 버튼과 함께) 돌아온다.
    if (!showMuted) filtered = filtered.filter((i) => !mutedIds.has(i.id));
    // Bucket filter is a 리스트-only control (board already shows every bucket as its own
    // column; week already shows every day) — applying it there too would silently empty
    // most columns/days without any visible chip explaining why.
    if (lens === 'list') {
      filtered = bucketFilter === 'all'
        // Q120 확정(2026-08-18): '전체 기한'은 기한 있는 실행만 — 무기한(나중)은 '나중' 렌즈로
        // 분리한다. 방금 추가한 무기한 할 일만 예외로 남겨 저장 확인 흐름을 지킨다.
        ? filtered.filter((i) => normalizeBucket(i) !== 'later' || i.id === justAddedId)
        : filtered.filter((i) => i.bucket === bucketFilter);
    }
    const q = search.trim().toLowerCase();
    if (q) filtered = filtered.filter((i) => i.title.toLowerCase().includes(q));
    const sorted = [...filtered];
    if (sort === 'recent') sorted.sort((a, b) => recencyValue(b) - recencyValue(a));
    else if (sort === 'priority') sorted.sort((a, b) => (priorityValue(b) - priorityValue(a)) || (recencyValue(b) - recencyValue(a)));
    else sorted.sort((a, b) => dueValue(a) - dueValue(b));
    return sorted;
  }, [items, lane, bucketFilter, search, sort, hiddenIds, lens, itemPatches, justAddedId, mutedIds, showMuted]);

  // 오늘 3개 선택 수 — 서버 요약(focusToday.picked, 완료된 선택 포함)을 기준으로 하고, 낙관 패치로
  // 아직 서버에 안 간 토글만 더한다. 이 값이 서버의 409 focus-limit 판정과 같은 분모다.
  const focusPickedCount = React.useMemo(() => {
    const serverPicked = Number.isFinite(focusToday?.picked) ? focusToday.picked : null;
    const listed = items.reduce((n, i) => {
      const patched = itemPatches[i.id] ? { ...i, ...itemPatches[i.id] } : i;
      return n + (patched.lane === 'task' && patched.focusToday ? 1 : 0);
    }, 0);
    if (serverPicked === null) return listed;
    const pending = items.reduce((n, i) => {
      const patch = itemPatches[i.id];
      if (!patch || typeof patch.focusToday !== 'boolean' || patch.focusToday === i.focusToday) return n;
      return n + (patch.focusToday ? 1 : -1);
    }, 0);
    return Math.max(listed, serverPicked + pending);
  }, [items, itemPatches, focusToday]);
  const focusFull = focusPickedCount >= MAX_FOCUS_PER_DAY;

  // Durable quick-add task: POST /api/hub/tasks (Phase 1A write path). 상세 토글을 열면
  // 기한·우선순위도 한 번에 저장 — 기본은 제목만(빠른 경로) 그대로 유지.
  const createTask = async () => {
    const title = quickTitle.trim();
    if (!title || quickSavingRef.current) return;
    const submittedDraft = quickDraft;
    quickSavingRef.current = true;
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
        const createdId = data.task?.id || data.id || null;
        // Saving one item must not erase the next item typed during the request.
        setQuickDraft(current => clearSubmittedQuickTaskDraft(current, submittedDraft));
        // 새 할 일이 무조건 화면에 보이도록: 리스트 렌즈로, 그리고 방금 만든 (대개 기한 없는)
        // 항목을 가릴 수 있는 레인·기한 필터를 해제한다. board/week나 'today' 필터 상태에서
        // 추가하면 새 항목이 안 보여 "추가가 안 된다"고 느끼던 문제(2026-07-18)를 막는다.
        if (lens !== 'list') setLens('list');
        if (lane !== 'all' && lane !== 'task') setLane('all');
        if (bucketFilter !== 'all') setBucketFilter('all');
        const fresh = await reload();
        const freshTasks = (fresh?.items || []).filter((i) => i.lane === 'task');
        const created = (createdId && freshTasks.find((i) => i.entityId === createdId))
          || freshTasks
            .filter((i) => i.title === title)
            .sort((a, b) => new Date(b.recencyAt || 0) - new Date(a.recencyAt || 0))[0]
          || null;
        if (created) {
          setJustAddedId(created.id);
          scrollToRow(created.id);
        }
        // 연속 입력이 기본값이다 — 버튼 클릭으로 저장하면 포커스가 버튼에 남아 다음
        // 한 줄을 바로 못 친다(Enter 저장 경로만 우연히 동작했다). 입력창으로 되돌린다.
        quickRef.current?.focus();
        const label = created?.bucket === 'later' ? '할 일 저장됨 · "나중"에 추가' : '할 일 저장됨';
        setNotice({
          tone: 'ok',
          label,
          action: created
            ? { label: '보기', onClick: () => { setJustAddedId(created.id); scrollToRow(created.id); } }
            : undefined,
        });
        toast.success(label);
      } else {
        const errMsg = data.error || `저장 실패 (${data.status || res.status})`;
        setNotice({ tone: 'err', label: errMsg });
        toast.error(errMsg);
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      setNotice({ tone: 'err', label: errMsg });
      toast.error(errMsg);
    } finally {
      quickSavingRef.current = false;
      setSaving(false);
    }
  };

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
  const scheduleComplete = (item, event) => {
    if (item.lane !== 'task') return;
    const id = item.id;
    if (event?.clientX != null && event?.clientY != null && (event.clientX !== 0 || event.clientY !== 0)) {
      triggerSparkleAt(event.clientX, event.clientY);
    } else if (event?.target?.getBoundingClientRect) {
      const rect = event.target.getBoundingClientRect();
      triggerSparkleAt(rect.left + rect.width / 2, rect.top + rect.height / 2);
    } else if (typeof document !== 'undefined') {
      const el = document.getElementById(`mywork-row-${id}`);
      if (el?.getBoundingClientRect) {
        const rect = el.getBoundingClientRect();
        triggerSparkleAt(rect.left + 24, rect.top + rect.height / 2);
      }
    }
    setCompletingIds((s) => new Set(s).add(id));
    setTimeout(() => {
      setCompletingIds((s) => { const n = new Set(s); n.delete(id); return n; });
      setHiddenIds((s) => new Set(s).add(id));
    }, STRIKE_MS);

    // 모든 할 일이 완료되었는지 확인 → 축하 불꽃놀이/폭죽 발사
    const remainingTasks = visible.filter((i) => i.lane === 'task' && !hiddenIds.has(i.id) && !completingIds.has(i.id) && i.id !== id);
    if (remainingTasks.length === 0) {
      triggerCelebration({ mode: 'fireworks' });
    }

    setNotice({ key: `complete-${id}`, tone: 'ok', label: '할 일 완료됨', action: { label: '되돌리기', onClick: () => undoComplete(item) } });
    toast.success('할 일을 완료했습니다.', { action: { label: '되돌리기', onClick: () => undoComplete(item) } });

    scheduleUndoable(id, () => {
      // 창이 닫히면 알림을 통째로 걷는다 — 버튼만 지우면 "완료됨" 라벨이 다음 액션까지
      // 영구 표시된다(7차 UIUX — revenue 활동 삭제·daily-brief 보류의 전체 소거 패턴으로 통일).
      setNotice((cur) => (cur?.key === `complete-${id}` ? null : cur));
      persistComplete(item);
    }, UNDO_WINDOW_MS);
  };

  const undoComplete = (item) => {
    const id = item.id;
    if (!cancelUndoable(id)) return; // 창이 이미 닫혔으면 PATCH가 나갔다 — 되돌릴 수 없음
    setCompletingIds((s) => { const n = new Set(s); n.delete(id); return n; });
    setHiddenIds((s) => { const n = new Set(s); n.delete(id); return n; });
    setNotice({ tone: 'ok', label: '완료 취소됨' });
    toast.info('완료를 취소했습니다.');
  };

  // Board-lens drag-to-reschedule + 패널 미루기 (tasks only — deals/events have no working
  // due-date write path here). Dropping on 지남 is a no-op (there's no sensible date for
  // "make this overdue").
  const rescheduleTask = async (item, dueAt, noticeLabel = '기한 변경됨') => {
    // KST 기준 낙관 버킷 — 서버 resolveDueBucket과 같은 경계(오늘/7일/없음).
    const todayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
    const bucket = !dueAt
      ? 'later'
      : dueAt < todayKey
        ? 'overdue'
        : dueAt === todayKey
          ? 'today'
          : (Date.parse(dueAt) - Date.parse(todayKey)) / 86400000 <= 7
            ? 'week'
            : 'later';
    const clearPatch = () => setItemPatches((p) => {
      if (!(item.id in p)) return p;
      const next = { ...p };
      delete next[item.id];
      return next;
    });
    setItemPatches((p) => ({ ...p, [item.id]: { bucket, whenAt: dueAt || null } }));
    setNotice({ tone: 'ok', label: noticeLabel });
    toast.info(noticeLabel);
    try {
      const res = await fetch('/api/hub/tasks', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: item.entityId, dueAt }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.status !== 'saved') throw new Error(data.error || `기한 변경 실패 ${res.status}`);
      // 배경 재검증 — 카드 이동을 붙잡지 않는다. 패치는 reload가 실제로 새 데이터를
      // 적용했을 때만 걷는다: superseded/실패 reload에서 걷으면 저장된 카드가 옛
      // 버킷으로 스냅백한다(재감사 안정성 L/M 레이스).
      reload().then((fresh) => { if (fresh) clearPatch(); }).catch(() => {}); // null = 실패/superseded → 패치 유지
    } catch (error) {
      clearPatch(); // 실패 → 원래 버킷으로 복귀
      setNotice({ tone: 'err', label: error instanceof Error ? error.message : String(error) });
    }
  };

  // 오늘 3개 토글 — PATCH { focus: { on } }. 배열(meta.focus_dates)은 서버가 병합하므로 지난
  // 날의 선택은 절대 지워지지 않는다. 상한 초과는 409 focus-limit로 돌아온다(2026-09-20 §6.2).
  // 옛 배열 토글(e0e5c80)에서 가져온 것: 다음 행동을 말하는 상한 카피, 실패 토스트, 저장 확인 뒤
  // 성공 토스트(§9 compact capture와 같은 "서버 확인 뒤 확정" 규칙).
  const toggleFocus = async (item, forceOn) => {
    if (item.lane !== 'task') return;
    const on = typeof forceOn === 'boolean' ? forceOn : !item.focusToday;
    if (on && item.focusToday) return;
    if (!on && !item.focusToday) return;
    if (on && focusFull) {
      const msg = focusLimitMessage();
      setNotice({ tone: 'err', label: msg });
      toast.error(msg);
      return;
    }
    const clearPatch = () => setItemPatches((p) => {
      if (!(item.id in p)) return p;
      const next = { ...p };
      delete next[item.id];
      return next;
    });
    setItemPatches((p) => ({ ...p, [item.id]: { ...(p[item.id] || {}), bucket: on ? 'focus' : visibleDueBucket(item), focusToday: on } }));
    const label = on ? '오늘 3개에 넣음' : '오늘 3개에서 뺌';
    setNotice({ tone: 'ok', label });
    try {
      const res = await fetch('/api/hub/tasks', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: item.entityId, focus: { on } }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409 && data.error === 'focus-limit') {
        throw new Error(focusLimitMessage(data.limit || MAX_FOCUS_PER_DAY));
      }
      if (!res.ok || data.status !== 'saved') throw new Error(data.error || `오늘 3개 저장 실패 ${res.status}`);
      toast.success(label);
      reload().then((fresh) => { if (fresh) clearPatch(); }).catch(() => {});
    } catch (error) {
      clearPatch();
      const msg = error instanceof Error ? error.message : String(error);
      setNotice({ tone: 'err', label: msg });
      toast.error(msg);
    }
  };

  // 고른 카드를 기한 열로 끌면 선택을 풀고 **그 열로 옮긴다**. toggleFocus·rescheduleTask를 겹쳐
  // 부르면 두 PATCH가 각자 background reload().then(clearPatch)를 돌려, 먼저 끝난 쪽의 clearPatch가
  // 상대의 낙관 상태를 지운다(카드가 한 번 스냅백하거나 오늘 3개 표시가 어긋난다). 그래서 낙관
  // 패치는 한 엔트리로 한 번만 쓰고, 두 PATCH를 순차로 보낸 뒤 reload·clearPatch는 마지막에 한 번만.
  const unfocusAndReschedule = async (item, bucketKey, dueAt) => {
    const clearPatch = () => setItemPatches((p) => {
      if (!(item.id in p)) return p;
      const next = { ...p };
      delete next[item.id];
      return next;
    });
    setItemPatches((p) => ({ ...p, [item.id]: { bucket: bucketKey, whenAt: dueAt || null, focusToday: false } }));
    const patchTask = async (body, failLabel) => {
      const res = await fetch('/api/hub/tasks', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: item.entityId, ...body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.status !== 'saved') throw new Error(data.error || `${failLabel} ${res.status}`);
    };
    let focusSaved = false;
    try {
      await patchTask({ focus: { on: false } }, '오늘 3개 저장 실패');
      focusSaved = true;
      await patchTask({ dueAt }, '기한 변경 실패');
      setNotice({ tone: 'ok', label: '기한 변경됨' });
      toast.success('기한 변경됨');
      reload().then((fresh) => { if (fresh) clearPatch(); }).catch(() => {}); // null = 실패/superseded → 패치 유지
    } catch (error) {
      if (focusSaved) {
        // 첫 PATCH는 이미 저장됐다. 두 번째만 실패했으므로 서버의 선택 해제를 그대로
        // 보여 주고 재조회가 성공할 때까지 그 사실을 낙관 패치로 유지한다.
        setItemPatches((p) => ({ ...p, [item.id]: { bucket: item.dueBucket || 'later', focusToday: false } }));
        reload().then((fresh) => { if (fresh) clearPatch(); }).catch(() => {});
      } else {
        clearPatch();
      }
      const detail = error instanceof Error ? error.message : String(error);
      const msg = focusSaved ? `오늘 3개에서는 빠졌지만 기한은 바꾸지 못했습니다 — ${detail}` : detail;
      setNotice({ tone: 'err', label: msg });
      toast.error(msg);
    }
  };

  const dropOnBucket = (bucketKey) => {
    const item = visible.find((i) => i.id === dragItemId);
    setDragItemId(null);
    if (!item || item.lane !== 'task' || bucketKey === 'overdue') return;
    // 오늘 3개 열로 끌어오면 기한이 아니라 선택을 바꾼다.
    if (bucketKey === 'focus') { toggleFocus(item, true); return; }
    const seoulDate = (offsetDays) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date(Date.now() + offsetDays * 86400000));
    const dueAt = bucketKey === 'today' ? seoulDate(0) : bucketKey === 'week' ? seoulDate(1) : null; // 'later' clears the date
    // 고른 카드를 기한 열로 끌면 선택을 풀고 그 열로 옮긴다 — 선택만 풀면 카드가 드롭한 열이
    // 아니라 자기 원래 기한 버킷(지남·나중)으로 튀어 드래그가 실패한 것처럼 보인다.
    if (item.focusToday) { unfocusAndReschedule(item, bucketKey, dueAt); return; }
    rescheduleTask(item, dueAt);
  };

  // 행 클릭 → 우측 상세 패널 토글 (모든 레인). 할 일 편집(EditDrawer)·Deals 이동·
  // 프로젝트 이동·Calendar 열기는 패널 안의 액션 버튼이 담당한다.
  const openItem = (item) => setDetailId((cur) => (cur === item.id ? null : item.id));

  // 숨기기/다시 표시 — 기록에 쓰지 않고 브라우저 보기 설정만 바꾼다. 완료·삭제와 달리
  // 지연 커밋 undo가 필요 없다(서버 호출이 없어 '되돌리기'가 즉시 원상복구다).
  const persistMuted = (next) => {
    setMuted(next);
    if (typeof window !== 'undefined') writeMuteStore(window.localStorage, next);
  };

  const unmuteItem = (item) => {
    const id = typeof item === 'string' ? item : item?.id;
    if (!id) return;
    persistMuted(clearMute(muted, id));
    setNotice({ tone: 'ok', label: '목록에 다시 표시됨' });
    toast.info('다시 표시합니다.');
  };

  const muteItem = (item, mode) => {
    persistMuted(applyMute(muted, item, mode, new Date()));
    if (detailId === item.id) setDetailId(null);
    const label = mode === 'forever' ? '목록에서 숨김' : '오늘 숨김 · 내일 다시 표시';
    const undo = () => unmuteItem(item.id);
    setNotice({ key: `mute-${item.id}`, tone: 'ok', label, action: { label: '되돌리기', onClick: undo } });
    toast.info(
      mode === 'forever' ? '내 작업 목록에서 숨겼습니다.' : '오늘은 이 항목을 숨깁니다.',
      { action: { label: '되돌리기', onClick: undo } },
    );
  };

  // Task edit drawer — 패널의 "상세 편집" 버튼에서 연다. Edits title/status/priority/due
  // through the extended PATCH /api/hub/tasks contract (update_task accepts a partial patch).
  const openTaskDraft = (item) => {
    // _sourceDescription: 저장 시 "바뀌었을 때만" description을 PATCH에 싣기 위한 원본 스냅샷.
    // 라이브 DB에 0021(task description) 마이그레이션이 아직 없으면 이 키가 포함된 PATCH가
    // 통째로 실패하므로, 건드리지 않은 저장까지 막지 않게 한다.
    setTaskDraft({ sourceRefs: item.sourceRefs || [], id: item.entityId, title: item.title, status: item.status, priority: item.priority || 'medium', dueAt: item.whenAt || '', description: item.description || '', nextAction: item.nextAction || '', projectId: item.projectId || '', updatedAt: item.updatedAt || '', _sourceDescription: item.description || '', _sourceNextAction: item.nextAction || '' });
  };

  const detailItem = React.useMemo(
    () => {
      if (!detailId) return null;
      const item = items.find((i) => i.id === detailId && !hiddenIds.has(i.id));
      return item ? { ...item, ...(itemPatches[item.id] || {}) } : null;
    },
    [detailId, items, hiddenIds, itemPatches],
  );

  const toggleChecklist = async (item, checklistId) => {
    if (checklistSavingRef.current) return;
    const command = buildMyWorkChecklistToggle(item, checklistId);
    if (!command) {
      setNotice({ tone: 'err', label: '체크리스트 버전이나 항목을 확인하지 못했어요. 다시 읽어 주세요.' });
      return;
    }
    checklistSavingRef.current = true;
    setChecklistSavingId(item.id);
    let outcome = null;
    try {
      const response = await fetch('/api/hub/tasks', {
        method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(command),
      });
      const data = await response.json().catch(() => null);
      outcome = { response, data };
    } catch {
      // The response can be lost after the server commits. Read back before declaring failure.
    }
    try {
      const receipt = outcome && readMyWorkChecklistReceipt(outcome.response, outcome.data, command);
      if (receipt) {
        setItemPatches((previous) => ({ ...previous, [item.id]: {
          ...(previous[item.id] || {}), checklist: receipt.checklist, updatedAt: receipt.updatedAt,
        } }));
        setNotice({ tone: 'ok', label: '체크리스트 저장됨' });
        reload().then((fresh) => {
          if (fresh) setItemPatches((previous) => {
            if (!(item.id in previous)) return previous;
            const next = { ...previous };
            delete next[item.id];
            return next;
          });
        }).catch(() => {});
        return;
      }
      const fresh = await reload();
      const current = fresh?.items?.find((candidate) => candidate.lane === 'task' && candidate.entityId === command.id);
      const target = command.checklist.find((step) => step.id === checklistId);
      const recovered = current?.updatedAt && current.updatedAt !== command.expectedUpdatedAt
        && current.checklist?.find((step) => step.id === checklistId)?.done === target?.done;
      if (outcome?.data?.status === 'conflict') {
        setNotice({ tone: 'err', label: '다른 변경이 먼저 저장됐어요. 최신 체크리스트를 확인해 주세요.' });
      } else if (recovered) {
        setNotice({ tone: 'ok', label: '최신 체크 상태가 선택한 값과 일치해요.' });
      } else if (outcome?.data?.status === 'preview') {
        setNotice({ tone: 'err', label: '저장소가 연결되지 않아 체크리스트를 저장하지 않았어요.' });
      } else {
        setNotice({ tone: 'err', label: '체크리스트 저장 결과를 확인하지 못했어요. 다시 읽어 주세요.' });
      }
    } finally {
      checklistSavingRef.current = false;
      setChecklistSavingId(null);
    }
  };
  const deferTarget = nextDeferTarget();
  const handleItemDefer = React.useCallback((it) => {
    rescheduleTask(it, deferTarget.dueAt, `${deferTarget.label}로 미룸`);
  }, [deferTarget, rescheduleTask]);

  // 방금 추가한 할 일 하이라이트를 2.6초 뒤 해제(ItemRow가 fade 처리). 스크롤은 여기서
  // 하지 않는다 — reload의 setData와 setJustAddedId가 서로 다른 렌더로 커밋돼서, 패시브
  // 이펙트/rAF 시점엔 행 레이아웃이 아직 안 끝나 scrollIntoView가 빗나갔다(2026-07-18 검증).
  // 스크롤은 createTask에서 짧은 지연 뒤 직접 호출한다(‘보기’ 버튼과 동일 경로).
  React.useEffect(() => {
    if (!justAddedId) return undefined;
    const timer = setTimeout(() => setJustAddedId(null), 2600);
    return () => clearTimeout(timer);
  }, [justAddedId]);

  // 방금 추가/‘보기’가 가리키는 행으로 스크롤 — 커밋·레이아웃이 끝난 뒤 실행되도록 짧게 미룬다.
  const scrollToRow = React.useCallback((attentionId) => {
    if (!attentionId) return;
    window.setTimeout(() => {
      document.getElementById(`mywork-row-${attentionId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 80);
  }, []);

  // Calendar task chips deep-link here with the durable task id. Resolve it to
  // the attention row, clear filters that could hide it, and open the existing
  // detail panel instead of creating a second task-detail implementation.
  React.useEffect(() => {
    const requestedTaskId = searchParams?.get('task');
    if (!requestedTaskId || taskDeepLinkRef.current === requestedTaskId) return;
    const item = items.find((candidate) => (
      candidate.lane === 'task'
      && (candidate.entityId === requestedTaskId || candidate.id === requestedTaskId || candidate.id === `task-${requestedTaskId}`)
    ));
    if (!item) return;

    taskDeepLinkRef.current = requestedTaskId;
    setLane('task');
    // Q120: 전체 기한은 무기한 항목을 숨긴다. 회의에서 만든 무기한 작업의
    // 딥링크는 나중 렌즈로 열어 실제 행과 체크리스트가 함께 보이게 한다.
    setBucketFilter(normalizeBucket(item) === 'later' ? 'later' : 'all');
    setSearch('');
    setDetailId(item.id);
    scrollToRow(item.id);

    const params = new URLSearchParams(searchParams.toString());
    params.delete('task');
    params.delete('lens');
    router.replace(`${pathname}${params.size ? `?${params}` : ''}`);
  }, [items, pathname, router, searchParams, scrollToRow]);

  const toggleProject = (projectId) => {
    setCollapsedProjects((prev) => {
      const next = new Set(prev);
      next.has(projectId) ? next.delete(projectId) : next.add(projectId);
      return next;
    });
  };

  const toggleEventBucket = (bucketKey) => {
    setExpandedEventBuckets((prev) => {
      const next = new Set(prev);
      next.has(bucketKey) ? next.delete(bucketKey) : next.add(bucketKey);
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
          ...(taskDraft.updatedAt ? { expectedUpdatedAt: taskDraft.updatedAt } : {}),
          title: taskDraft.title,
          status: taskDraft.status,
          priority: taskDraft.priority,
          dueAt: taskDraft.dueAt || null,
          projectId: taskDraft.projectId || null,
          ...((taskDraft.description ?? '') !== (taskDraft._sourceDescription ?? '')
            ? { description: taskDraft.description ?? '' }
            : {}),
          ...((taskDraft.nextAction ?? '') !== (taskDraft._sourceNextAction ?? '')
            ? { nextAction: taskDraft.nextAction ?? '' }
            : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.status !== 'saved') {
        setNotice({ tone: 'err', label: data.error || `저장 실패 (${data.status || res.status})` });
        return { ok: false, status: data.status || 'error', message: data.status === 'conflict' ? '다른 변경이 먼저 저장됐어요. 최신 작업을 확인한 뒤 다시 편집해 주세요.' : undefined };
      }
      if ((taskDraft.nextAction ?? '') !== (taskDraft._sourceNextAction ?? '')
        && (data.task?.next_action ?? '') !== (taskDraft.nextAction ?? '')) {
        setNotice({ tone: 'err', label: '다음 행동의 저장 결과를 확인하지 못했어요. 다시 읽어 주세요.' });
        return { ok: false, status: 'error' };
      }
      setNotice({ tone: 'ok', label: '할 일 업데이트됨' });
      // 저장 영수증이 전체 attention read(10콜+캘린더 체인)를 기다리지 않는다 —
      // 표시 필드를 낙관 병합하고 배경 재검증(4차 재감사 속도 M).
      const detailItemId = detailId;
      if (detailItemId) {
        setItemPatches((prev) => ({
          ...prev,
          [detailItemId]: {
            ...(prev[detailItemId] || {}),
            title: taskDraft.title,
            whenAt: taskDraft.dueAt || null,
            nextAction: taskDraft.nextAction || '',
            ...(data.task?.updated_at ? { updatedAt: data.task.updated_at } : {}),
          },
        }));
      }
      reload().then((fresh) => {
        if (fresh && detailItemId) {
          setItemPatches((prev) => {
            if (!(detailItemId in prev)) return prev;
            const next = { ...prev };
            delete next[detailItemId];
            return next;
          });
        }
      }).catch(() => {});
      return { ok: true, status: 'saved' };
    } catch (error) {
      setNotice({ tone: 'err', label: error instanceof Error ? error.message : String(error) });
      return { ok: false, status: 'error' };
    }
  };

  // 낙관 tombstone → 3.5초 되돌리기 창 → 창이 닫힌 뒤에만 실제 DELETE(7차 편의 —
  // hard delete의 안전장치가 confirm뿐이던 격차를 완료와 같은 지연-undo 계약으로).
  // 늦은 실패·preview는 행 복원 + 원인 명명(Phase 0 taxonomy).
  const deleteTaskDetail = async () => {
    if (!taskDraft?.id) return { ok: false, status: 'no-selection' };
    const taskId = taskDraft.id;
    const rowId = `task-${taskId}`;
    const key = `delete-${taskId}`;
    setHiddenIds((prev) => new Set(prev).add(rowId));
    setNotice({
      key,
      tone: 'ok',
      label: '할 일 삭제됨',
      action: {
        label: '되돌리기',
        onClick: () => {
          if (!cancelUndoable(key)) return; // 창이 닫혔으면 DELETE가 나갔다
          setHiddenIds((prev) => { const next = new Set(prev); next.delete(rowId); return next; });
          setNotice({ tone: 'ok', label: '삭제 취소됨' });
          toast.info('삭제를 취소했습니다.');
        },
      },
    });
    toast.info('할 일을 삭제했습니다.', {
      action: {
        label: '되돌리기',
        onClick: () => {
          if (!cancelUndoable(key)) return;
          setHiddenIds((prev) => { const next = new Set(prev); next.delete(rowId); return next; });
          setNotice({ tone: 'ok', label: '삭제 취소됨' });
          toast.info('삭제를 취소했습니다.');
        },
      },
    });
    scheduleUndoable(key, () => {
      setNotice((cur) => (cur?.key === key ? null : cur)); // 창 종료 시 전체 소거(7차 UIUX 통일)
      (async () => {
        try {
          const res = await fetch('/api/hub/tasks', {
            method: 'DELETE',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ id: taskId }),
          });
          const data = await res.json().catch(() => ({}));
          if (res.ok && data.status === 'saved') {
            reload(); // 배경 재검증 — 영수증을 붙잡지 않는다
            return;
          }
          setHiddenIds((prev) => { const next = new Set(prev); next.delete(rowId); return next; });
          setNotice({
            tone: 'err',
            label: data.status === 'preview'
              ? 'Supabase 미설정 — 삭제가 저장되지 않아 할 일을 되살렸습니다.'
              : data.error || `삭제 실패 ${res.status} — 할 일을 되살렸습니다.`,
          });
        } catch (error) {
          setHiddenIds((prev) => { const next = new Set(prev); next.delete(rowId); return next; });
          setNotice({ tone: 'err', label: error instanceof Error ? error.message : String(error) });
        }
      })();
    });
    return { ok: true, status: 'deferred' };
  };

  // Page-level N focuses quick-add (list surface create contract, §8.1); / focuses search
  // (Linear/Notion convention).
  React.useEffect(() => {
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      const tag = t && t.tagName ? t.tagName.toLowerCase() : '';
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || (t && t.isContentEditable)) return;
      if (document.querySelector('[data-drawer-open="true"], [role="dialog"], [data-shortcut-overlay="true"]')) return; // 다이얼로그 위 발화 금지(§8.1)
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
      // CRM 표면과 문법 통일 — j/k도 ↓/↑와 같은 행 이동(재감사: 분리 문법 M).
      const down = e.key === 'ArrowDown' || e.key === 'j';
      const up = e.key === 'ArrowUp' || e.key === 'k';
      if (!down && !up) return;
      const t = e.target;
      const tag = t && t.tagName ? t.tagName.toLowerCase() : '';
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || (t && t.isContentEditable)) return;
      if (document.querySelector('[data-drawer-open="true"], [role="dialog"], [data-shortcut-overlay="true"]')) return;
      const refs = rowRefs.current.filter(Boolean);
      if (!refs.length) return;
      e.preventDefault();
      const active = document.activeElement;
      const currentIdx = refs.indexOf(active);
      const nextIdx = currentIdx === -1
        ? 0
        : down
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
    const counts = { all: 0, task: 0, deal: 0, event: 0 };
    items.forEach((i) => {
      if (!showMuted && mutedIds.has(i.id)) return; // 숨긴 항목은 세그먼트 숫자에서도 빠진다
      counts.all += 1;
      if (counts[i.lane] != null) counts[i.lane] += 1;
    });
    return counts;
  }, [items, mutedIds, showMuted]);

  // 현재 기록에서 숨겨둔 항목 수 — 툴바 토글과 빈 상태 안내가 같은 숫자를 쓴다.
  const mutedCount = React.useMemo(
    () => items.filter((i) => mutedIds.has(i.id) && !hiddenIds.has(i.id)).length,
    [items, mutedIds, hiddenIds],
  );

  // 현재 레인 기준 기한 버킷 카운트 — 시그널 스트립과 기한 세그먼트가 같은 숫자를 쓴다
  // (타일 클릭 결과로 보이는 행 수와 일치해야 신뢰할 수 있는 계기가 된다).
  const bucketCounts = React.useMemo(() => {
    const counts = { focus: 0, overdue: 0, today: 0, week: 0, later: 0 };
    items.forEach((i) => {
      if (hiddenIds.has(i.id)) return;
      if (!showMuted && mutedIds.has(i.id)) return;
      if (lane !== 'all' && i.lane !== lane) return;
      counts[normalizeBucket(i)] += 1;
    });
    return counts;
  }, [items, hiddenIds, lane, mutedIds, showMuted]);

  // 리스트 렌즈 그룹 섹션 — 전체 기한 보기일 때만. rows는 프로젝트·일정 아코디언까지
  // 반영된 렌더 구조 (item 행 + project 그룹 행 + events 그룹 행).
  // 일정 묶기는 전체/할 일/딜 레인 + 비검색 상태에서만 — '일정' 레인이나 검색 결과에서는
  // 일정이 곧 찾는 대상이므로 평평하게 둔다.
  const groupEvents = lane !== 'event' && !search.trim();
  const listSections = React.useMemo(() => {
    if (bucketFilter !== 'all') return null;
    const sections = [];
    BUCKETS.forEach((b) => {
      const bucketItems = visible.filter((i) => normalizeBucket(i) === b.key);
      if (!bucketItems.length) return;
      sections.push({ key: b.key, count: bucketItems.length, rows: buildSectionRows(bucketItems, groupEvents) });
    });
    return sections;
  }, [bucketFilter, visible, groupEvents]);

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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 'var(--gap)' }}>
        {SIGNAL_TILES.map((t) => {
          const count = bucketCounts[t.key] || 0;
          // 오늘 3개 타일만 표시 숫자가 서버 요약(완료한 선택 포함)이고 버킷 카운트는 미완료만
          // 센다 — 고른 3개를 다 끝내면 3/3인데 count는 0이다. 강조는 화면에 적힌 숫자를 따른다.
          const emphasis = t.key === 'focus' ? focusPickedCount : count;
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
                textAlign: 'left', padding: 'var(--pad-y) var(--pad-x)', cursor: 'pointer',
                background: active ? 'var(--surface-2)' : 'var(--surface)',
                border: `1px solid ${active ? 'var(--line-strong)' : 'var(--line-soft)'}`,
                borderRadius: 'var(--r-lg)',
                boxShadow: emphasis > 0 && t.stripe ? `inset 1px 0 0 ${t.stripe}` : undefined,
                transition: 'background var(--dur-hover) ease, border-color var(--dur-hover) ease',
              }}
            >
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--fg-dim)' }}>{t.label}</div>
              {/* 시그널 스트립은 이 페이지의 hero 지표 — Rhythm 카드(30px)와 같은 급의
                  .stat 크기로 "signal first"를 시각적으로도 주장한다. */}
              <div className="stat" style={{ fontSize: 26, fontWeight: 500, marginTop: 4, color: emphasis > 0 ? t.color : 'var(--fg-faint)' }}>{t.key === 'focus' ? `${focusPickedCount}/${MAX_FOCUS_PER_DAY}` : count}</div>
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
            onKeyDown={(e) => { if (shouldSubmitQuickTask(e, quickSavingRef.current)) { e.preventDefault(); createTask(); } }}
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
            {/* 기한은 date picker 수동 조작만 가능했다 — followups·고객 컨택 시트가 쓰는
                DateQuickPresets를 같이 건다(§8.1 primitives-first). 클릭 한 번으로 채운다. */}
            <DateQuickPresets disabled={saving} onPick={setQuickDue} />
            <span style={{ fontSize: 11, color: 'var(--fg-faint)' }}>비워두면 기한 없음·보통 우선순위로 저장</span>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <Input ref={searchRef} icon="search" placeholder="제목 검색" kbd="/" clearable value={search} onChange={setSearch} style={{ width: 190 }} />
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
        {/* 숨긴 항목은 사라진 게 아니라 접힌 것 — 개수를 항상 보여주고 한 번에 되돌릴 수
            있게 한다(§5.3: 필터가 '비어 있음'으로 위장하지 않는다). */}
        {(mutedCount > 0 || showMuted) && (
          <Button
            variant={showMuted ? 'secondary' : 'ghost'}
            size="sm"
            icon={showMuted ? 'eye' : 'eyeOff'}
            active={showMuted}
            aria-pressed={showMuted}
            onClick={() => setShowMuted((v) => !v)}
          >
            숨김 <span className="num">{mutedCount}</span>
          </Button>
        )}
        {notice && (
          // live region 필수(§11): 되돌리기 창이 열렸다는 사실을 스크린리더도 알아야 한다.
          // 완료는 중립(§5.3 done ≠ green) — 에러만 danger.
          <span
            role={notice.tone === 'err' ? 'alert' : 'status'}
            aria-live="polite"
            style={{ fontSize: 11.5, color: notice.tone === 'err' ? 'var(--danger)' : 'var(--fg-muted)', display: 'inline-flex', alignItems: 'center', gap: 8 }}
          >
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
      {state === 'stale' && (
        <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', border: '1px solid var(--line-soft)', borderRadius: 'var(--r-sm)', background: 'var(--surface)', fontSize: 12, color: 'var(--fg-muted)' }}>
          <span style={{ flex: 1 }}>재검증에 실패해 마지막으로 읽은 데이터를 표시 중입니다.</span>
          <Button variant="secondary" size="sm" onClick={reload}>다시 읽기</Button>
        </div>
      )}

      {['ready', 'stale'].includes(state) && lens === 'list' && (
        <Card pad={false} style={{ overflow: 'hidden' }}>
          {visible.length === 0 ? (
            !search.trim() && (lane === 'all' || lane === 'task') && bucketCounts.today === 0 && bucketCounts.overdue === 0 && mutedCount === 0 ? (
              <div
                className="hub-celebration-card"
                style={{
                  padding: '36px 20px', textAlign: 'center',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
                  background: 'var(--surface)',
                }}
              >
                <div style={{
                  width: 44, height: 44, borderRadius: 999,
                  background: 'var(--surface-2)', border: '1px solid var(--accent-line)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 0 14px -2px rgba(82, 116, 168, 0.4)',
                  fontSize: 20, color: 'var(--moon-100)',
                }}>
                  ✦
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--moon-100)' }}>
                    오늘의 모든 할 일 완료!
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--fg-muted)', maxWidth: 360, lineHeight: 1.5 }}>
                    계획된 모든 작업을 완수했습니다. 남은 시간을 여유롭게 보내거나 새로운 할 일을 계획해 보세요.
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => triggerCelebration({ mode: 'fireworks' })}
                  >
                    폭죽 다시 터뜨리기 ✦
                  </Button>
                  {(lane !== 'all' || bucketFilter !== 'all') && (
                    <Button variant="ghost" size="sm" onClick={() => { setLane('all'); setBucketFilter('all'); }}>
                      필터 초기화
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <EmptyState
                icon="check"
                title={search.trim() ? `"${search.trim()}" 검색 결과가 없습니다` : '표시할 항목이 없습니다'}
                description={
                  search.trim()
                    ? '다른 검색어를 시도하거나 검색을 지워보세요.'
                    : (lane !== 'all' || bucketFilter !== 'all')
                      ? `${lane !== 'all' ? LANE_LABEL[lane] : ''}${lane !== 'all' && bucketFilter !== 'all' ? ' · ' : ''}${bucketFilter !== 'all' ? BUCKETS.find((b) => b.key === bucketFilter)?.label : ''} 조건에 항목이 없습니다.`
                      : mutedCount > 0 && !showMuted
                        ? `숨긴 항목 ${mutedCount}건이 있습니다 — 언제든 다시 표시할 수 있습니다.`
                        : '할 일을 추가하거나 딜·일정이 생기면 여기에 모입니다.'
                }
                action={
                  search.trim()
                    ? <Button variant="outline" size="sm" onClick={() => setSearch('')}>검색 지우기</Button>
                    : (lane !== 'all' || bucketFilter !== 'all')
                      ? <Button variant="outline" size="sm" onClick={() => { setLane('all'); setBucketFilter('all'); }}>필터 초기화</Button>
                      : mutedCount > 0 && !showMuted
                        ? <Button variant="outline" size="sm" icon="eye" onClick={() => setShowMuted(true)}>숨김 {mutedCount}건 보기</Button>
                        : undefined
                }
                style={{ minHeight: 180, padding: '28px 12px' }}
              />
            )
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
                        onDefer={handleItemDefer}
                        onOpen={openItem}
                        completing={completingIds.has(row.item.id)}
                        selected={detailId === row.item.id}
                        justAdded={justAddedId === row.item.id}
                        showReason={sort === 'priority'}
                        mutedEntry={mutedIds.has(row.item.id) ? muted[row.item.id] : null}
                        onMute={muteItem}
                        onUnmute={unmuteItem}
                        onToggleFocus={toggleFocus}
                        focusFull={focusFull}
                        rowRef={nextRowRef()}
                      />
                    );
                  }
                  if (row.type === 'events') {
                    // 일정 아코디언 — 읽기 전용 컨텍스트를 실행 항목 뒤로 분리 (오늘만 기본
                    // 펼침). 접힌 상태에서는 첫 일정 시간을 미리보기로 남긴다.
                    const eventsOpen = expandedEventBuckets.has(section.key);
                    return (
                      <React.Fragment key={`events-${section.key}`}>
                        <div
                          ref={nextRowRef()}
                          className="hub-row"
                          role="button"
                          tabIndex={0}
                          aria-expanded={eventsOpen}
                          onClick={() => toggleEventBucket(section.key)}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleEventBucket(section.key); } }}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            padding: 'var(--pad-y) var(--pad-x)', minHeight: 'var(--row-h)',
                            borderBottom: '1px solid var(--line-soft)', cursor: 'pointer',
                          }}
                        >
                          <Iconed name="chevronD" size={12} style={{ transform: eventsOpen ? 'none' : 'rotate(-90deg)', transition: 'transform var(--dur-hover) ease', color: 'var(--fg-faint)' }} />
                          <Iconed name="calendar" size={13} style={{ color: 'var(--fg-dim)' }} />
                          <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--fg-muted)' }}>일정</span>
                          <span className="mono" style={{ fontSize: 10.5, color: 'var(--fg-faint)', background: 'var(--surface-2)', padding: '1px 6px', borderRadius: 4 }}>{row.items.length}</span>
                          <div style={{ flex: 1 }} />
                          {!eventsOpen && (
                            <span className="mono hub-mywork-meta" style={{ fontSize: 10.5, color: 'var(--fg-faint)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              첫 일정 {row.items[0]?.whenLabel}
                            </span>
                          )}
                        </div>
                        {eventsOpen && (
                          <div style={{ marginLeft: 10, borderLeft: '1px solid var(--line-soft)' }}>
                            {row.items.map((item) => (
                              <ItemRow
                                key={item.id}
                                item={item}
                                onComplete={scheduleComplete}
                                onDefer={handleItemDefer}
                                onOpen={openItem}
                                completing={completingIds.has(item.id)}
                                selected={detailId === item.id}
                                showReason={sort === 'priority'}
                                mutedEntry={mutedIds.has(item.id) ? muted[item.id] : null}
                                onMute={muteItem}
                                onUnmute={unmuteItem}
                                onToggleFocus={toggleFocus}
                                focusFull={focusFull}
                                rowRef={nextRowRef()}
                              />
                            ))}
                          </div>
                        )}
                      </React.Fragment>
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
                        <Iconed name="chevronD" size={12} style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'none', transition: 'transform var(--dur-hover) ease', color: 'var(--fg-faint)' }} />
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
                              onDefer={handleItemDefer}
                              onOpen={openItem}
                              completing={completingIds.has(item.id)}
                              selected={detailId === item.id}
                              justAdded={justAddedId === item.id}
                              showReason={sort === 'priority'}
                              mutedEntry={mutedIds.has(item.id) ? muted[item.id] : null}
                              onMute={muteItem}
                              onUnmute={unmuteItem}
                              onToggleFocus={toggleFocus}
                              focusFull={focusFull}
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
                onDefer={handleItemDefer}
                onOpen={openItem}
                completing={completingIds.has(item.id)}
                selected={detailId === item.id}
                justAdded={justAddedId === item.id}
                showReason={sort === 'priority'}
                mutedEntry={mutedIds.has(item.id) ? muted[item.id] : null}
                onMute={muteItem}
                onUnmute={unmuteItem}
                onToggleFocus={toggleFocus}
                focusFull={focusFull}
                rowRef={nextRowRef()}
              />
            ))
          )}
        </Card>
      )}

      {['ready', 'stale'].includes(state) && lens === 'board' && (
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
                transition: 'border-color var(--dur-hover) ease',
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
                          boxShadow: item.stalled ? 'inset 1px 0 0 var(--line-strong)' : undefined,
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

      {['ready', 'stale'].includes(state) && lens === 'week' && (
        sources.calendar !== 'live' && lane === 'event' ? (
          <Card>
            <EmptyState
              icon="calendar"
              title={sources.calendar === 'error' ? '캘린더를 읽지 못했습니다' : 'Google Calendar가 연결되지 않았습니다'}
              description={sources.calendar === 'error'
                ? '일정이 있어도 표시되지 않습니다 — 새로고침으로 재시도하세요.'
                : '연결하면 이번 주 일정이 할 일·딜과 함께 표시됩니다.'}
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
            onToggleFocus={toggleFocus}
            focusFull={focusFull}
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
          mutedEntry={mutedIds.has(detailItem.id) ? muted[detailItem.id] : null}
          onMute={(mode) => muteItem(detailItem, mode)}
          onUnmute={() => unmuteItem(detailItem)}
          onTaskCreated={reload}
          onToggleFocus={() => toggleFocus(detailItem)}
          onToggleChecklist={toggleChecklist}
          checklistSaving={checklistSavingId === detailItem.id}
          focusFull={focusFull}
        />
      )}
      </div>

      <EditDrawer
        title={taskDraft ? (taskDraft.title || '할 일 편집') : ''}
        subtitle={taskDraft ? `${taskDraft.id} · 할 일 편집` : ''}
        record={taskDraft}
        fields={[
          { key: 'title', label: '제목' },
          { key: 'status', row: 'task-state', label: '상태', type: 'select', options: TASK_STATUS_OPTIONS },
          { key: 'priority', row: 'task-state', label: '우선순위', type: 'select', options: TASK_PRIORITY_OPTIONS },
          { key: 'dueAt', label: '기한', inputType: 'date' },
          { key: 'nextAction', optional: true, label: '다음 행동', placeholder: '다음으로 실행할 구체적인 행동' },
          {
            key: 'projectId',
            label: '프로젝트',
            type: 'select',
            options: [
              { value: '', label: '미지정' },
              ...projects.map((p) => ({ value: p.id, label: p.name })),
            ],
          },
          { key: 'description', label: '설명 · 참고 자료', type: 'textarea', placeholder: '상세 내용, 참고 링크, 메모를 적어두세요.' },
        ]}
        onChange={(key, val) => setTaskDraft((d) => (d ? { ...d, [key]: val } : d))}
        onSave={persistTaskDetail}
        onDelete={deleteTaskDetail}
        onClose={() => setTaskDraft(null)}
      ><JournalSources refs={taskDraft?.sourceRefs} /></EditDrawer>
    </div>
  );
}

// 주간 렌즈 — 7-day agenda (grid가 아니라 목록: 모바일 우선, 미니멀). Each day lists its
// items; undated items stay out (they live in 리스트/보드 '나중').
function WeekAgenda({ items, sourcesCalendar, onComplete, onOpen, onNavigate, completingIds, selectedId, onToggleFocus, focusFull }) {
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

  // 기한 버킷은 dueBucket이 정본 — '오늘 3개'로 고른 할 일은 bucket이 'focus'로 올라가므로
  // i.bucket만 보면 지난 기한 항목이 주간 렌즈에서 통째로 사라진다(일자별 목록은 앞으로 7일만
  // 담는다). deal/event 레인엔 dueBucket이 없어 폴백이 필요하다.
  const overdue = items.filter((i) => visibleDueBucket(i) === 'overdue');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap)' }}>
      {sourcesCalendar !== 'live' && (
        <div role={sourcesCalendar === 'error' ? 'alert' : undefined} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: sourcesCalendar === 'error' ? 'var(--danger)' : 'var(--fg-muted)' }}>
          <SyncBadge state={sourcesCalendar === 'error' ? 'error' : 'preview'} />
          {sourcesCalendar === 'error'
            ? '캘린더를 읽지 못했습니다 — 일정이 있어도 표시되지 않습니다.'
            : '일정 레인 미연결 — 할 일·딜 기한만 표시 중입니다.'}
          <Button variant="ghost" size="xs" onClick={() => onNavigate?.('dashboard/work/calendar')}>{sourcesCalendar === 'error' ? '캘린더 열기' : '연결'}</Button>
        </div>
      )}
      {overdue.length > 0 && (
        <Card pad={false} style={{ overflow: 'hidden', boxShadow: 'inset 1px 0 0 var(--danger)' }}>
          <div style={{ padding: '8px 14px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--danger)', borderBottom: '1px solid var(--line-soft)' }}>
            기한 지남 {overdue.length}
          </div>
          {overdue.map((item) => (
            <ItemRow key={item.id} item={item} onComplete={onComplete} onOpen={onOpen} completing={completingIds.has(item.id)} selected={selectedId === item.id} onToggleFocus={onToggleFocus} focusFull={focusFull} />
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
              <ItemRow key={item.id} item={item} onComplete={onComplete} onOpen={onOpen} completing={completingIds.has(item.id)} selected={selectedId === item.id} onToggleFocus={onToggleFocus} focusFull={focusFull} />
            ))}
          </Card>
        );
      })}
    </div>
  );
}
