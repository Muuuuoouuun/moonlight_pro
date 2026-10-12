// These flows advance only on an explicit acknowledgement of the submitted record.
import { isCanonicalUuid } from './uuid.js';

export const sameInstant = (a, b) => a == null || a === '' ? b == null || b === ''
  : typeof b === 'string' && Number.isFinite(Date.parse(a)) && Date.parse(a) === Date.parse(b);
export const sameJson = (a, b) => {
  const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
};
const scoped = (record, body) => isCanonicalUuid(record?.workspace_id)
  && (!body.expectedWorkspaceId || record.workspace_id === body.expectedWorkspaceId);

export function taskAcknowledges(task, body) {
  return task?.id === body.id && scoped(task, body) && task.title === body.title
    && task.status === (body.status || 'todo') && task.priority === (body.priority || 'medium')
    && sameInstant(body.dueAt || null, task.due_at)
    && (task.project_id || null) === (body.projectId || null)
    && (task.meta?.deal_id || null) === (body.dealId || null)
    && (task.meta?.decision_id || null) === (body.decisionId || null)
    && (task.meta?.signal_key || null) === (body.signalKey || null)
    && task.meta?.source === body.source;
}

export function decisionAcknowledges(decision, body) {
  return decision?.id === body.id && scoped(decision, body) && decision.title === body.title
    && decision.project_id === body.projectId && (decision.rationale || null) === (body.rationale || null)
    && sameInstant(body.decidedAt, decision.decided_at) && decision.meta?.source === body.source
    && sameJson(decision.meta?.sourceRef || null, body.sourceRef || null);
}

export async function sendCheckWrite(fetchImpl, url, method, body, acknowledges = null) {
  try {
    const response = await fetchImpl(url, { method, headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
    const data = await response.json().catch(() => null);
    let status = typeof data?.status === 'string' ? data.status : 'unknown';
    let ok = response.ok && ['saved', 'duplicate'].includes(status);
    if (ok && acknowledges && !acknowledges(data, body)) { ok = false; status = 'unknown'; }
    if (!response.ok && ['saved', 'duplicate', 'updated'].includes(status)) status = 'unknown';
    return { ok, status, data: data || {} };
  } catch {
    // A transport failure does not prove that the server did not commit.
    return { ok: false, status: 'unknown', data: {} };
  }
}
