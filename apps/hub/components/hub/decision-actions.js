// 결정 + 그래서 할 일 — 한 번에 남기는 저장 순서(확인할 것 스펙 §5.3·§6·§13). React 없음.
// 결정 일지의 `결정 남기기`, 확인할 것 카드의 `결정으로 남기기`, 막힘 풀기의 `결정으로 풀기`가 같이 쓴다.
//
// 결정·할 일은 서로 다른 테이블이라 한 트랜잭션이 아니다. id를 미리 만들어(재시도 멱등) 순서대로 쓰고,
// 중간에 멈추면 무엇이 남았는지 그대로 말한다. `progress`를 넘기면 이미 끝난 단계는 건너뛴다.

const OK = new Set(['saved', 'duplicate']);

export async function sendJson(fetchImpl, url, method, body) {
  try {
    const response = await fetchImpl(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const data = await response.json().catch(() => ({}));
    const status = String(data?.status || (response.ok ? 'saved' : 'error'));
    return { ok: response.ok && OK.has(status), status, data };
  } catch (error) {
    return { ok: false, status: 'error', data: { error: error instanceof Error ? error.message : String(error) } };
  }
}

export function failureReason(result) {
  if (result.status === 'preview') return '저장소 연결이 필요합니다 — 저장되지 않았습니다.';
  if (result.status === 'invalid-input') return String(result.data?.error || '입력을 확인해 주세요.');
  return '';
}

/** 재시도해도 같은 결정·할 일이 되도록 한 번 만들어 두는 id 묶음. */
export function newDecisionIds(now = Date.now()) {
  return { decisionId: globalThis.crypto.randomUUID(), taskId: globalThis.crypto.randomUUID(), decidedAt: new Date(now).toISOString() };
}

/**
 * @param decision { title, rationale?, projectId?, decidedAt?, source, sourceRef?, taskTitle?, taskDueAt?, signalKey? }
 *   decidedAt — 생략하면 ids.decidedAt(지금), 빈 문자열이면 미정.
 * @returns {{ ok, stage, progress: { decision, task }, decisionId, taskId, message }}
 */
export async function saveDecisionWithFollowup(fetchImpl, decision, { ids = newDecisionIds(), progress = {} } = {}) {
  const done = { decision: false, task: false, ...progress };
  const title = String(decision?.title || '').trim();
  if (!title) return { ok: false, stage: 'input', message: '무엇을 정했는지 적어 주세요.', progress: done };
  const taskTitle = String(decision.taskTitle || '').trim();
  const projectId = decision.projectId || null;

  if (!done.decision) {
    const saved = await sendJson(fetchImpl, '/api/hub/decisions', 'POST', {
      id: ids.decisionId,
      title: title.slice(0, 300),
      rationale: String(decision.rationale || '').trim().slice(0, 4000) || null,
      projectId,
      decidedAt: decision.decidedAt === undefined ? ids.decidedAt : decision.decidedAt,
      source: decision.source || 'hub-work',
      ...(decision.sourceRef ? { sourceRef: decision.sourceRef } : {}),
    });
    if (!saved.ok) return { ok: false, stage: 'decision', status: saved.status, progress: done, message: failureReason(saved) || '결정을 남기지 못했습니다. 아무것도 저장되지 않았습니다.' };
    done.decision = true;
  }

  if (taskTitle && !done.task) {
    const task = await sendJson(fetchImpl, '/api/hub/tasks', 'POST', {
      id: ids.taskId,
      title: taskTitle.slice(0, 300),
      projectId,
      decisionId: ids.decisionId,
      source: decision.source || 'hub-work',
      ...(decision.taskDueAt ? { dueAt: decision.taskDueAt } : {}),
      ...(decision.signalKey ? { signalKey: decision.signalKey } : {}),
    });
    if (!task.ok) {
      return { ok: false, stage: 'task', status: task.status, progress: done, decisionId: ids.decisionId,
        message: `결정은 남았습니다 · 할 일을 만들지 못했습니다${failureReason(task) ? ` — ${failureReason(task)}` : ''}. 다시 누르면 할 일부터 이어 갑니다.` };
    }
    done.task = true;
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('moonlight:tasks-saved'));
  }

  return { ok: true, stage: 'done', status: 'saved', progress: done, decisionId: ids.decisionId, taskId: done.task ? ids.taskId : null, message: '' };
}

/** 결정에 표시용 링크를 붙인다 — 실패해도 앞 단계는 성공이다(일지는 할 일의 decision_id로도 찾는다). */
export async function linkDecision(fetchImpl, decisionId, { nextTaskId = null, unblockedProjectId = null } = {}) {
  if (!nextTaskId && !unblockedProjectId) return { ok: true, status: 'skipped' };
  return sendJson(fetchImpl, '/api/hub/decisions', 'PATCH', {
    id: decisionId,
    ...(nextTaskId ? { nextTaskId } : {}),
    ...(unblockedProjectId ? { unblockedProjectId } : {}),
  });
}
