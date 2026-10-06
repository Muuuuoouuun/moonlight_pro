'use client';
import React from 'react';
import { OFFICE_ROSTER } from '@com-moon/agent-contracts/office';
import { OFFICE_AUTO_LIMITS, OFFICE_WORK_KINDS, officeAutoStep } from '@com-moon/agent-contracts/office-harness';
import { Button, CertaintyBadge, CheckboxRow, Drawer, LifecycleBadge, SelectField, Skeleton, TruthBadge } from './hub-primitives';
import { officeBreakdowns } from './office-breakdown-session';
import styles from './office-breakdown-drawer.module.css';

const personName = id => OFFICE_ROSTER.find(person => person.id === id)?.name || id;
const SCOPE = { classin: '회사', personal: '개인' };
const EXIT = { office: '오피스 답으로 끝남', task: '내가 할 행동 · 할 일 연결', skill_request: 'Mac 실행 · 스킬 요청서' };
const OWNER_OPTIONS = OFFICE_ROSTER.map(person => ({ value: person.id, label: `${person.name} · ${person.role}` }));

// Packet states read as lifecycle, never color (DESIGN §5.3): ready=open circle, waiting=pause + named dependency.
function PacketState({ packet, state, marks, auto }) {
  if (state === 'waiting') return <LifecycleBadge state="waiting" label="대기" reason={packet.dependsOn.filter(key => marks[key] !== 'done').join(', ') + ' 먼저'} />;
  if (state === 'done') return <LifecycleBadge state="done" label={auto ? '자동 완료' : '완료'} />;
  if (state === 'skipped') return <LifecycleBadge state="cancelled" label="건너뜀" />;
  return <LifecycleBadge state="queued" label="열 수 있음" />;
}

function Packet({ packet, entry, state, busy, onOpen, onMark, scope }) {
  const [withReviewers, setWithReviewers] = React.useState(false);
  const applied = entry.status === 'applied';
  const opened = entry.opened?.key === packet.key;
  const closed = state === 'done' || state === 'skipped';
  return <li className={styles.packet} data-opened={opened ? 'true' : 'false'}>
    <div className={styles.packetMeta}>
      <span className={`mono ${styles.packetKey}`}>{packet.key}</span>
      <strong>{OFFICE_WORK_KINDS[packet.kind].label}</strong>
      {applied ? <PacketState packet={packet} state={state} marks={entry.marks} auto={Boolean(entry.autoMarks?.[packet.key])} /> : null}
      {entry.auto?.state === 'running' && entry.auto.current === packet.key ? <LifecycleBadge state="active" label="자동 진행 중" /> : null}
      <span>{SCOPE[packet.scope]}</span>
      <span>{EXIT[packet.exit]}</span>
    </div>
    <p className={styles.packetAsk}>{packet.ask}</p>
    <details className={styles.details}><summary>납품물·완료 조건·선행</summary><dl>
      <dt>납품물</dt><dd>{packet.deliverable}</dd>
      <dt>완료 조건</dt><dd>{packet.doneWhen}</dd>
      <dt>필요 자료</dt><dd>{packet.inputs.length ? packet.inputs.join(' · ') : '없음'}</dd>
      <dt>선행</dt><dd>{packet.dependsOn.length ? packet.dependsOn.join(', ') : '없음'}</dd>
      <dt>검토 관점</dt><dd>{packet.reviewerIds.length ? packet.reviewerIds.map(personName).join(' · ') : '없음'}</dd>
    </dl></details>
    <SelectField label={`${packet.key} 담당${packet.ownerSource === 'operator' ? ' · 직접 지정' : ''}`} value={packet.ownerId} options={OWNER_OPTIONS}
      disabled={busy || closed} onChange={event => officeBreakdowns.setOwner(scope, packet.key, event.target.value)} />
    {applied ? <>
      {packet.reviewerIds.length && !closed ? <CheckboxRow text={`관점 비교로 열기 · ${[packet.ownerId, ...packet.reviewerIds].map(personName).join(' · ')}`} checked={withReviewers} disabled={busy} onChange={() => setWithReviewers(value => !value)} /> : null}
      <div className={styles.actions}>
        {!closed ? <Button variant={state === 'ready' ? 'primary' : 'outline'} size="sm" disabled={busy} onClick={() => onOpen(packet.key, withReviewers)}>{state === 'waiting' ? '선행 없이 열기' : '이 조각 열기'}</Button> : null}
        {state !== 'done' ? <Button variant="outline" size="sm" disabled={busy} onClick={() => onMark(packet.key, 'done')}>완료로 표시</Button> : null}
        {!closed ? <Button variant="ghost" size="sm" disabled={busy} onClick={() => onMark(packet.key, 'skipped')}>건너뛰기</Button> : null}
        {closed ? <Button variant="ghost" size="sm" disabled={busy} onClick={() => onMark(packet.key, null)}>되돌리기</Button> : null}
      </div>
      {opened ? <p className={styles.copyNote}>열어 둠 · 입력창의 내용을 보내고 결과가 나오면 완료로 표시하세요. 그때 마지막 결과가 다음 조각용 사본으로 남습니다.</p> : null}
      {entry.priors[packet.key] ? <p className={styles.copyNote}>결과 사본 저장됨 · 다음 조각에 1,500자까지 넘깁니다. 되돌리면 지워집니다.</p> : null}
    </> : null}
  </li>;
}

// 자동 진행 안내: 무엇이 돌고 어디서 서는지 시작 전에 말한다.
function AutoPanel({ entry, busy, autoRunning, autoStopText, onStartAuto, onStopAuto }) {
  const next = officeAutoStep(entry.breakdown, entry.marks);
  const officeCount = entry.breakdown.packets.filter(packet => packet.exit === 'office').length;
  if (!officeCount) return null;
  return <div className={styles.auto}>
    <div className={styles.head}><strong>자동 진행</strong>{autoRunning ? <LifecycleBadge state="active" label={`진행 중 · ${entry.auto.current || '준비'}`} /> : null}</div>
    <p className={styles.muted}>오피스 답으로 끝나는 조각을 순서대로 담당 혼자 답하게 하고, 결과를 다음 조각에 넘깁니다. 조각당 모델 호출 {OFFICE_AUTO_LIMITS.modelCallsPerRun}회, 이번 나누기에서 최대 {Math.min(officeCount, OFFICE_AUTO_LIMITS.runs)}조각. 직접 할 조각·스킬 조각·실패·멈추기에서 섭니다. 할 일을 만들거나 밖으로 보내지 않습니다.</p>
    {autoStopText && !autoRunning ? <p role="status">{autoStopText}</p> : null}
    <div className={styles.actions}>
      {autoRunning ? <Button variant="outline" size="sm" onClick={onStopAuto}>멈추기</Button>
        : next.action === 'run' ? <Button variant="primary" size="sm" disabled={busy} onClick={onStartAuto}>{entry.auto?.state === 'stopped' ? '자동 진행 다시 시작' : '오피스 조각 자동 진행'}</Button>
        : <span className={styles.muted}>지금 자동으로 이어 갈 조각이 없습니다.</span>}
    </div>
  </div>;
}

export function OfficeBreakdownDrawer({ scope, entry, states, busy, autoRunning = false, autoStopText = '', onClose, onRetry, onOpen, onMark, onStartAuto, onStopAuto }) {
  const breakdown = entry?.breakdown;
  const single = entry?.status === 'recommended' && breakdown?.packets.length === 1;
  const hasOfficePacket = Boolean(breakdown?.packets.some(packet => packet.exit === 'office'));
  const footer = entry?.status === 'recommended' ? <>
    {single ? <Button variant="primary" onClick={() => { officeBreakdowns.apply(scope); onOpen('p1', false); }}>{personName(breakdown.packets[0].ownerId)}에게 바로 열기</Button>
      : <><Button variant="primary" onClick={() => officeBreakdowns.apply(scope)}>적용</Button>
        {hasOfficePacket ? <Button variant="outline" disabled={busy} onClick={() => { officeBreakdowns.apply(scope); onStartAuto(); }}>적용하고 자동 진행</Button> : null}</>}
    <Button variant="ghost" onClick={() => { officeBreakdowns.discard(scope); onClose(); }}>무시</Button>
  </> : entry?.status === 'applied' ? <>
    <Button variant="outline" onClick={onClose}>닫기</Button>
    <Button variant="ghost" onClick={() => { officeBreakdowns.discard(scope); onClose(); }}>나누기 지우기</Button>
  </> : null;
  return <Drawer title="업무 나누기" subtitle="이브이 추천입니다. 적용해도 아무것도 실행되지 않고, 조각은 하나씩 직접 엽니다." onClose={onClose} width="min(480px, 94vw)" footer={footer}>
    <div className={styles.body} role={entry?.status === 'error' ? 'alert' : 'status'}>
      {!entry || entry.status === 'loading' ? <><strong>안건 복사본을 업무 조각으로 나누는 중</strong><Skeleton lines={4} label="업무 나누기 확인 중" /></> : null}
      {['preview', 'error'].includes(entry?.status) ? <><div className={styles.head}><TruthBadge state={entry.status} /></div><p>{entry.error}</p>
        <div className={styles.actions}>{entry.request ? <Button variant="outline" size="sm" onClick={onRetry}>다시 나누기</Button> : null}<Button variant="ghost" size="sm" onClick={onClose}>닫기</Button></div></> : null}
      {breakdown && ['recommended', 'applied'].includes(entry.status) ? <>
        <div className={styles.head}><strong>{single ? '나누지 않아도 됩니다' : `업무 조각 ${breakdown.packets.length}개`}</strong>
          {entry.status === 'recommended' ? <CertaintyBadge state="recommended" /> : <span className={styles.muted}>적용됨 · 이 브라우저 세션에만 남습니다</span>}</div>
        <p>{breakdown.summary}</p>
        {breakdown.decisionNeeded ? <p className={styles.decision}>정할 것 · {breakdown.decisionNeeded}</p> : null}
        {entry.status === 'applied' ? <AutoPanel entry={entry} busy={busy} autoRunning={autoRunning} autoStopText={autoStopText} onStartAuto={onStartAuto} onStopAuto={onStopAuto} /> : null}
        <ol className={styles.packets}>{breakdown.packets.map(packet => <Packet key={packet.key} packet={packet} entry={entry} state={states[packet.key]} busy={busy} onOpen={onOpen} onMark={onMark} scope={scope} />)}</ol>
        {breakdown.holds.length || breakdown.questions.length ? <div className={styles.lists}>
          {breakdown.holds.length ? <><strong>이번에 하지 않을 것</strong><ul>{breakdown.holds.map((text, index) => <li key={index}>{text}</li>)}</ul></> : null}
          {breakdown.questions.length ? <><strong>결론을 바꿀 확인 질문</strong><ul>{breakdown.questions.map((text, index) => <li key={index}>{text}</li>)}</ul></> : null}
        </div> : null}
      </> : null}
    </div>
  </Drawer>;
}
