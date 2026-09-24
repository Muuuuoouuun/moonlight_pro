'use client';
import React from 'react';
import { OFFICE_FAILURE_LABELS, OFFICE_ROSTER, officeDiscussionRounds } from '@com-moon/agent-contracts/office';
import { parseOfficeRoutingRequest, parseOfficeRoutingResult } from '@com-moon/agent-contracts/office-routing';
import { Button, CheckboxRow, Drawer, EmptyState, SegmentedControl, Skeleton, TextAreaField, TextField, TruthBadge, CertaintyBadge } from '../hub-primitives';
import { requestOffice } from '../office-client';
import { copyOfficeText, loadOfficeTasks, officeMessageLength, officeTaskAgendaBlock, officeTasksForScope, shouldSubmitOfficeKey } from '../office-session';
import { useOfficeSession } from '../office-session-provider';
import { OfficeDeliberationControls } from '../office-deliberation-controls';
import { officeDiscussionState } from '../office-deliberation-client';
import { officeSkillRequestDraft } from '../office-skill-request';
import { OfficeSkillRequestDrawer } from '../office-skill-request-drawer';
import styles from './office-council.module.css';

const MODES = [{ key: 'chat', label: '대화' }, { key: 'draft', label: '초안' }, { key: 'review', label: '검토' }, { key: 'council', label: '회의' }];
const SCOPE_LABEL = { all: '전체', classin: '회사', personal: '개인' };
const COMPARISON_PRESETS = [
  { id: 'customer', label: '고객 제안 검토', ownerId: 'flareon', reviewerId: 'umbreon', hint: '최근 고객 발언과 제안안을 넣어 주세요. 지원·수치 약속의 근거를 함께 살펴봅니다.' },
  { id: 'build', label: '기능·구현 검토', ownerId: 'glaceon', reviewerId: 'jolteon', hint: '만들 기능과 사용 장면, 제약을 적어 주세요. 최소 흐름과 확인할 조건을 정리합니다.' },
  { id: 'resources', label: '돈·시간 비교', ownerId: 'espeon', reviewerId: 'leafeon', hint: '대안과 비용, 설정·유지에 드는 시간을 적어 주세요. 선택할 이유와 포기할 것을 비교합니다.' },
  { id: 'weekly', label: '이번 주 정리', ownerId: 'vaporeon', reviewerId: 'eevee', hint: '이번 주 기록과 다음 주 약속을 적어 주세요. 끝낸 일과 남길 행동을 구분합니다.' },
];
const personName = id => OFFICE_ROSTER.find(person => person.id === id)?.name || id;
const personRole = id => OFFICE_ROSTER.find(person => person.id === id)?.role || '';

function RequestMessage({ message }) {
  const [expanded, setExpanded] = React.useState(false);
  const long = message.length > 160 || message.split('\n').length > 3;
  return <div className={styles.userMessage}><strong>나</strong><p className={long && !expanded ? styles.requestClamped : undefined}>{message}</p>
    {long ? <Button size="xs" variant="ghost" onClick={() => setExpanded(value => !value)} aria-expanded={expanded}>{expanded ? '원문 접기' : '원문 펼치기'}</Button> : null}</div>;
}

function ThreadDiscussion({ result, request }) {
  const { state, discussion } = officeDiscussionState(result, request);
  if (state === 'none') return null;
  if (state === 'legacy') return <p className={styles.note}>이전 관점 시뮬레이션 · 역할별 발언 기록 없음</p>;
  if (state === 'invalid') return <p className={styles.note} role="status">토론 기록 확인 필요 · 역할별 기록을 확인하지 못했습니다.</p>;
  return <div className={styles.discussion}><p className={styles.note}>같은 모델의 역할별 개별 검토 · 모델 호출 <span className="mono">{discussion.modelCalls}</span>회</p>
    <ol className={styles.speeches}>{discussion.turns.map((speech, index) => <li key={speech.ownerId + speech.round + index} className={styles.speech}>
      <div className={styles.speechHeader}><strong>{personName(speech.ownerId)}</strong><span>{personRole(speech.ownerId)}</span><span>{speech.round === 'position' ? '첫 의견' : '상호 검토 · ' + (speech.changed ? '관점 수정' : '판단 유지')}</span></div>
      <p className={styles.speechBody}>{speech.position}</p>
      <div className={styles.speechMeta}>근거 {speech.evidence[0] || '제공 없음'} · 반론 {speech.objection || '없음'} · 판단 조건 {speech.revisionCondition}</div>
      <details className={styles.speechDetails}><summary>발언 근거와 판단 조건</summary><dl>
        <div><dt>근거</dt><dd>{speech.evidence.length ? speech.evidence.join(' · ') : '제공된 근거 없음'}</dd></div>
        <div><dt>반론</dt><dd>{speech.objection || '기록된 반론 없음'}</dd></div>
        <div><dt>판단을 바꿀 조건</dt><dd>{speech.revisionCondition}</dd></div>
        {speech.round === 'response' ? <><div><dt>답한 관점</dt><dd>{speech.replyTo.map(personName).join(' · ')}</dd></div><div><dt>{speech.changed ? '수정 이유' : '유지 이유'}</dt><dd>{speech.changeReason}</dd></div></> : null}
      </dl></details>
    </li>)}</ol>
  </div>;
}

function ResultTurn({ turn, onRevise, onCopy, onSkill, skillAvailable, copyStatus, latestRef }) {
  const result = turn.result;
  const owner = OFFICE_ROSTER.find(person => person.id === result.ownerId);
  return <article className={styles.turn} ref={latestRef}>
    <RequestMessage message={turn.message} />
    <ThreadDiscussion result={result} request={turn.request} />
    <div className={styles.summary}>
      <div className={styles.answerHeader}><strong>종합 · {owner?.name || 'Office'}</strong><span>{SCOPE_LABEL[result.scope]} · {MODES.find(item => item.key === result.mode)?.label}</span>
        <CertaintyBadge state="recommended" />{result.sourceCheck === 'untraced' ? <CertaintyBadge state="unknown" label="근거 확인 안 됨" /> : null}</div>
      <div className={styles.answer}>{result.answer}</div>
      <div className={styles.answerActions}><Button variant="outline" size="sm" onClick={() => onCopy(result.answer, turn.id)}>답변 복사</Button>
        <Button variant="ghost" size="sm" onClick={() => onRevise(result)}>수정 요청</Button>
        {copyStatus?.id === turn.id ? <span role={copyStatus.ok ? 'status' : 'alert'} className={styles.note}>{copyStatus.ok ? '복사했습니다.' : '복사하지 못했습니다. 본문을 선택해 복사해 주세요.'}</span> : null}</div>
      {result.recommendation ? <details className={styles.decision}><summary>추천 근거와 남은 이견</summary>
        {result.recommendation.trim() !== result.answer.trim() ? <><strong>주관 추천</strong><p>{result.recommendation}</p></> : null}
        <strong>근거</strong><ul>{result.evidence.length ? result.evidence.map((text, index) => <li key={index}>{text}</li>) : <li>제공된 근거 없음</li>}</ul>
        <strong>남은 이견</strong><ul>{result.dissent.length ? result.dissent.map((text, index) => <li key={index}>{text}</li>) : <li>기록된 이견 없음</li>}</ul>
      </details> : null}
      <div className={styles.next}><strong>다음 행동</strong><p>{result.nextAction}</p></div>
      <div className={styles.receipt}><span>{result.log?.persisted === true ? '호출 로그 저장됨' : '답변 생성됨 · 호출 로그 미저장'}</span><span>업무 변경 없음</span></div>
      {skillAvailable ? <details className={styles.request}><summary>더보기</summary><div className={styles.answerActions}>
        <Button variant="outline" size="sm" onClick={() => onSkill(turn)}>로컬 스킬 요청서</Button>
      </div></details> : null}
      {result.context?.source && result.context.source !== 'provided' ? <div className={styles.contextState}><TruthBadge state={result.context.source} /></div> : null}
      <p className={styles.note}>{result.context?.note}</p>
      {result.context?.projects?.length ? <details className={styles.request}><summary>참고한 프로젝트 ({result.context.projects.length})</summary><ul className={styles.note}>{result.context.projects.map(project => <li key={project.id}>{project.name} · {project.status}</li>)}</ul></details> : null}
    </div>
  </article>;
}

function PendingTurn({ pending }) {
  const request = pending.request;
  const rounds = request.mode === 'council' ? officeDiscussionRounds(request.deliberation) : 0;
  const order = request.mode === 'council'
    ? Array.from({ length: rounds }, (_, round) => request.participants.map(id => personName(id) + (round ? ' 상호 검토' : ' 첫 의견'))).flat()
    : [personName(request.ownerId) + ' 답변'];
  return <div className={styles.pending}><RequestMessage message={pending.rawDraft.trim()} /><div><strong>순서 예고</strong><p className={styles.note}>{[...order, '종합'].join(' → ')}</p></div>
    <Skeleton lines={Math.min(order.length + 1, 4)} label="Office 응답 대기 중" /></div>;
}

// 2026-09-23 운영자 확정: 최근 7일 요청·할 일 연결·평균 지연·실패 원인을 한 줄로.
function OfficeUsageLine({ refreshKey }) {
  const [usage, setUsage] = React.useState(null);
  const load = React.useCallback(() => {
    setUsage(null);
    fetch('/api/hub/office/usage', { cache: 'no-store' }).then(res => res.json()).then(setUsage).catch(() => setUsage({ status: 'error' }));
  }, []);
  React.useEffect(() => { load(); }, [load, refreshKey]);
  if (!usage) return <div className={styles.usage}><Skeleton lines={1} label="최근 7일 사용 기록 확인 중" style={{ flex: '1 1 240px', maxWidth: 320 }} /></div>;
  if (usage.status === 'preview') return <p className={styles.usage}><TruthBadge state="preview" /> 사용 기록은 저장 연결 후 표시됩니다.</p>;
  if (usage.status !== 'live') return <p className={styles.usage}><TruthBadge state="error" /> 사용 기록을 읽지 못했습니다. <Button size="xs" variant="ghost" onClick={load}>다시 확인</Button></p>;
  const failures = Object.entries(usage.failureCategories || {}).map(([key, n]) => (OFFICE_FAILURE_LABELS[key] || key) + ' ' + n).join(' · ');
  return <p className={styles.usage}>최근 <span className="mono">{usage.windowDays}</span>일 · 요청 <span className="mono">{usage.requests}</span> · 할 일 연결 <span className="mono">{usage.applied}</span>
    {usage.averageElapsedMs != null ? <> · 평균 <span className="mono">{Math.round(usage.averageElapsedMs / 1000)}</span>초</> : null}
    {' · '}실패 <span className="mono">{usage.failed}</span>{failures ? ' (' + failures + ')' : ''}</p>;
}

export function OfficeCouncil({ scope = 'all' }) {
  const { session, store, update } = useOfficeSession(scope);
  const { ownerId, mode, reviewers, includeProjects, minimumOnly } = session;
  const [rosterOpen, setRosterOpen] = React.useState(false);
  const [moreOpen, setMoreOpen] = React.useState(false);
  const [tasksOpen, setTasksOpen] = React.useState(false);
  const [taskState, setTaskState] = React.useState({ status: 'loading', tasks: [] });
  const [taskQuery, setTaskQuery] = React.useState('');
  const [followUpMode, setFollowUpMode] = React.useState('chat');
  const [copyStatus, setCopyStatus] = React.useState(null);
  const [inputNotice, setInputNotice] = React.useState('');
  const [assignment, setAssignment] = React.useState(null);
  const [skillTurn, setSkillTurn] = React.useState(null);
  const inputRef = React.useRef(null);
  const threadRef = React.useRef(null);
  const latestTurnRef = React.useRef(null);
  const pendingRef = React.useRef(null);
  const taskReadRef = React.useRef(0);
  const assignmentReadRef = React.useRef(0);
  const composing = React.useRef(false);
  const busy = Boolean(session.pending);
  const owner = OFFICE_ROSTER.find(person => person.id === ownerId) || OFFICE_ROSTER[0];
  const participants = mode === 'council' ? [ownerId, ...reviewers] : [];
  const preset = COMPARISON_PRESETS.find(item => item.id === session.presetId);
  const assignmentMessage = (session.agenda?.block || session.draft).trim();
  const tooLong = officeMessageLength(session) > 6000;
  const visibleTasks = officeTasksForScope(taskState.tasks, scope).filter(task => task.title?.toLocaleLowerCase('ko-KR').includes(taskQuery.toLocaleLowerCase('ko-KR')));
  const unassignedCount = taskState.tasks.filter(task => task.status !== 'done' && !task.workspace).length;
  React.useEffect(() => {
    assignmentReadRef.current += 1;
    setAssignment(null); setRosterOpen(false); setMoreOpen(false); setTasksOpen(false);
    setCopyStatus(null); setInputNotice(''); setFollowUpMode('chat'); setSkillTurn(null);
  }, [scope]);

  function invalidateAssignment() {
    assignmentReadRef.current += 1;
    setAssignment(null);
  }

  async function requestAssignment() {
    if (busy || assignment?.status === 'loading') return;
    const message = assignmentMessage;
    let request;
    try { request = parseOfficeRoutingRequest({ message, scope }); }
    catch { setAssignment({ status: 'error', error: '먼저 안건을 입력해 주세요. 담당자는 직접 고를 수도 있습니다.' }); return; }
    const readId = ++assignmentReadRef.current;
    setMoreOpen(false);
    setAssignment({ status: 'loading' });
    try {
      const response = await fetch('/api/hub/office/assignment', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(request), cache: 'no-store',
      });
      const body = await response.json().catch(() => null);
      if (readId !== assignmentReadRef.current) return;
      if (body?.status === 'preview') {
        setAssignment({ status: 'preview', error: body.error || 'Office Engine 연결이 필요합니다. 담당자를 직접 선택해 주세요.' });
        return;
      }
      if (!response.ok || body?.status !== 'recommended' || body.businessWrites !== false) throw new Error('invalid-assignment');
      const recommendation = parseOfficeRoutingResult({
        status: body.status, version: body.version, ownerId: body.ownerId,
        reviewerIds: body.reviewerIds, reason: body.reason, scope: body.scope,
      }, request);
      setAssignment(recommendation);
    } catch {
      if (readId === assignmentReadRef.current) setAssignment({ status: 'error', error: '담당 추천을 확인하지 못했습니다. 담당자를 직접 선택해 주세요.' });
    }
  }

  function applyAssignment() {
    if (assignment?.status !== 'recommended') return;
    update({ ownerId: assignment.ownerId, reviewers: assignment.reviewerIds, presetId: null });
    invalidateAssignment();
  }

  function editAssignment() {
    invalidateAssignment();
    setRosterOpen(true);
  }

  const scrollToLatest = React.useCallback(target => requestAnimationFrame(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    threadRef.current?.focus({ preventScroll: true });
    target.current?.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
  }), []);
  const loadTasks = () => {
    const readId = ++taskReadRef.current;
    setTaskState({ status: 'loading', tasks: [] });
    loadOfficeTasks().then(result => { if (readId === taskReadRef.current) setTaskState(result); });
  };
  const openTasks = () => { setTaskQuery(''); setTasksOpen(true); loadTasks(); };
  function selectPreset(selected) {
    invalidateAssignment();
    update({ ownerId: selected.ownerId, mode: 'council', reviewers: [selected.reviewerId], presetId: selected.id });
    setMoreOpen(false);
  }
  function importTask(task) {
    if (session.turns.length && !window.confirm('현재 회의를 비우고 새 안건을 올릴까요?')) return;
    if (session.turns.length) store.reset(scope);
    invalidateAssignment();
    setSkillTurn(null);
    const block = officeTaskAgendaBlock(task);
    const previous = session.turns.length ? '' : session.agenda?.source === 'task' && session.draft.startsWith(session.agenda.block)
      ? session.draft.slice(session.agenda.block.length).trimStart() : session.draft.trimStart();
    update({ agenda: { title: task.title, source: 'task', taskId: task.id, taskWorkspace: task.workspace, importedAt: new Date().toISOString(), block }, draft: previous ? block + '\n\n' + previous : block });
    setTasksOpen(false); setFollowUpMode('chat');
    requestAnimationFrame(() => inputRef.current?.focus());
  }
  function newAgenda() {
    if (busy || !window.confirm('현재 회의와 입력을 비우고 새 안건을 시작할까요?')) return;
    invalidateAssignment();
    setSkillTurn(null);
    store.reset(scope); setFollowUpMode('chat');
    requestAnimationFrame(() => inputRef.current?.focus());
  }
  async function submit(event) {
    event.preventDefault();
    if (composing.current || tooLong) return;
    const override = session.turns.length && followUpMode === 'chat' ? { mode: 'chat' } : undefined;
    const pending = store.begin(scope, crypto.randomUUID(), override);
    if (!pending) return;
    invalidateAssignment();
    setInputNotice('');
    scrollToLatest(pendingRef);
    const result = await requestOffice(pending.request);
    store.complete(scope, pending.id, result);
    if (result.status === 'generated') scrollToLatest(latestTurnRef);
  }
  async function copy(text, id) { setCopyStatus({ id, ok: await copyOfficeText(text, navigator.clipboard) }); }
  function revise(result) {
    invalidateAssignment();
    if (!busy) update({ ownerId: result.ownerId, mode: result.mode,
      reviewers: result.mode === 'council' ? result.participants.filter(id => id !== result.ownerId) : [],
      ...(result.mode === 'council' ? { deliberation: result.discussion?.settings } : {}), presetId: null });
    setFollowUpMode(result.mode === 'council' ? 'council' : 'chat');
    inputRef.current?.focus();
  }
  function handlePaste(event) {
    if (Array.from(event.clipboardData?.items || []).some(item => item.kind === 'file')) {
      event.preventDefault(); setInputNotice('이미지·파일은 아직 읽지 못합니다 · 텍스트로 붙여 넣어 주세요');
    }
  }
  function handleDrop(event) {
    event.preventDefault();
    if (event.dataTransfer?.files?.length) { setInputNotice('이미지·파일은 아직 읽지 못합니다 · 텍스트로 붙여 넣어 주세요'); return; }
    const text = event.dataTransfer?.getData('text/plain');
    if (!text) return;
    invalidateAssignment();
    const field = event.currentTarget, start = field.selectionStart ?? session.draft.length, end = field.selectionEnd ?? start;
    update({ draft: session.draft.slice(0, start) + text + session.draft.slice(end) }); setInputNotice('');
    requestAnimationFrame(() => { field.focus(); field.setSelectionRange(start + text.length, start + text.length); });
  }
  const agenda = session.agenda;
  const importedAt = agenda?.importedAt ? new Date(agenda.importedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }) : '';
  const followUpCouncil = session.turns.length > 0 && followUpMode === 'council' && reviewers.length > 0;
  return <section className={styles.page + ' fade-up'}>
    <header className={styles.header}><div><div className={styles.eyebrow}>AGENTS / OFFICE</div><h2>이브이 오피스</h2><p>안건 하나를 올리고, 필요한 관점을 불러 함께 검토하세요.</p></div><span className={styles.scope}>{SCOPE_LABEL[scope]} 업무</span></header>
    <div className={styles.main}>
      <div className={styles.agendaBar}>{agenda ? <>
        <div className={styles.agendaMain}><strong title={agenda.title}>안건: {agenda.title}</strong><span className={styles.sourceChip}>{agenda.source === 'task' ? '할 일에서 가져옴 · 복사본 · ' + importedAt : '직접 입력'}</span><span className={styles.mobileCount}>참석 {1 + reviewers.length}명</span></div>
        <div className={styles.agendaTools}><span className={styles.attendees}>참석: {personName(ownerId)}{reviewers.map(id => ' · ' + personName(id)).join('')}</span>
          <Button variant="ghost" size="sm" disabled={busy || !assignmentMessage} onClick={requestAssignment}>담당 추천</Button>
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => setMoreOpen(true)}>더보기</Button>
          <Button variant="ghost" size="sm" disabled={busy} onClick={newAgenda}>새 안건</Button></div></>
        : <><p>안건을 올리세요 · 할 일을 가져오거나 직접 적어 주세요</p><Button variant="ghost" size="sm" onClick={() => setMoreOpen(true)}>더보기</Button></>}</div>
      <div className={styles.thread} ref={threadRef} tabIndex={-1} aria-live="polite" aria-label="Office 요청 결과">
        {session.turns.length === 0 && !busy ? <EmptyState icon="chat" title="회의할 안건을 올려 주세요" description="아래 안건 가져오기로 할 일을 넣거나 직접 적어 주세요." /> : null}
        {session.turns.map((turn, index) => <ResultTurn key={turn.id} turn={turn} latestRef={index === session.turns.length - 1 ? latestTurnRef : undefined}
          onRevise={revise} onCopy={copy} onSkill={setSkillTurn} skillAvailable={Boolean(officeSkillRequestDraft({ agenda: session.agenda, officeScope: scope, result: turn.result }))} copyStatus={copyStatus} />)}
        {busy ? <div ref={pendingRef}><PendingTurn pending={session.pending} /></div> : null}
      </div>
      <form onSubmit={submit} className={styles.composer} aria-busy={busy}>
        <div className={styles.composerTop}><Button variant="outline" size="sm" disabled={busy} onClick={openTasks}>안건 가져오기</Button>
          {!agenda ? <Button variant="ghost" size="sm" disabled={busy} onClick={() => setRosterOpen(true)}>참석: {personName(ownerId)}{reviewers.length ? ' +' + reviewers.length : ''}</Button> : null}
          {session.turns.length > 0 ? <div className={styles.followUp}><SegmentedControl label="이어서 묻기 대상" options={[{ key: 'chat', label: '주관에게' }, { key: 'council', label: '다시 회의' }]} value={followUpMode} onChange={setFollowUpMode} />
            {followUpCouncil ? <span className={styles.note}>역할 {participants.length}명 · 발언 {officeDiscussionRounds(session.deliberation)}단계</span> : null}</div> : null}
        </div>
        <TextAreaField ref={inputRef} label={session.turns.length ? '이어서 묻기' : '안건 또는 질문'} value={session.draft} onChange={event => { invalidateAssignment(); update({ draft: event.target.value }); }}
          maxLength={6000} rows={2} autoResize disabled={busy} className={styles.input}
          error={tooLong ? '안건과 최소 업무 지침을 포함해 6,000자 안으로 줄여 주세요.' : null}
          onPaste={handlePaste} onDrop={handleDrop} onDragOver={event => { if (event.dataTransfer?.types?.includes('text/plain') || event.dataTransfer?.types?.includes('Files')) event.preventDefault(); }}
          onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }}
          onKeyDown={event => { if (!composing.current && shouldSubmitOfficeKey(event)) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }}
          placeholder={preset?.hint || '막힌 일이나 판단할 내용을 적어 주세요. 텍스트를 붙여 넣어도 됩니다.'} />
        {inputNotice ? <p role="status" className={styles.note}>{inputNotice}</p> : null}
        {session.error ? <div role={session.error.status === 'error' ? 'alert' : 'status'} className={styles.notice + (session.error.status === 'error' ? ' ' + styles.error : '')}><TruthBadge state={session.error.status === 'preview' ? 'preview' : 'error'} /><p>{session.error.error}</p></div> : null}
        <div className={styles.actions}><span className={styles.note}>{busy ? '응답을 기다리는 중입니다. 다른 화면으로 이동해도 이 세션에서 이어집니다.' : '⌘/Ctrl + Enter · 답변은 업무를 변경하지 않습니다.'}</span>
          <Button type="submit" variant="primary" disabled={busy || !session.draft.trim() || tooLong || (followUpMode === 'council' && !reviewers.length)}>{busy ? '작성 중…' : session.turns.length ? '보내기' : mode === 'council' ? '회의 시작' : '보내기'}</Button></div>
      </form>
    </div>
    <p className={styles.sessionNote}>범위를 바꾸면 해당 범위의 입력과 대화를 엽니다. 새로고침·탭 종료 시 자유 요청의 미전송 원문과 답변은 사라집니다.</p>
    <OfficeUsageLine refreshKey={session.turns.length} />
    {assignment ? <Drawer title="이브이 담당 추천" subtitle="추천은 선택 사항입니다. 적용 전까지 참석자는 바뀌지 않습니다." onClose={invalidateAssignment} width="min(440px, 94vw)">
      <div className={styles.assignmentCard} role={assignment.status === 'error' ? 'alert' : 'status'}>
        {assignment.status === 'loading' ? <><strong>안건 복사본을 읽고 담당을 추천하는 중</strong><Skeleton lines={2} label="이브이 담당 추천 확인 중" /><Button variant="ghost" size="sm" onClick={editAssignment}>직접 선택</Button></> : null}
        {assignment.status === 'recommended' ? <>
          <div className={styles.assignmentHead}><strong>추천 참석자</strong><CertaintyBadge state="recommended" /></div>
          <p>범위 · {SCOPE_LABEL[assignment.scope]}</p>
          <p>주관 · {personName(assignment.ownerId)}</p>
          <p>함께 볼 관점 · {assignment.reviewerIds.length ? assignment.reviewerIds.map(personName).join(' · ') : '없음'}</p>
          <p className={styles.assignmentReason}>{assignment.reason}</p>
          <div className={styles.assignmentActions}><Button variant="primary" size="sm" onClick={applyAssignment}>적용</Button><Button variant="outline" size="sm" onClick={editAssignment}>수정</Button><Button variant="ghost" size="sm" onClick={invalidateAssignment}>무시</Button></div>
        </> : null}
        {['preview', 'error'].includes(assignment.status) ? <><TruthBadge state={assignment.status} /><p>{assignment.error}</p>
          <div className={styles.assignmentActions}><Button variant="outline" size="sm" onClick={editAssignment}>직접 선택</Button><Button variant="ghost" size="sm" onClick={invalidateAssignment}>닫기</Button></div></> : null}
      </div>
    </Drawer> : null}
    {skillTurn ? <OfficeSkillRequestDrawer key={skillTurn.id} agenda={session.agenda} officeScope={scope} result={skillTurn.result} onClose={() => setSkillTurn(null)} /> : null}
    {rosterOpen ? <Drawer title="참석자 바꾸기" subtitle="주관 한 명과 관점 최대 두 명을 고르세요." onClose={() => setRosterOpen(false)} width="min(480px, 94vw)" footer={<Button variant="primary" onClick={() => setRosterOpen(false)}>완료</Button>}>
      <div className={styles.roster}><strong>주관</strong>{OFFICE_ROSTER.map(person => <button type="button" key={person.id} className={'hub-row ' + styles.member} aria-pressed={person.id === ownerId} onClick={() => { invalidateAssignment(); update({ ownerId: person.id, reviewers: reviewers.filter(id => id !== person.id), presetId: null }); }}>
        <span><strong>{person.name} <small>{person.role}</small></strong><span className={styles.memberPitch}>{person.pitch}</span></span></button>)}
        <strong>함께 볼 관점</strong>{['draft', 'review'].includes(mode) ? <p className={styles.note}>초안·검토는 주관 혼자 씁니다. 더보기에서 대화로 바꾸면 관점을 추가할 수 있습니다.</p> : null}
        <div className={styles.views}>{OFFICE_ROSTER.filter(person => person.id !== ownerId).map(person => <CheckboxRow key={person.id} text={person.name + ' · ' + person.role} checked={reviewers.includes(person.id)}
          disabled={busy || ['draft', 'review'].includes(mode) || (!reviewers.includes(person.id) && reviewers.length >= 2)}
          onChange={() => { invalidateAssignment(); update(current => ({ presetId: null, reviewers: current.reviewers.includes(person.id) ? current.reviewers.filter(id => id !== person.id) : [...current.reviewers, person.id] })); }} />)}</div>
      </div></Drawer> : null}
    {moreOpen ? <Drawer title="회의 설정" subtitle="필요할 때만 응답 방식과 참고 범위를 조정하세요." onClose={() => setMoreOpen(false)} width="min(480px, 94vw)">
      <div className={styles.more}><strong>응답 방식</strong>
        {assignmentMessage ? <Button variant="outline" size="sm" disabled={busy} onClick={requestAssignment}>담당 추천</Button> : null}
        <Button variant="outline" size="sm" onClick={() => { setMoreOpen(false); setRosterOpen(true); }}>참석자 바꾸기</Button>
        {agenda ? <Button variant="ghost" size="sm" onClick={() => { setMoreOpen(false); newAgenda(); }}>새 안건</Button> : null}
        {reviewers.length ? <p className={styles.note}>관점이 있어 회의로 고정됩니다. <Button variant="ghost" size="sm" onClick={() => { invalidateAssignment(); update({ reviewers: [], mode: 'chat', presetId: null }); }}>혼자 쓰기로 전환</Button></p>
          : <SegmentedControl label="Office 응답 방식" options={MODES.slice(0, 3)} value={mode} onChange={next => { invalidateAssignment(); update({ mode: next, reviewers: [], presetId: null }); }} />}
        <strong>추천 조합</strong><div className={styles.presets}>{COMPARISON_PRESETS.map(item => <Button key={item.id} variant="outline" size="sm" active={mode === 'council' && session.presetId === item.id} aria-pressed={mode === 'council' && session.presetId === item.id} onClick={() => selectPreset(item)}>{item.label}</Button>)}</div>
        {mode === 'council' ? <OfficeDeliberationControls value={session.deliberation} participants={participants} disabled={busy} onChange={deliberation => update({ deliberation })} /> : null}
        <CheckboxRow text="현재 범위의 최근 프로젝트 참고" checked={includeProjects} disabled={busy} onChange={() => update({ includeProjects: !includeProjects })} />
        <CheckboxRow text="오늘은 최소한만" checked={minimumOnly} disabled={busy} onChange={() => update({ minimumOnly: !minimumOnly })} />
        {includeProjects ? <p className={styles.note}>현재 범위의 최근 프로젝트 최대 8개를 참고합니다. 고객·일정 원장은 이 자유 요청에 자동 연결되지 않습니다.</p> : null}
        {minimumOnly ? <p className={styles.note}>이미 정한 약속을 지키는 데 필요한 내용만 요청합니다. 추가 행동이 필요 없으면 남기지 않습니다.</p> : null}
      </div></Drawer> : null}
    {tasksOpen ? <Drawer title="안건 가져오기" subtitle="할 일의 현재 텍스트를 복사해 안건으로 올립니다. 원본 할 일은 바뀌지 않습니다." onClose={() => setTasksOpen(false)} width="min(480px, 94vw)">
      <div className={styles.taskPicker}><TextField label="할 일 제목 검색" value={taskQuery} onChange={event => setTaskQuery(event.target.value)} placeholder="제목으로 찾기" />
        {taskState.status === 'loading' ? <Skeleton lines={4} label="할 일 불러오는 중" /> : null}
        {taskState.status === 'error' ? <div className={styles.notice} role="alert"><TruthBadge state="error" /><p>할 일 읽기 실패 · {taskState.error}</p><Button variant="ghost" size="sm" onClick={loadTasks}>다시 시도</Button></div> : null}
        {taskState.status === 'preview' ? <div className={styles.notice}><TruthBadge state="preview" /><p>Preview · 연결 필요</p></div> : null}
        {taskState.status === 'partial' ? <p className={styles.note}><TruthBadge state="partial" /> 일부 할 일만 확인됐습니다.</p> : null}
        {['live', 'partial'].includes(taskState.status) ? <>{visibleTasks.length ? <div className={styles.taskList}>{visibleTasks.map(task => <button type="button" key={task.id} className={'hub-row ' + styles.taskRow} onClick={() => importTask(task)}><strong>{task.title}</strong><span>{[task.nextAction, task.due || task.dueAt].filter(Boolean).join(' · ') || '다음 행동 미정'}</span></button>)}</div>
          : <EmptyState icon="check" title="이 범위에서 찾은 할 일이 없습니다" description="다른 제목을 검색하거나 전체 범위에서 확인해 주세요." />}
          {scope !== 'all' && unassignedCount ? <p className={styles.note}>범위 미정 {unassignedCount}개 · 전체 범위에서 보입니다</p> : null}</> : null}
      </div></Drawer> : null}
  </section>;
}
