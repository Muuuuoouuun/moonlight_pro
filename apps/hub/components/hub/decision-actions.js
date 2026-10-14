// 결정 + 그래서 할 일 — 한 번에 남기는 저장 순서(확인할 것 스펙 §5.3·§6·§13). React 없음.
// 결정 일지의 `결정 남기기`, 확인할 것 카드의 `결정으로 남기기`, 막힘 풀기의 `결정으로 풀기`가 같이 쓴다.
//
// 결정·할 일은 서로 다른 테이블이라 한 트랜잭션이 아니다. id를 미리 만들어(재시도 멱등) 순서대로 쓰고,
// 중간에 멈추면 무엇이 남았는지 그대로 말한다. `progress`를 넘기면 이미 끝난 단계는 건너뛴다.
// 저장 성공은 응답이 보낸 기록을 명시적으로 돌려줄 때만이다(check-write-ack) — 확인 못 하면 `unknown`.

import { sendCheckWrite, taskAcknowledges, decisionAcknowledges } from '@/lib/check-write-ack';

function acknowledges(url, method) {
  return (data, submitted) => {
    if (url === '/api/hub/tasks') {
      return method === 'POST' ? taskAcknowledges(data.task, submitted)
        : data.task?.id === submitted.id && (!submitted.status || data.task.status === submitted.status);
    }
    if (url === '/api/hub/decisions' && method === 'POST') return decisionAcknowledges(data.decision, submitted);
    if (url === '/api/hub/projects') {
      const row = data.project;
      return row?.id === submitted.id && typeof row.workspace_id === 'string'
        && (!submitted.expectedWorkspaceId || row.workspace_id === submitted.expectedWorkspaceId)
        && row.status === 'active' && row.meta?.delivery?.blocker === ''
        && row.meta.delivery.nextVersion === submitted.delivery.nextVersion;
    }
    return data.decision?.id === submitted.id
      && (!submitted.nextTaskId || data.decision.meta?.nextTaskId === submitted.nextTaskId)
      && (!submitted.unblockedProjectId || data.decision.meta?.unblockedProjectId === submitted.unblockedProjectId);
  };
}

export function sendJson(fetchImpl, url, method, body) {
  return sendCheckWrite(fetchImpl, url, method, body, acknowledges(url, method));
}

export function failureReason(result) {
  if (result.status === 'preview') return '저장소 연결이 필요합니다 — 저장되지 않았습니다.';
  if (result.status === 'invalid-input') return String(result.data?.error || '입력을 확인해 주세요.');
  if (result.status === 'unknown') return '저장 여부를 확인하지 못했습니다. 같은 입력과 ID로 다시 확인하세요.';
  return '';
}

const scope = context => (context ? { expectedWorkspaceId: context.workspaceId, recoveryOwner: context.ownerKey } : {});

/** 재시도해도 같은 결정·할 일이 되도록 한 번 만들어 두는 id 묶음. */
export function newDecisionIds(now = Date.now()) {
  return { decisionId: globalThis.crypto.randomUUID(), taskId: globalThis.crypto.randomUUID(), decidedAt: new Date(now).toISOString() };
}

/**
 * @param decision { title, rationale?, projectId?, decidedAt?, source, sourceRef?, taskTitle?, taskDueAt?, signalKey? }
 *   decidedAt — 생략하면 ids.decidedAt(지금), 빈 문자열이면 미정.
 * @param options  { ids, progress, context } — context는 useCheckWrite가 준 { workspaceId, ownerKey }.
 * @returns {{ ok, stage, status, progress: { decision, task }, decisionId, taskId, message }}
 */
export async function saveDecisionWithFollowup(fetchImpl, decision, { ids = newDecisionIds(), progress = {}, context = null } = {}) {
  const done = { decision: false, task: false, ...progress };
  const title = String(decision?.title || '').trim();
  if (!title) return { ok: false, stage: 'input', message: '무엇을 정했는지 적어 주세요.', progress: done };
  const taskTitle = String(decision.taskTitle || '').trim();
  const projectId = decision.projectId || null;

  // 1. 결정 — 명시 ACK를 확인하지 못하면 같은 ID로 멈춘다.
  if (!done.decision) {
    const saved = await sendJson(fetchImpl, '/api/hub/decisions', 'POST', {
      id: ids.decisionId,
      ...scope(context),
      title: title.slice(0, 300),
      rationale: String(decision.rationale || '').trim().slice(0, 4000) || null,
      projectId,
      decidedAt: decision.decidedAt === undefined ? ids.decidedAt : decision.decidedAt,
      source: decision.source || 'hub-work',
      ...(decision.sourceRef ? { sourceRef: decision.sourceRef } : {}),
    });
    if (!saved.ok) {
      return { ok: false, stage: 'decision', status: saved.status, progress: done,
        message: failureReason(saved) || '결정의 저장 응답을 확인하지 못했습니다. 같은 요청으로 다시 확인하세요.' };
    }
    done.decision = true;
  }

  // 2. 그래서 할 일 — 실패하면 결정은 남았다고 말한다.
  if (taskTitle && !done.task) {
    const task = await sendJson(fetchImpl, '/api/hub/tasks', 'POST', {
      id: ids.taskId,
      ...scope(context),
      title: taskTitle.slice(0, 300),
      projectId,
      decisionId: ids.decisionId,
      source: decision.source || 'hub-work',
      ...(decision.taskDueAt ? { dueAt: decision.taskDueAt } : {}),
      ...(decision.signalKey ? { signalKey: decision.signalKey } : {}),
    });
    if (!task.ok) {
      return { ok: false, stage: 'task', status: task.status, progress: done, decisionId: ids.decisionId,
        message: `결정은 남았습니다 · ${task.status === 'unknown' ? '할 일의 저장 응답을 확인하지 못했습니다' : '할 일을 만들지 못했습니다'}${failureReason(task) ? ` — ${failureReason(task)}` : ''}. 다시 누르면 같은 할 일 요청부터 이어 갑니다.` };
    }
    done.task = true;
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('moonlight:tasks-saved'));
  }

  return { ok: true, stage: 'done', status: 'saved', progress: done, decisionId: ids.decisionId, taskId: done.task ? ids.taskId : null, message: '' };
}

/** 결정에 표시용 링크를 붙인다 — 실패해도 앞 단계는 성공이다(일지는 할 일의 decision_id로도 찾는다). */
export async function linkDecision(fetchImpl, decisionId, { nextTaskId = null, unblockedProjectId = null, context = null } = {}) {
  if (!nextTaskId && !unblockedProjectId) return { ok: true, status: 'skipped' };
  return sendJson(fetchImpl, '/api/hub/decisions', 'PATCH', {
    id: decisionId,
    ...scope(context),
    ...(nextTaskId ? { nextTaskId } : {}),
    ...(unblockedProjectId ? { unblockedProjectId } : {}),
  });
}
