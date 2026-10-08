// 막힘 풀기 — 세 갈래의 저장 순서(docs/superpowers/specs/2026-09-30-check-items-finish-and-unblock-design.md §5.2·§5.3).
// React 없음 — fetch를 주입받아 테스트한다. 확인할 것 카드와 프로젝트 상세가 같이 쓴다.
//
// 결정·할 일·프로젝트는 서로 다른 테이블이라 한 트랜잭션이 아니다. id를 미리 만들어(재시도 멱등) 순서대로
// 쓰고, 중간에 멈추면 무엇이 남았는지 그대로 말한다. `progress`를 넘기면 이미 끝난 단계는 건너뛴다.

import { deliveryDraft } from '../../../../packages/project-delivery/index.ts';
import { failureReason as why, linkDecision, newDecisionIds, saveDecisionWithFollowup, sendJson as send } from './decision-actions';

export const UNBLOCK_BRANCHES = Object.freeze(['resolved', 'decision', 'next-version']);

/** 재시도해도 같은 결정·할 일이 되도록 한 번 만들어 두는 id 묶음. */
export const newUnblockIds = newDecisionIds;
/** 다음 버전으로 넘길 범위 — 기존 글 뒤에 한 줄로 덧붙인다. */
export function appendNextVersion(current, addition) {
  const before = String(current || '').trim();
  const add = String(addition || '').trim();
  if (!add) return before;
  return (before ? `${before}\n${add}` : add).slice(0, 4000);
}

async function patchProject(fetchImpl, project, { branch, note = '', nextVersionText = '', decisionId = null }) {
  const plan = deliveryDraft(project.delivery || {});
  const delivery = {
    ...plan,
    blocker: '',
    ...(branch === 'next-version' ? { nextVersion: appendNextVersion(plan.nextVersion, nextVersionText) } : {}),
  };
  return send(fetchImpl, '/api/hub/projects', 'PATCH', {
    id: project.id,
    expectedUpdatedAt: project.updatedAt,
    delivery,
    deliveryEvent: 'resume',
    unblockResolution: branch,
    ...(decisionId ? { decisionId } : {}),
    ...(note.trim() ? { unblockNote: note.trim().slice(0, 300) } : {}),
  });
}

/** 다른 곳에서 먼저 바뀐 프로젝트를 다시 읽는다(`막힘만 다시 풀기`). */
export async function readProjectForUnblock(fetchImpl, projectId) {
  try {
    const response = await fetchImpl(`/api/hub/projects?project=${encodeURIComponent(projectId)}`, { cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data?.status === 'error' || data?.source === 'error') return null;
    const row = (Array.isArray(data?.projects) ? data.projects : []).find((project) => project.id === projectId);
    return row ? { id: row.id, name: row.name, delivery: row.delivery, updatedAt: row.updatedAt } : null;
  } catch {
    return null;
  }
}

/**
 * @param project  { id, name, delivery, updatedAt }
 * @param input    { branch, note?, nextVersionText?, decision?: { title, rationale, taskTitle, taskDueAt, clearBlocker } }
 * @param options  { ids, progress, signalKey }
 * @returns {{ ok, stage, message, progress, decisionId?, taskId?, unblocked, conflict? }}
 *   progress — { decision, task, project } 끝난 단계. 실패 뒤 같은 값을 넘기면 남은 단계만 한다.
 */
export async function unblockProject(fetchImpl, project, input, { ids = newUnblockIds(), progress = {}, signalKey = '' } = {}) {
  const branch = input?.branch;
  const done = { decision: false, task: false, project: false, ...progress };
  if (!UNBLOCK_BRANCHES.includes(branch)) return { ok: false, stage: 'input', message: '어떻게 풀지 골라 주세요.', progress: done, unblocked: false };

  if (branch !== 'decision') {
    if (branch === 'next-version' && !String(input.nextVersionText || '').trim()) {
      return { ok: false, stage: 'input', message: '이번 범위에서 뺄 것을 적어 주세요.', progress: done, unblocked: false };
    }
    const result = await patchProject(fetchImpl, project, { branch, note: input.note || '', nextVersionText: input.nextVersionText || '' });
    if (!result.ok) {
      const conflict = result.status === 'conflict';
      return {
        ok: false, stage: 'project', conflict, progress: done, unblocked: false,
        message: conflict ? '프로젝트가 다른 곳에서 먼저 바뀌었습니다 — 최신 기록으로 다시 풀 수 있습니다.' : why(result) || '막힘을 풀지 못했습니다.',
      };
    }
    return { ok: true, stage: 'done', progress: { ...done, project: true }, unblocked: true, project: result.data?.project || null, message: '' };
  }

  const decision = input.decision || {};
  const clearBlocker = decision.clearBlocker !== false;

  // 1·2. 결정 → 그래서 할 일(decision-actions.js) — 결정이 실패하면 멈추고, 할 일이 실패하면 결정은 남았다고 말한다.
  const saved = await saveDecisionWithFollowup(fetchImpl, {
    title: decision.title,
    rationale: decision.rationale,
    projectId: project.id,
    source: 'project-unblock',
    sourceRef: { type: 'project', id: project.id },
    taskTitle: decision.taskTitle,
    taskDueAt: decision.taskDueAt,
    signalKey,
  }, { ids, progress: { decision: done.decision, task: done.task } });
  Object.assign(done, saved.progress);
  if (!saved.ok) return { ...saved, progress: done, unblocked: false };

  // 3. 막힌 점 비우고 진행으로 — 버전 충돌이면 결정은 남았고 막힘만 남았다고 말한다.
  if (clearBlocker && !done.project) {
    const result = await patchProject(fetchImpl, project, { branch: 'decision', decisionId: ids.decisionId });
    if (!result.ok) {
      const conflict = result.status === 'conflict';
      return { ok: false, stage: 'project', conflict, progress: done, decisionId: ids.decisionId, taskId: done.task ? ids.taskId : null, unblocked: false,
        message: conflict
          ? '결정은 남았습니다 · 막힘은 아직 풀리지 않았습니다 — 프로젝트가 다른 곳에서 먼저 바뀌었습니다.'
          : `결정은 남았습니다 · 막힘은 아직 풀리지 않았습니다${why(result) ? ` — ${why(result)}` : ''}.` };
    }
    done.project = true;
  }

  // 4. 결정에 표시용 링크 — 실패해도 막힘 풀기는 성공이다(결정 일지는 할 일의 decision_id로도 찾는다).
  await linkDecision(fetchImpl, ids.decisionId, { nextTaskId: done.task ? ids.taskId : null, unblockedProjectId: done.project ? project.id : null });

  return { ok: true, stage: 'done', progress: done, decisionId: ids.decisionId, taskId: done.task ? ids.taskId : null, unblocked: done.project, message: '' };
}
