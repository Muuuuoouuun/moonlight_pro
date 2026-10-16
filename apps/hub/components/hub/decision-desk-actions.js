// 결정 데스크의 저장 순서(docs/superpowers/specs/2026-10-15-decision-desk-design.md §5). React 없음.
// 정하기 = 결정(초안이면 그 초안을 확정) → 그래서 할 일 → 막힌 점 비우고 진행으로 → 결정에 표시용 링크.
// 결정·할 일·프로젝트는 서로 다른 테이블이라 한 트랜잭션이 아니다 — 확인할 것·막힘 풀기와 같은 길(decision-actions,
// unblock-actions)을 그대로 쓰고, 중간에 멈추면 무엇이 남았는지 말한다. `progress`를 넘기면 끝난 단계는 건너뛴다.

import { chosenOption } from '@/lib/decision-desk';
import { failureReason, linkDecision, newDecisionIds, patchDecision, saveDecisionWithFollowup } from './decision-actions';
import { patchProject } from './unblock-actions';

function target(item) {
  const project = item?.kind === 'blocked' ? item.project : null;
  return {
    project,
    existing: Boolean(item?.draft),
    projectId: project?.id || item?.draft?.projectId || null,
    source: project ? 'project-unblock' : 'hub-work',
    sourceRef: project ? { type: 'project', id: project.id } : null,
  };
}

/**
 * @param item  buildDecisionQueue의 한 줄, 또는 `+ 정할 것 추가`로 만든 { kind: 'new' }
 * @param form  deskFormFor의 모양 — { question, options, chosenOptionId, rationale, taskTitle, taskDueAt, clearBlocker }
 * @returns {{ ok, stage, message, progress, decisionId?, taskId?, unblocked }}
 */
export async function decideDeskItem(fetchImpl, item, form, { ids = newDecisionIds(), progress = {}, context = null } = {}) {
  const done = { decision: false, task: false, project: false, ...progress };
  const question = String(form?.question || '').trim();
  const chosen = chosenOption(form);
  if (!question) return { ok: false, stage: 'input', message: '무엇을 정하는지 적어 주세요.', progress: done, unblocked: false };
  if (!chosen) return { ok: false, stage: 'input', message: '선택지 하나를 골라 주세요.', progress: done, unblocked: false };

  const { project, existing, projectId, source, sourceRef } = target(item);
  const decisionId = item?.draft?.id || ids.decisionId;
  const saved = await saveDecisionWithFollowup(fetchImpl, {
    existing,
    title: chosen.title,
    rationale: form.rationale,
    projectId,
    source,
    sourceRef,
    question,
    options: form.options,
    chosenOptionId: chosen.id,
    ...(item?.draft?.deferUntil ? { deferUntil: null } : {}),
    taskTitle: form.taskTitle,
    taskDueAt: form.taskDueAt || undefined,
    ...(project ? { signalKey: `work-blocked:${project.id}` } : {}),
  }, { ids: { ...ids, decisionId }, progress: { decision: done.decision, task: done.task }, context });
  Object.assign(done, saved.progress);
  if (!saved.ok) return { ...saved, progress: done, unblocked: false };

  if (project && form.clearBlocker && !done.project) {
    const result = await patchProject(fetchImpl, project, { branch: 'decision', decisionId, context });
    if (!result.ok) {
      const conflict = result.status === 'conflict';
      return {
        ok: false, stage: 'project', conflict, progress: done, decisionId, taskId: done.task ? ids.taskId : null, unblocked: false,
        message: conflict
          ? '결정은 남았습니다 · 막힘은 아직 풀리지 않았습니다 — 프로젝트가 다른 곳에서 먼저 바뀌었습니다.'
          : `결정은 남았습니다 · ${result.status === 'unknown' ? '막힘 변경 응답을 확인하지 못했습니다' : '막힘은 아직 풀리지 않았습니다'}${failureReason(result) ? ` — ${failureReason(result)}` : ''}.`,
      };
    }
    done.project = true;
  }

  if (done.task || done.project) {
    const linked = await linkDecision(fetchImpl, decisionId, { nextTaskId: done.task ? ids.taskId : null, unblockedProjectId: done.project ? project.id : null, context });
    if (!linked.ok) return { ok: true, stage: 'done', progress: done, decisionId, taskId: done.task ? ids.taskId : null, unblocked: done.project, message: '기록은 남았지만 결정의 표시용 연결은 확인하지 못했습니다.' };
  }
  return { ok: true, stage: 'done', progress: done, decisionId, taskId: done.task ? ids.taskId : null, unblocked: done.project, message: '' };
}

/** 아직 미정으로 저장 — 질문·선택지·근거만 남긴다. 결정일은 비우고, 기울어진 선택지가 있으면 그것도 남긴다. */
export async function saveDeskDraft(fetchImpl, item, form, { ids = newDecisionIds(), context = null } = {}) {
  const question = String(form?.question || '').trim();
  if (!question) return { ok: false, stage: 'input', message: '무엇을 정하는지 적어 주세요.' };
  const { existing, projectId, source, sourceRef } = target(item);
  const decisionId = item?.draft?.id || ids.decisionId;
  const saved = await saveDecisionWithFollowup(fetchImpl, {
    existing,
    title: question,
    rationale: form.rationale,
    decidedAt: '',
    projectId,
    source,
    sourceRef,
    question,
    options: form.options,
    chosenOptionId: chosenOption(form)?.id || null,
  }, { ids: { ...ids, decisionId }, context });
  return { ...saved, decisionId };
}

/**
 * 고른 정할 것을 한 번에 미룬다(`X`로 고르고 `미루기`). 초안은 미룰 날만 고치고, 초안 없는 막힌 프로젝트는
 * 미룰 날을 단 초안을 새로 만든다 — 프로젝트의 막힘은 그대로다. idsFor(item)는 재시도에도 같은 id를 준다.
 * @returns {{ deferred: string[], failed: { key, message }[] }}
 */
export async function deferDeskItems(fetchImpl, items, untilKey, { idsFor = () => newDecisionIds(), context = null } = {}) {
  const deferred = [];
  const failed = [];
  for (const item of items) {
    let result;
    if (item.draft) {
      result = await patchDecision(fetchImpl, item.draft.id, { deferUntil: untilKey }, { context });
    } else {
      const { projectId, source, sourceRef } = target(item);
      result = await saveDecisionWithFollowup(fetchImpl, {
        title: item.question, question: item.question, decidedAt: '', projectId, source, sourceRef, deferUntil: untilKey,
      }, { ids: idsFor(item), context });
    }
    if (result.ok) deferred.push(item.key);
    else failed.push({ key: item.key, message: result.message || failureReason(result) || '미루지 못했습니다.' });
  }
  return { deferred, failed };
}
