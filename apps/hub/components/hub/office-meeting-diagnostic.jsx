import React from 'react';
import { describeOfficeMeetingRead } from './office-meeting-diagnostic.js';
import styles from './pages/office-council.module.css';

const time = value => value ? new Date(value).toLocaleString('ko-KR', { hour12: false }) : '확인 기록 없음';

export function OfficeMeetingDiagnostic({ state, scope, meetingId, knownTurn, now }) {
  const view = describeOfficeMeetingRead(state, { scope, meetingId, knownTurn, now });
  return <details className={styles.request + ' ' + styles.meetingDiagnostic}>
    <summary>요청 확인 내역 · {view.label}{view.stale ? ' · 이전 확인' : ''}</summary>
    <p className={styles.note}>{view.explanation}</p>
    <dl>
      <div><dt>요청 ID</dt><dd className="mono">{view.requestId || '현재 화면에서 확인되지 않음'}</dd></div>
      <div><dt>회의 ID</dt><dd className="mono">{meetingId || '저장된 회의 미확인'}</dd></div>
      <div><dt>범위 · 주소</dt><dd>{scope === 'classin' ? '회사' : scope === 'personal' ? '개인' : '전체'} · {view.origin || '현재 Hub 주소 · 이 화면의 조회 기록 없음'}</dd></div>
      <div><dt>서버 관찰 시각</dt><dd>{time(view.observation?.serverObservedAt)}</dd></div>
      <div><dt>마지막 확인 수신</dt><dd>{time(view.observation?.receivedAt)}{view.stale ? ' · 이전 확인이며 현재 상태 미확인' : ''}</dd></div>
      <div><dt>최근 조회 시도</dt><dd>{time(view.attempt?.startedAt)} · {view.attemptLabel}</dd></div>
      {view.attempt?.receivedAt ? <div><dt>최근 조회 응답</dt><dd>{time(view.attempt.receivedAt)}</dd></div> : null}
    </dl>
    <p className={styles.note}>현재 브라우저 세션의 조회 기록입니다. 계정 식별자는 이 응답에 없습니다. 저장된 회의 확인은 읽기만 하며, 요청을 다시 생성하지 않습니다.</p>
    <p className={styles.note}>아래 확인 버튼으로 다시 조회할 수 있습니다. 조회 실패나 일부 기록에 요청이 없는 것만으로 완료·실패를 판정하지 않습니다.</p>
  </details>;
}
