// 결정 데스크 — 정할 것 큐와 정하기 패널의 순수 규칙(docs/superpowers/specs/2026-10-15-decision-desk-design.md).
// React 없음. 화면(pages/decision-desk.jsx)과 테스트가 같은 표를 쓴다.
//
// 정할 것은 두 갈래다.
//   막힘 — 막힌 프로젝트 중 병목이 의사결정이거나 분류하지 않은 것. 그 프로젝트에 걸린 미정 초안이 있으면 합친다.
//   미정 — 결정일 없이 남은 결정(초안). 미뤄 둔 날(meta.deferUntil)이 아직 오지 않았으면 큐에서 뺀다.
// 회의 결정 제안은 이번 판에 넣지 않는다(스펙 §7).

import { BLOCKER_KIND_LABELS } from '../../../packages/project-delivery/index.ts';
import { diffKstDays, kstDayKey, kstDayKeyAfter } from './kst-day.js';

export const DEFER_DAYS = 7;
export const OPTION_LIMIT = 5;
const OPTION_IDS = ['a', 'b', 'c', 'd', 'e'];
const OPEN_TASK = (task) => task && !['done', 'cancelled', 'archived'].includes(String(task.status || '').toLowerCase());

function deferred(decision, today) {
  return Boolean(decision?.deferUntil) && decision.deferUntil > today;
}

function ageFrom(value, today) {
  const key = kstDayKey(value || '');
  return key ? Math.max(0, diffKstDays(key, today)) : null;
}

function draftProjectId(decision) {
  return decision?.sourceRef?.type === 'project' ? decision.sourceRef.id : null;
}

/**
 * @returns 정할 것 목록 — 막힘 먼저, 같은 갈래 안에서는 오래된 순서.
 *   { key, kind: 'blocked'|'draft', title, question, project, draft, ageDays, meta, options, chosenOptionId }
 */
export function buildDecisionQueue({ decisions = [], blockedProjects = [], now = Date.now() } = {}) {
  const today = kstDayKey(new Date(now));
  const drafts = (Array.isArray(decisions) ? decisions : []).filter((decision) => decision && !decision.isNew && !decision.decidedAt);
  const draftByProject = new Map();
  for (const draft of drafts) {
    const projectId = draftProjectId(draft);
    if (projectId && !draftByProject.has(projectId)) draftByProject.set(projectId, draft);
  }

  const merged = new Set();
  const items = [];
  for (const project of Array.isArray(blockedProjects) ? blockedProjects : []) {
    const kind = project?.delivery?.blockerKind || '';
    if (!project?.id || (kind && kind !== 'decision')) continue;
    const draft = draftByProject.get(project.id) || null;
    if (draft) merged.add(draft.id);
    if (deferred(draft, today)) continue;
    const ageDays = ageFrom(project.delivery?.pausedAt, today);
    const question = draft?.question || project.delivery?.blocker || '무엇을 정해야 다시 진행되나';
    items.push({
      key: `project:${project.id}`,
      kind: 'blocked',
      title: `${project.name} — ${question}`,
      question,
      project,
      draft,
      ageDays,
      meta: ['막힘', BLOCKER_KIND_LABELS[kind] || '', ageDays !== null ? `${ageDays}일` : ''].filter(Boolean).join(' · '),
      options: draft?.options || [],
      chosenOptionId: draft?.chosenOptionId || null,
    });
  }

  for (const draft of drafts) {
    if (merged.has(draft.id) || deferred(draft, today)) continue;
    const ageDays = ageFrom(draft.createdAt, today);
    const question = draft.question || draft.title;
    items.push({
      key: `decision:${draft.id}`,
      kind: 'draft',
      title: draft.projectName ? `${draft.projectName} — ${question}` : question,
      question,
      project: null,
      draft,
      ageDays,
      meta: ['미정', ageDays !== null ? `${ageDays}일째` : ''].filter(Boolean).join(' · '),
      options: draft.options || [],
      chosenOptionId: draft.chosenOptionId || null,
    });
  }

  const rank = { blocked: 0, draft: 1 };
  return items.sort((left, right) => rank[left.kind] - rank[right.kind] || (right.ageDays ?? -1) - (left.ageDays ?? -1));
}

export function deskFilterOptions(queue) {
  const count = (kind) => queue.filter((item) => item.kind === kind).length;
  return [
    { key: 'all', label: '전체', count: queue.length },
    { key: 'blocked', label: '막힘', count: count('blocked') },
    { key: 'draft', label: '미정', count: count('draft') },
  ];
}

export function filterQueue(queue, filter) {
  return filter === 'blocked' || filter === 'draft' ? queue.filter((item) => item.kind === filter) : queue;
}

function mondayKey(today) {
  const date = new Date(`${today}T00:00:00Z`);
  const offset = (date.getUTCDay() + 6) % 7;
  return new Date(date.getTime() - offset * 86400000).toISOString().slice(0, 10);
}

/**
 * 머리 줄 — 이번 주 정한 것 · 그래서 할 일 남음 · 가장 오래 미정.
 * 할 일을 읽지 못한 결정(followups null)이 있으면 남은 할 일은 null(모름)이다 — 0으로 단언하지 않는다.
 */
export function deskStats({ decisions = [], queue = [], now = Date.now() } = {}) {
  const today = kstDayKey(new Date(now));
  const monday = mondayKey(today);
  const decided = (Array.isArray(decisions) ? decisions : []).filter((decision) => decision && !decision.isNew && decision.decidedAt);
  const thisWeek = decided.filter((decision) => {
    const key = kstDayKey(decision.decidedAt);
    return key >= monday && key <= today;
  });
  const unknown = decided.some((decision) => !Array.isArray(decision.followups));
  const openFollowups = unknown ? null : decided.reduce((sum, decision) => sum + decision.followups.filter(OPEN_TASK).length, 0);
  const ages = queue.map((item) => item.ageDays).filter((age) => Number.isFinite(age));
  return { decidedThisWeek: thisWeek.length, openFollowups, oldestDays: ages.length ? Math.max(...ages) : null };
}

export function recentDecisions(decisions, limit = 3) {
  return (Array.isArray(decisions) ? decisions : [])
    .filter((decision) => decision && !decision.isNew && decision.decidedAt)
    .sort((left, right) => String(right.decidedAt).localeCompare(String(left.decidedAt)))
    .slice(0, limit);
}

export function optionLabel(index) {
  return `${String.fromCharCode(65 + index)}안`;
}

export function nextOptionId(options) {
  const used = new Set((options || []).map((option) => option.id));
  return OPTION_IDS.find((id) => !used.has(id)) || null;
}

const blankOption = (id) => ({ id, title: '', gain: '', loss: '' });

/** 정하기 패널의 시작값 — 초안의 질문·선택지·근거를 이어 받고, 선택지가 없으면 빈 칸 두 개. */
export function deskFormFor(item) {
  const options = item?.options?.length ? item.options.map((option) => ({ ...option })) : [blankOption('a'), blankOption('b')];
  return {
    question: item?.question || '',
    options,
    chosenOptionId: item?.chosenOptionId && options.some((option) => option.id === item.chosenOptionId) ? item.chosenOptionId : null,
    rationale: item?.draft?.rationale || '',
    taskTitle: '',
    taskDueAt: '',
    clearBlocker: true,
  };
}

export function addOption(form) {
  const id = nextOptionId(form.options);
  return id && form.options.length < OPTION_LIMIT ? { ...form, options: [...form.options, blankOption(id)] } : form;
}

export function removeOption(form, id) {
  const options = form.options.filter((option) => option.id !== id);
  return { ...form, options, chosenOptionId: form.chosenOptionId === id ? null : form.chosenOptionId };
}

export function chosenOption(form) {
  const option = form?.options?.find((entry) => entry.id === form.chosenOptionId);
  return option && option.title.trim() ? option : null;
}

/** `남기면` 줄 — 정하기를 누르면 무엇이 생기는지 미리 말한다. */
export function outcomePreview(item, form) {
  const chosen = chosenOption(form);
  if (!chosen) return [];
  const index = form.options.findIndex((option) => option.id === chosen.id);
  const unchosen = form.options.filter((option) => option.id !== chosen.id && option.title.trim()).length;
  return [
    `결정 1건 (확정 · 오늘) — ${optionLabel(index)}`,
    form.taskTitle.trim() ? `할 일 1건${form.taskDueAt ? ` · ${form.taskDueAt.slice(5)}까지` : ''}` : '',
    item?.project && form.clearBlocker ? `${item.project.name} 다시 진행 · 막힘 이력 1줄` : '',
    unchosen ? `고르지 않은 선택지 ${unchosen}개는 결정 옆에 남음` : '',
  ].filter(Boolean);
}

export function deferUntilKey(now = Date.now()) {
  return kstDayKeyAfter(DEFER_DAYS, now);
}
