'use strict';
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  else (root.PetModel = root.PetModel || {}).officeDiagnostic = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  // Observation metadata is deliberately session-local. The existing pending
  // store alone owns the original command (including its historical revision).
  const STALE_AFTER_MS = 60 * 1000;
  const stamp = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value)) ? value : null;
  const sameRequest = (a, b) => !!a && !!b && ['origin', 'scope', 'id', 'requestId'].every(k => a[k] === b[k]);
  const sameContext = (a, b) => sameRequest(a, b)
    && ['connection', 'selection', 'account'].every(k => a[k] === b[k]);
  function target(command, context) {
    if (!command || command.phase !== 'send' || !command.requestId) return null;
    return { origin: command.origin, scope: command.scope, id: command.id, requestId: command.requestId,
      connection: context.connection, selection: context.selection, account: context.account ?? null };
  }
  function create(command, context) {
    return { target: target(command, context), message: typeof command.message === 'string' ? command.message : '', issued: 0,
      lastObservation: null, lastAttempt: null };
  }
  function begin(state, at) {
    const next = { ...state, issued: state.issued + 1, lastAttempt: { startedAt: at, receivedAt: null, outcome: 'checking' } };
    return { state: next, ticket: { target: { ...state.target }, sequence: next.issued, startedAt: at } };
  }
  function matches(detail, state) {
    return detail?.meeting?.meetingId === state.target.id && detail.meeting.scope === state.target.scope;
  }
  function classification(turn) {
    // finishedAt, age, revision and a received timestamp never prove finality.
    const d = turn.diagnostic;
    return turn.state === 'unknown' && d?.version === 1 && stamp(d.observedAt)
      && ['overdue-running', 'finished-unknown'].includes(d.kind) ? d.kind : 'unclassified';
  }
  function finish(state, ticket, result, receivedAt) {
    if (!sameContext(state.target, ticket.target) || state.issued !== ticket.sequence) return { state, apply: false };
    const attempt = outcome => ({ ...state, lastAttempt: { startedAt: ticket.startedAt, receivedAt, outcome } });
    if (!['live', 'partial'].includes(result?.kind)) {
      const outcome = result?.kind === 'unauthorized' ? 'unauthorized'
        : result?.error === 'offline' ? 'offline' : result?.error === 'timeout' ? 'timeout'
          : result?.error === 'stale-origin' ? 'context-changed' : 'read-error';
      return { state: attempt(outcome), apply: false };
    }
    const detail = result.data;
    if (!matches(detail, state) || !Array.isArray(detail.turns)) return { state: attempt('invalid-response'), apply: false };
    const turn = detail.turns.find(t => t.id === state.target.requestId);
    if (!turn) return { state: attempt(detail.historyComplete === true ? 'not-observed' : 'partial'), apply: false };
    if (typeof turn.message !== 'string' || turn.message !== state.message.trim()
      || !['running', 'unknown', 'generated', 'error'].includes(turn.state)) {
      return { state: attempt('invalid-response'), apply: false };
    }
    // Completion already verified in this connection is absorbing. A later
    // read's arrival time or meeting revision cannot make unknown more current.
    if (state.lastObservation?.state === 'generated' && turn.state !== 'generated') {
      return { state: attempt('older-observation'), apply: false };
    }
    return { apply: true, state: { ...attempt('observed'), lastObservation: {
      state: turn.state, classification: classification(turn),
      serverObservedAt: stamp(turn.diagnostic?.observedAt) || stamp(detail.observedAt), receivedAt,
    } } };
  }
  function blocked(state, at, outcome = 'offline') {
    return { ...state, issued: state.issued + 1, lastAttempt: { startedAt: at, receivedAt: null, outcome } };
  }
  function describe(state, now = Date.now()) {
    const observed = state?.lastObservation, attempt = state?.lastAttempt;
    const stale = !!observed && ((attempt && attempt.outcome !== 'observed') || now - Date.parse(observed.receivedAt) >= STALE_AFTER_MS);
    const labels = { running: '생성 중', generated: '일치하는 완료 결과 확인', error: '서버가 생성 실패를 확인함' };
    const unknown = { 'overdue-running': 'unknown · 실행 기한 경과 확인',
      'finished-unknown': 'unknown · 결과 미확인 종료 확인', unclassified: 'unknown · 분류 근거 부족' };
    const outcomes = { checking: '조회 중', observed: '대상 요청 확인', partial: '일부 기록만 확인 · 대상 요청 미포함',
      'not-observed': '이번 조회에서 대상 요청을 확인하지 못함', offline: '연결 불가 · 조회 미확인', timeout: '조회 시간 초과',
      unauthorized: '로그인 필요 · 조회 미확인', 'read-error': '조회 실패', 'invalid-response': '응답 일치 확인 실패',
      'context-changed': '연결 세대 변경 · 응답 미적용', 'older-observation': '이전 상태 응답 · 완료 결과 유지' };
    return { stale, label: observed ? labels[observed.state] || unknown[observed.classification] : '서버 상태 아직 확인 못 함',
      explanation: observed?.state === 'generated' ? '원래 요청 ID와 질문이 일치하는 완료 결과를 확인했어요.'
        : observed?.state === 'error' ? '원래 요청 ID와 질문이 일치하는 생성 실패 기록을 확인했어요.'
          : observed?.state === 'running' ? '서버가 생성 중 상태를 확인했어요. 최종 결과는 아직 확인되지 않았어요.'
            : observed?.classification === 'overdue-running' ? '서버가 기한을 넘긴 실행 상태를 확인했어요. 최종 결과와 이후 완료 여부는 아직 확인되지 않았어요.'
        : observed?.classification === 'finished-unknown' ? '서버가 결과 미확인 상태로 종료했음을 확인했어요. 성공·실패나 복구 가능 여부는 확인되지 않았어요.'
          : '원인과 이후 완료 가능 여부를 확인할 근거가 부족해요. 시간이 지나거나 종료 시각이 있어도 새 요청 허용 근거가 되지 않아요.',
      attemptLabel: outcomes[attempt?.outcome] || '이 화면에서 아직 조회하지 않음' };
  }
  return { STALE_AFTER_MS, sameRequest, sameContext, target, create, begin, finish, blocked, describe };
});
