// 막힘 풀기 — 세 갈래의 저장 순서(docs/superpowers/specs/2026-09-30-check-items-finish-and-unblock-design.md §5.2·§5.3).
// React 없음 — fetch를 주입받아 테스트한다. 확인할 것 카드와 프로젝트 상세가 같이 쓴다.
//
// 결정·할 일·프로젝트는 서로 다른 테이블이라 한 트랜잭션이 아니다. id를 미리 만들어(재시도 멱등) 순서대로
// 쓰고, 중간에 멈추면 무엇이 남았는지 그대로 말한다. `progress`를 넘기면 이미 끝난 단계는 건너뛴다.

import { deliveryDraft } from '../../../../packages/project-delivery/index.ts';

import { sendCheckWrite, taskAcknowledges, decisionAcknowledges } from '@/lib/check-write-ack';

export const UNBLOCK_BRANCHES = Object.freeze(['resolved', 'decision', 'next-version']);

async function send(fetchImpl, url, method, body) {
  const acknowledges = (data, submitted) => {
    if (url === '/api/hub/tasks') return taskAcknowledges(data.task, submitted);
    if (url === '/api/hub/decisions' && method === 'POST') return decisionAcknowledges(data.decision, submitted);
    if (url === '/api/hub/projects') {
      const row = data.project;
      return row?.id === submitted.id && typeof row.workspace_id === 'string'
        && (!submitted.expectedWorkspaceId || row.workspace_id === submitted.expectedWorkspaceId)
        && row.status === 'active' && row.meta?.delivery?.blocker === ''
        && row.meta.delivery.nextVersion === submitted.delivery.nextVersion;
    }
    return data.decision?.id === submitted.id && (!submitted.nextTaskId || data.decision.meta?.nextTaskId === submitted.nextTaskId) && (!submitted.unblockedProjectId || data.decision.meta?.unblockedProjectId === submitted.unblockedProjectId);
  };
  return sendCheckWrite(fetchImpl, url, method, body, acknowledges);
}

function why(result) {
  if (result.status === 'preview') return '저장소 연결이 필요합니다 — 저장되지 않았습니다.';
  if (result.status === 'invalid-input') return String(result.data?.error || '입력을 확인해 주세요.');
  if (result.status === 'unknown') return '저장 여부를 확인하지 못했습니다. 같은 입력과 ID로 다시 확인하세요.';
  return '';
}

/** 재시도해도 같은 결정·할 일이 되도록 한 번 만들어 두는 id 묶음. */
export function newUnblockIds(now = Date.now()) {
  return { decisionId: globalThis.crypto.randomUUID(), taskId: globalThis.crypto.randomUUID(), decidedAt: new Date(now).toISOString() };
}

/** 다음 버전으로 넘길 범위 — 기존 글 뒤에 한 줄로 덧붙인다. */
export function appendNextVersion(current, addition) {
  const before = String(current || '').trim();
  const add = String(addition || '').trim();
  if (!add) return before;
  return (before ? `${before}\n${add}` : add).slice(0, 4000);
}

async function patchProject(fetchImpl, project, { branch, note = '', nextVersionText = '', decisionId = null, context = null }) {
  const plan = deliveryDraft(project.delivery || {});
  const delivery = {
    ...plan,
    blocker: '',
    ...(branch === 'next-version' ? { nextVersion: appendNextVersion(plan.nextVersion, nextVersionText) } : {}),
  };
  return send(fetchImpl, '/api/hub/projects', 'PATCH', {
    id: project.id,
    ...(context ? { expectedWorkspaceId: context.workspaceId, recoveryOwner: context.ownerKey } : {}),
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
export async function unblockProject(fetchImpl, project, input, { ids = newUnblockIds(), progress = {}, signalKey = '', context = null } = {}) {
  const branch = input?.branch;
  const done = { decision: false, task: false, project: false, ...progress };
  if (!UNBLOCK_BRANCHES.includes(branch)) return { ok: false, stage: 'input', message: '어떻게 풀지 골라 주세요.', progress: done, unblocked: false };

  if (branch !== 'decision') {
    if (branch === 'next-version' && !String(input.nextVersionText || '').trim()) {
      return { ok: false, stage: 'input', message: '이번 범위에서 뺄 것을 적어 주세요.', progress: done, unblocked: false };
    }
    const result = await patchProject(fetchImpl, project, { branch, note: input.note || '', nextVersionText: input.nextVersionText || '', context });
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
  const title = String(decision.title || '').trim();
  if (!title) return { ok: false, stage: 'input', message: '무엇을 정했는지 적어 주세요.', progress: done, unblocked: false };
  const taskTitle = String(decision.taskTitle || '').trim();
  const clearBlocker = decision.clearBlocker !== false;

  // 1. 결정 — 명시 ACK를 확인하지 못하면 같은 ID로 멈춘다.
  if (!done.decision) {
    const saved = await send(fetchImpl, '/api/hub/decisions', 'POST', {
      id: ids.decisionId,
      ...(context ? { expectedWorkspaceId: context.workspaceId, recoveryOwner: context.ownerKey } : {}),
      title: title.slice(0, 300),
      rationale: String(decision.rationale || '').trim().slice(0, 4000) || null,
      projectId: project.id,
      decidedAt: ids.decidedAt,
      source: 'project-unblock',
      sourceRef: { type: 'project', id: project.id },
    });
    if (!saved.ok) return { ok: false, stage: 'decision', progress: done, unblocked: false, message: why(saved) || '결정의 저장 응답을 확인하지 못했습니다. 같은 요청으로 다시 확인하세요.' };
    done.decision = true;
  }

  // 2. 그래서 할 일 — 실패하면 결정은 남았다고 말한다.
  if (taskTitle && !done.task) {
    const task = await send(fetchImpl, '/api/hub/tasks', 'POST', {
      id: ids.taskId,
      ...(context ? { expectedWorkspaceId: context.workspaceId, recoveryOwner: context.ownerKey } : {}),
      title: taskTitle.slice(0, 300),
      projectId: project.id,
      decisionId: ids.decisionId,
      source: 'project-unblock',
      ...(decision.taskDueAt ? { dueAt: decision.taskDueAt } : {}),
      ...(signalKey ? { signalKey } : {}),
    });
    if (!task.ok) {
      return { ok: false, stage: 'task', progress: done, decisionId: ids.decisionId, unblocked: false,
        message: `결정은 남았습니다 · ${task.status === 'unknown' ? '할 일의 저장 응답을 확인하지 못했습니다' : '할 일을 만들지 못했습니다'}${why(task) ? ` — ${why(task)}` : ''}. 다시 누르면 같은 할 일 요청부터 이어 갑니다.` };
    }
    done.task = true;
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('moonlight:tasks-saved'));
  }

  // 3. 막힌 점 비우고 진행으로 — 버전 충돌이면 결정은 남았고 막힘만 남았다고 말한다.
  if (clearBlocker && !done.project) {
    const result = await patchProject(fetchImpl, project, { branch: 'decision', decisionId: ids.decisionId, context });
    if (!result.ok) {
      const conflict = result.status === 'conflict';
      return { ok: false, stage: 'project', conflict, progress: done, decisionId: ids.decisionId, taskId: done.task ? ids.taskId : null, unblocked: false,
        message: conflict
          ? '결정은 남았습니다 · 막힘은 아직 풀리지 않았습니다 — 프로젝트가 다른 곳에서 먼저 바뀌었습니다.'
          : `결정은 남았습니다 · ${result.status === 'unknown' ? '막힘 변경 응답을 확인하지 못했습니다' : '막힘은 아직 풀리지 않았습니다'}${why(result) ? ` — ${why(result)}` : ''}.` };
    }
    done.project = true;
  }

  // 4. 결정에 표시용 링크 — 실패해도 막힘 풀기는 성공이다(결정 일지는 할 일의 decision_id로도 찾는다).
  if (done.task || done.project) {
    const linked = await send(fetchImpl, '/api/hub/decisions', 'PATCH', {
      id: ids.decisionId,
      ...(context ? { expectedWorkspaceId: context.workspaceId, recoveryOwner: context.ownerKey } : {}),
      ...(done.task ? { nextTaskId: ids.taskId } : {}),
      ...(done.project ? { unblockedProjectId: project.id } : {}),
    });
    if (!linked.ok) return { ok: true, stage: 'done', progress: done, decisionId: ids.decisionId, taskId: done.task ? ids.taskId : null, unblocked: done.project, message: '기록은 남았지만 결정의 표시용 연결은 확인하지 못했습니다.' };
  }

  return { ok: true, stage: 'done', progress: done, decisionId: ids.decisionId, taskId: done.task ? ids.taskId : null, unblocked: done.project, message: '' };
}
