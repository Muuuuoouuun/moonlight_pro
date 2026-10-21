// Read-only, mounted-view metadata. The existing meeting store owns requests,
// drafts and completion policy; this module never writes or releases them.
const stamp = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
  && Number.isFinite(Date.parse(value)) ? value : null;
const sameTarget = (a, b) => Boolean(a && b && ['origin', 'scope', 'meetingId'].every(key => a[key] === b[key]));
const unresolved = turn => ['running', 'unknown'].includes(turn?.state);

export function officeUnknownReason(turn) {
  const diagnostic = turn?.diagnostic;
  return turn?.state === 'unknown' && diagnostic?.version === 1 && stamp(diagnostic.observedAt)
    && ['overdue-running', 'finished-unknown'].includes(diagnostic.kind) ? diagnostic.kind : 'unclassified';
}

export function guardOfficeMeetingRead(session, result) {
  if (result?.status !== 'ready') return result;
  if (result.historyComplete === false) return { status: 'error', code: 'office-meeting-incomplete-history',
    error: '전체 기록을 확인하지 못했습니다. 마지막 확인 기록과 입력을 유지했습니다.' };
  if (session.meetingId !== result.meeting?.meetingId || session.meeting?.scope !== result.meeting?.scope) return result;
  // A later arrival or higher meeting revision cannot undo an already verified
  // generated turn. Do not replace readable history with a regressed snapshot.
  const regressed = session.turns.some(turn => !result.turns?.some(row => row.id === turn.id && row.state === 'generated'));
  return regressed ? { status: 'error', code: 'office-meeting-older-observation',
    error: '완료 기록과 일치하지 않는 응답입니다. 마지막 확인 기록과 입력을 유지했습니다.' } : result;
}

export function beginOfficeMeetingRead(previous, target, sequence, startedAt, knownTurn) {
  const keep = sameTarget(previous?.target, target)
    && (!knownTurn?.id || !previous.requestId || previous.requestId === knownTurn.id);
  return { target: { ...target }, sequence, requestId: knownTurn?.id || (keep ? previous.requestId : null),
    lastObservation: keep ? previous.lastObservation : null,
    lastAttempt: { startedAt, receivedAt: null, outcome: 'checking' } };
}

export function finishOfficeMeetingRead(state, target, sequence, result, receivedAt) {
  if (!sameTarget(state?.target, target) || state.sequence !== sequence) return state;
  const attempt = outcome => ({ ...state, lastAttempt: { ...state.lastAttempt, receivedAt, outcome } });
  if (result?.status !== 'ready') return attempt(result?.code === 'office-meeting-older-observation' ? 'older-observation'
    : result?.code === 'office-meeting-incomplete-history' ? 'partial' : result?.status === 'preview' ? 'unavailable' : 'read-error');
  if (result.meeting?.meetingId !== target.meetingId || result.meeting.scope !== target.scope || !Array.isArray(result.turns)) {
    return attempt('invalid-response');
  }
  // A page without the request is not evidence of its absence. Only the client
  // adapter can certify that every page of this snapshot was restored.
  if (result.historyComplete !== true) return attempt('partial');
  const requestId = state.requestId || result.turns.find(unresolved)?.id;
  if (!requestId) return attempt('no-unresolved');
  const turn = result.turns.find(item => item.id === requestId);
  if (!turn) return attempt('not-observed');
  if (turn.request?.scope !== target.scope || !['running', 'unknown', 'generated', 'error'].includes(turn.state)
    || (turn.state === 'generated' && turn.result?.scope !== target.scope)) return attempt('invalid-response');
  if (state.lastObservation?.state === 'generated' && turn.state !== 'generated') return attempt('older-observation');
  return { ...attempt('observed'), requestId, lastObservation: { requestId, state: turn.state,
    reason: officeUnknownReason(turn), receivedAt,
    serverObservedAt: stamp(turn.diagnostic?.observedAt) || stamp(result.observedAt) } };
}

export function describeOfficeMeetingRead(state, { scope, meetingId, knownTurn, now = Date.now() }) {
  const current = state?.target.scope === scope && state.target.meetingId === meetingId
    && (!knownTurn?.id || !state.requestId || state.requestId === knownTurn.id) ? state : null;
  const observation = current?.lastObservation;
  const turn = observation || knownTurn;
  const reason = observation?.reason || officeUnknownReason(knownTurn);
  const labels = { running: '생성 중으로 기록됨', generated: '완료 결과가 기록됨', error: '생성 실패로 기록됨' };
  const unknown = { 'overdue-running': 'unknown · 실행 기한 경과 확인', 'finished-unknown': 'unknown · 결과 미확인 종료 확인', unclassified: 'unknown · 원인 확인 근거 부족' };
  const attempts = { checking: '조회 중', observed: '대상 요청 확인', 'read-error': '조회 실패 · 연결 또는 로그인 상태 확인 필요',
    unavailable: '저장 연결 확인 필요', partial: '일부 기록만 확인 · 마지막 확인 유지', 'not-observed': '이번 조회에서 대상 요청 미확인',
    'invalid-response': '응답 범위·요청 확인 실패', 'no-unresolved': '이번 조회에서 미확인 요청 기록 없음',
    'older-observation': '이전 상태 응답 · 확인한 완료 기록 유지' };
  const stale = Boolean(observation && (current.lastAttempt?.outcome !== 'observed' || now - Date.parse(observation.receivedAt) >= 60000));
  return { requestId: current?.requestId || knownTurn?.id || null, observation, attempt: current?.lastAttempt,
    origin: current?.target.origin || null, stale, label: turn ? labels[turn.state] || unknown[reason] : '서버 상태 아직 확인 못 함',
    attemptLabel: attempts[current?.lastAttempt?.outcome] || '이 화면에서 아직 조회하지 않음',
    explanation: turn?.state === 'running' ? '서버 기록은 생성 중입니다. 최종 결과는 아직 확인되지 않았습니다.'
      : turn?.state === 'generated' ? '같은 요청 ID의 완료 결과를 확인했습니다.'
        : turn?.state === 'error' ? '같은 요청 ID의 생성 실패 기록을 확인했습니다.'
          : reason === 'overdue-running' ? '서버가 실행 기한 경과를 확인했습니다. 이후 완료 여부는 아직 확인되지 않았습니다.'
            : reason === 'finished-unknown' ? '서버가 결과 미확인 종료를 확인했습니다. 성공·실패나 복구 가능 여부는 확인되지 않았습니다.'
              : '원인과 이후 완료 가능 여부를 확인할 근거가 부족합니다. 경과 시간이나 종료 시각만으로 확정하지 않습니다.' };
}
