'use client';
import React from 'react';
import { loadOfficeUsage } from '../office-client';
import { useRouter, useSearchParams } from 'next/navigation';
import { OFFICE_FAILURE_LABELS, OFFICE_ROSTER, officeDiscussionRounds } from '@com-moon/agent-contracts/office';
import { parseOfficeRoutingRequest, parseOfficeRoutingResult } from '@com-moon/agent-contracts/office-routing';
import { Button, CheckboxRow, Drawer, EmptyState, SectionTitle, SegmentedControl, Skeleton, TextAreaField, TextField, TruthBadge, CertaintyBadge } from '../hub-primitives';
import { applyOfficeMeetingTaskAction, readOfficeMeetingTask, listOfficeMeetings, officeMeetingHref, officeMeetingScope, readOfficeMeeting, saveOfficeMeetingSettings, sendOfficeMeeting } from '../office-meetings-client';
import { copyOfficeText, loadOfficeTasks, officeAssignmentInput, officeMessageLength, officeRailTasks, officeTaskAgendaBlock, officeTasksForScope, shouldSubmitOfficeKey } from '../office-session';
import { useOfficeSession } from '../use-office-session';
import { OfficeDeliberationControls } from '../office-deliberation-controls';
import { officeDiscussionState, officeRemainingDissent } from '../office-deliberation-client';
import { OfficeSpeechEvidence, OfficeCollaborationSummary, OfficeObjectionResolutions } from '../office-discussion-evidence';
import { officeSkillRequestDraft } from '../office-skill-request';
import { OfficeSkillRequestDrawer, OfficeSkillRequestHistory } from '../office-skill-request-drawer';
import { OfficeMentorDrawer, OfficeMentorReferenceCard } from '../office-mentor-drawer';
import { ReviewWaitingList } from '../review-waiting';
import { OfficeAvatar } from '../office-avatar';
import { officeMentorSessions } from '../office-mentor-session';
import { requestOfficeMentor } from '../office-mentor-client';
import { GuruRecommendation, guruRecommendationCard } from '../guru-recommendation';
import { matchAgendaGuidance } from '@/lib/sales-os/agenda-guidance';
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

const MODE_LABEL = key => MODES.find(item => item.key === key)?.label || key;

// V4(2026-09-26): 역할별 발언을 사람 단위 칸으로 나란히 둔다 — 한 칸 안에서는 첫 의견 → 상호 검토 순.
function ThreadDiscussion({ result, request }) {
  const { state, discussion } = officeDiscussionState(result, request);
  if (state === 'none') return null;
  if (state === 'legacy') return <p className={styles.note}>이전 관점 시뮬레이션 · 역할별 발언 기록 없음</p>;
  if (state === 'invalid') return <p className={styles.note} role="status">토론 기록 확인 필요 · 역할별 기록을 확인하지 못했습니다.</p>;
  const speakers = [...new Set(discussion.turns.map(speech => speech.ownerId))];
  const stages = new Set(discussion.turns.map(speech => speech.round)).size;
  return <div className={styles.discussion}>
    <p className={styles.laneCaption}>역할별 발언 · {stages}단계 · 같은 모델의 역할별 개별 검토 · 모델 호출 <span className="mono">{discussion.modelCalls}</span>회</p>
    <div className={styles.lanes} tabIndex={0} role="region" aria-label="역할별 발언 비교" style={{ '--lane-count': speakers.length }}>{speakers.map(speakerId => <section key={speakerId} className={styles.lane} aria-label={personName(speakerId) + ' 발언'}>
      <header className={styles.laneHeader}><OfficeAvatar agentId={speakerId} size="small" /><strong>{personName(speakerId)}</strong><span>{personRole(speakerId)}</span></header>
      <ol className={styles.speeches}>{discussion.turns.map((speech, index) => speech.ownerId !== speakerId ? null : <li key={speech.round + index} className={styles.speech}>
        <span className={styles.stageLabel}>{speech.round === 'position' ? '첫 의견' : '상호 검토 · ' + (speech.changed ? '관점 수정' : '판단 유지')}</span>
        <p className={styles.speechBody}>{speech.position}</p>
        <div className={styles.speechMeta}>판단을 바꿀 조건 · {speech.revisionCondition}</div>
        <details className={styles.speechDetails}><summary>근거와 반론</summary><dl>
          <div><dt>근거</dt><dd>{speech.evidence.length ? speech.evidence.join(' · ') : '제공된 근거 없음'}</dd></div>
          <div><dt>반론</dt><dd>{speech.objection || '기록된 반론 없음'}</dd></div>
          {speech.round === 'response' ? <><div><dt>답한 관점</dt><dd>{speech.replyTo.map(personName).join(' · ')}</dd></div><div><dt>{speech.changed ? '수정 이유' : '유지 이유'}</dt><dd>{speech.changeReason}</dd></div></> : null}
          <OfficeSpeechEvidence speech={speech} />
        </dl></details>
      </li>)}</ol>
    </section>)}</div>
  </div>;
}

function OfficeMentorAction({ turn, onOpenDrawer }) {
  const mentorSession = React.useSyncExternalStore(officeMentorSessions.subscribe,
    () => officeMentorSessions.get(turn.id), () => null);
  const [localError, setLocalError] = React.useState(null);
  const firstAnswer = mentorSession?.turns?.[0]?.answer;
  const target = mentorSession?.lane === 'personal' ? '브랜드 멘토' : '영업 멘토';
  const busy = Boolean(mentorSession?.pending);
  async function ask() {
    setLocalError(null);
    let id;
    try {
      id = officeMentorSessions.open({ result: turn.result,
        officeSource: { requestId: turn.id, runId: turn.result.log?.runId ?? null }, scope: turn.result.scope });
    } catch {
      setLocalError('오피스 출처를 확인하지 못했습니다.');
      return;
    }
    if (turn.result.scope === 'all') { onOpenDrawer(id); return; }
    const pending = officeMentorSessions.begin(id, crypto.randomUUID());
    if (!pending) return;
    const response = await requestOfficeMentor(pending.request);
    officeMentorSessions.complete(id, pending.id, response);
  }
  return <div className={styles.mentorAction}>
    {firstAnswer ? <OfficeMentorReferenceCard answer={firstAnswer} target={target} sourceTruncation={mentorSession.turns[0].sourceTruncation} onContinue={() => onOpenDrawer(turn.id)} />
      : <Button variant="outline" size="sm" disabled={busy} onClick={ask}>{busy ? '멘토 답변 대기 중…' : mentorSession?.error ? '다른 관점 다시 묻기' : '다른 관점으로 검토'}</Button>}
    {mentorSession?.error ? <p className={styles.note} role={mentorSession.error.status === 'error' ? 'alert' : 'status'}>
      <TruthBadge state={mentorSession.error.status === 'preview' ? 'preview' : 'error'} /> {mentorSession.error.note || '멘토 답변을 확인하지 못했습니다.'}</p> : null}
    {localError ? <p className={styles.note} role="alert">{localError}</p> : null}
  </div>;
}

// 안건과 맞는 원문 기법(agent-layer-direction §2.1 ⑦) — 운영자가 쓴 안건·질문의 낱말만 근거로
// 1~2개를 잇는다. 모델을 부르지 않고, 어떤 낱말 때문에 이었는지를 그대로 보인다.
function OfficeAgendaGuidance({ text, scope, onGuidanceAsk, onNavigate }) {
  const matches = React.useMemo(() => matchAgendaGuidance(text, { scope }), [text, scope]);
  const names = matches.map(match => guruRecommendationCard(match)).filter(Boolean).map(card => card.methodLabel);
  if (!matches.length || !names.length) return null;
  return <details className={styles.request}><summary>안건과 맞는 원문 기법 · {names.join(' · ')}</summary>
    <div className={styles.guidanceLinks}>{matches.map(match => <GuruRecommendation key={match.id} recommendation={match} onAsk={onGuidanceAsk} onNavigate={onNavigate} compact />)}</div>
  </details>;
}

// V4(2026-09-26 운영자 선택 "2-3 섞어서"): 한 판은 결론 먼저 — 요청 한 줄 → 결론·다음 행동 → 역할별 발언 비교.
function ResultTurn({ turn, index, onRevise, onCopy, onSkill, onOpenMentor, onGuidanceAsk, onNavigate, skillAvailable, copyStatus, latestRef }) {
  const result = turn.result;
  const { discussion, evaluation } = officeDiscussionState(result, turn.request);
  const owner = OFFICE_ROSTER.find(person => person.id === result.ownerId);
  const dissent = officeRemainingDissent(result, discussion);
  const firstDissent = dissent[0];
  return <article className={styles.turn} ref={latestRef} aria-label={`${index + 1}판 결론`}>
    <RequestMessage message={turn.message} />
    <div className={styles.summary}>
      <div className={styles.verdictMain}>
        <div className={styles.answerHeader}><OfficeAvatar agentId={result.ownerId} /><strong>{index + 1}판 결론 · {owner?.name || 'Office'} {result.mode === 'council' ? '종합' : '답변'}</strong><span>{SCOPE_LABEL[result.scope]} · {MODES.find(item => item.key === result.mode)?.label}</span>
          <CertaintyBadge state="recommended" />{result.sourceCheck === 'untraced' ? <CertaintyBadge state="unknown" label="근거 확인 안 됨" /> : null}</div>
        <div className={styles.answer}>{result.answer}</div>
        {firstDissent ? <p className={styles.dissent}>남은 이견 · {firstDissent}{dissent.length > 1 ? ` 외 ${dissent.length - 1}건` : ''}</p> : null}
        <div className={styles.answerActions}><Button variant="outline" size="sm" onClick={() => onCopy(result.answer, turn.id)}>결론 복사</Button>
          <Button variant="ghost" size="sm" onClick={() => onRevise(result)}>수정 요청</Button>
          {copyStatus?.id === turn.id ? <span role={copyStatus.ok ? 'status' : 'alert'} className={styles.note}>{copyStatus.ok ? '복사했습니다.' : '복사하지 못했습니다. 본문을 선택해 복사해 주세요.'}</span> : null}</div>
        <OfficeMentorAction turn={turn} onOpenDrawer={onOpenMentor} />
        {result.recommendation ? <details className={styles.decision}><summary>추천 근거와 남은 이견 전체</summary>
          {result.recommendation.trim() !== result.answer.trim() ? <><strong>주관 추천</strong><p>{result.recommendation}</p></> : null}
          <strong>근거</strong><ul>{result.evidence.length ? result.evidence.map((text, key) => <li key={key}>{text}</li>) : <li>제공된 근거 없음</li>}</ul>
          <strong>남은 이견</strong><ul>{dissent.length ? dissent.map((text, key) => <li key={key}>{text}</li>) : <li>기록된 이견 없음</li>}</ul>
          <OfficeCollaborationSummary evaluation={evaluation} />
          <OfficeObjectionResolutions discussion={discussion} />
        </details> : null}
      </div>
      <div className={styles.verdictSide}>
        <div className={styles.next}><strong>다음 행동</strong><p>{result.nextAction}</p></div>
        <OfficeAgendaGuidance text={turn.message} scope={result.scope} onGuidanceAsk={onGuidanceAsk} onNavigate={onNavigate} />
        <div className={styles.receipt}><span>{result.log?.persisted === true ? '호출 로그 저장됨' : '답변 생성됨 · 호출 로그 미저장'}</span><span>업무 변경 없음</span></div>
        {result.context?.source && result.context.source !== 'provided' ? <div className={styles.contextState}><TruthBadge state={result.context.source} /></div> : null}
        <p className={styles.note}>{result.context?.note}</p>
        {result.context?.projects?.length ? <details className={styles.request}><summary>참고한 프로젝트 ({result.context.projects.length})</summary><ul className={styles.note}>{result.context.projects.map(project => <li key={project.id}>{project.name} · {project.status}</li>)}</ul></details> : null}
        {skillAvailable ? <details className={styles.request}><summary>더보기</summary><div className={styles.answerActions}>
          <Button variant="outline" size="sm" onClick={() => onSkill(turn)}>로컬 스킬 요청서</Button>
        </div></details> : null}
      </div>
    </div>
    <ThreadDiscussion result={result} request={turn.request} />
  </article>;
}

// 엔진은 발언을 한 번에 돌려주므로 실제 진행률이 아니라 이번 판에 일어날 순서만 예고한다.
function speakingOrder(request) {
  if (request.mode !== 'council') return [personName(request.ownerId) + ' 답변'];
  const rounds = officeDiscussionRounds(request.deliberation);
  return Array.from({ length: rounds }, (_, round) => request.participants.map(id => personName(id) + (round ? ' 상호 검토' : ' 첫 의견'))).flat();
}

function PendingTurn({ pending }) {
  const order = speakingOrder(pending.request);
  return <div className={styles.pending}><RequestMessage message={pending.rawDraft.trim()} /><div><strong>순서 예고</strong><p className={styles.note}>{[...order, '종합'].join(' → ')}</p></div>
    <Skeleton lines={Math.min(order.length + 1, 4)} label="Office 응답 대기 중" /></div>;
}

// 2026-09-23 운영자 확정: 최근 7일 요청·할 일 연결·평균 지연·실패 원인을 한 줄로.
function OfficeUsageLine({ refreshKey }) {
  const [usage, setUsage] = React.useState(null);
  const [retry, setRetry] = React.useState(0);
  React.useEffect(() => {
    const controller = new AbortController();
    setUsage(null);
    loadOfficeUsage({ signal: controller.signal }).then(data => { if (!controller.signal.aborted) setUsage(data); });
    return () => controller.abort();
  }, [refreshKey, retry]);
  const load = () => setRetry(value => value + 1);
  if (!usage) return <div className={styles.usage}><Skeleton lines={1} label="최근 7일 사용 기록 확인 중" style={{ flex: '1 1 240px', maxWidth: 320 }} /></div>;
  if (usage.status === 'preview') return <p className={styles.usage}><TruthBadge state="preview" /> 사용 기록은 저장 연결 후 표시됩니다.</p>;
  if (!['live', 'partial'].includes(usage.status)) return <p className={styles.usage}><TruthBadge state="error" /> 사용 기록을 읽지 못했습니다. <Button size="xs" variant="ghost" onClick={load}>다시 확인</Button></p>;
  const failures = Object.entries(usage.failureCategories || {}).map(([key, n]) => (OFFICE_FAILURE_LABELS[key] || key) + ' ' + n).join(' · ');
  return <p className={styles.usage}>{usage.status === 'partial' ? <TruthBadge state="partial" /> : null}최근 <span className="mono">{usage.windowDays}</span>일 · 요청 <span className="mono">{usage.requests}</span> · 할 일 연결 <span className="mono">{usage.applied}</span>
    {usage.averageElapsedMs != null ? <> · 평균 <span className="mono">{Math.round(usage.averageElapsedMs / 1000)}</span>초</> : null}
    {' · '}실패 <span className="mono">{usage.failed}</span>{failures ? ' (' + failures + ')' : ''}</p>;
}

export function OfficeMeetingRoom({ scope = 'all', onGuidanceAsk, onNavigate }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const meetingParam = searchParams.get('meeting');
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
  const [mentorDrawerId, setMentorDrawerId] = React.useState(null);
  const [selectedTurnId, setSelectedTurnId] = React.useState(null);
  const [mobileView, setMobileView] = React.useState('meet');
  const [meetingRead, setMeetingRead] = React.useState({ status: 'idle' });
  const [archive, setArchive] = React.useState({ status: 'idle', meetings: [], nextCursor: null });
  const [settingsBusy, setSettingsBusy] = React.useState(false);
  const [settingsNotice, setSettingsNotice] = React.useState('');
  const [taskApply, setTaskApply] = React.useState(null);
  const inputRef = React.useRef(null);
  const threadRef = React.useRef(null);
  const latestTurnRef = React.useRef(null);
  const pendingRef = React.useRef(null);
  const taskReadRef = React.useRef(0);
  const taskAbortRef = React.useRef(null);
  const assignmentReadRef = React.useRef(0);
  const meetingReadRef = React.useRef(0);
  const archiveReadRef = React.useRef(0);
  const applyReadRef = React.useRef(0);
  const composing = React.useRef(false);
  const activeScopeRef = React.useRef(scope);
  activeScopeRef.current = scope;
  const activeMeetingParamRef = React.useRef(meetingParam);
  activeMeetingParamRef.current = meetingParam;
  const mountedRef = React.useRef(false);
  React.useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);
  const busy = Boolean(session.pending) || meetingRead.status === 'loading' || settingsBusy;
  const needsMeetingCheck = session.unresolvedTurns.length > 0 || ['unknown', 'running', 'conflict'].includes(session.error?.status)
    || Boolean(meetingParam && meetingParam !== session.meetingId);
  const closed = session.meeting?.state === 'closed';
  const owner = OFFICE_ROSTER.find(person => person.id === ownerId) || OFFICE_ROSTER[0];
  const participants = mode === 'council' ? [ownerId, ...reviewers] : [];
  const preset = COMPARISON_PRESETS.find(item => item.id === session.presetId);
  const assignmentInput = officeAssignmentInput(session);
  const assignmentMessage = assignmentInput.message;
  const tooLong = officeMessageLength(session, { durable: true }) > 6000;
  const visibleTasks = officeTasksForScope(taskState.tasks, scope).filter(task => task.title?.toLocaleLowerCase('ko-KR').includes(taskQuery.toLocaleLowerCase('ko-KR')));
  const unassignedCount = taskState.tasks.filter(task => task.status !== 'done' && !task.workspace).length;
  const railTasks = officeRailTasks(taskState.tasks, scope);
  const shownTurn = session.turns.find(turn => turn.id === selectedTurnId) || session.turns[session.turns.length - 1] || null;
  const shownIndex = shownTurn ? session.turns.indexOf(shownTurn) : -1;
  React.useEffect(() => {
    assignmentReadRef.current += 1;
    setAssignment(null);
  }, [assignmentInput.key, meetingParam]);
  React.useEffect(() => {
    assignmentReadRef.current += 1;
    setAssignment(null); setRosterOpen(false); setMoreOpen(false); setTasksOpen(false);
    setCopyStatus(null); setInputNotice(''); setFollowUpMode('chat'); setSkillTurn(null); setMentorDrawerId(null);
    setSelectedTurnId(null); setMobileView('meet');
    archiveReadRef.current += 1; applyReadRef.current += 1;
    setArchive({ status: 'idle', meetings: [], nextCursor: null }); setTaskApply(null); setSettingsNotice('');
    loadTasks();
    return () => { taskReadRef.current += 1; taskAbortRef.current?.abort(); assignmentReadRef.current += 1; };
    // loadTasks only reads refs and setters; reloading per scope is the intent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  React.useEffect(() => {
    const readId = ++meetingReadRef.current;
    applyReadRef.current += 1;
    setTaskApply(null);
    if (!meetingParam || !officeMeetingScope(scope)) { setMeetingRead({ status: 'idle' }); return; }
    if (store.get(scope).meetingId === meetingParam && store.get(scope).meeting) { setMeetingRead({ status: 'ready' }); return; }
    setMeetingRead({ status: 'loading' });
    readOfficeMeeting(meetingParam, scope).then(result => {
      if (readId !== meetingReadRef.current) return;
      setMeetingRead(result);
      if (result.status === 'ready') store.restoreMeeting(scope, result);
    });
    return () => { meetingReadRef.current += 1; };
  }, [meetingParam, scope, store]);

  React.useEffect(() => {
    if (!meetingParam && session.meetingId && session.meeting && !session.pending && officeMeetingScope(scope)) {
      router.replace('/' + officeMeetingHref(session.meetingId, scope), { scroll: false });
    }
  }, [meetingParam, session.meetingId, session.meeting, session.pending, scope, router]);

  function navigateMeeting(id, targetScope = scope) {
    applyReadRef.current += 1;
    setTaskApply(null);
    router.replace('/' + officeMeetingHref(id, targetScope), { scroll: false });
  }
  function chooseScope(targetScope) {
    if (scope === 'all' && session.draft && !store.get(targetScope).draft && !store.get(targetScope).meetingId) {
      const sourceScope = session.agenda?.taskWorkspace === 'classin' ? 'classin' : 'personal';
      store.update(targetScope, { draft: session.draft, ...(session.agenda && sourceScope === targetScope ? { agenda: session.agenda } : {}) });
      store.update(scope, { draft: '', agenda: null });
    }
    router.replace(`?scope=${targetScope}`, { scroll: false });
  }
  async function reloadMeeting() {
    const id = meetingParam || session.meetingId;
    if (!id || busy) return;
    const readId = ++meetingReadRef.current;
    setMeetingRead({ status: 'loading' });
    const result = await readOfficeMeeting(id, scope);
    if (readId !== meetingReadRef.current) return;
    setMeetingRead(result);
    if (result.status === 'ready') store.restoreMeeting(scope, result, { keepSettings: store.get(scope).meetingId === result.meeting.meetingId });
  }
  async function loadArchive(append = false) {
    if (!officeMeetingScope(scope)) return;
    const readId = ++archiveReadRef.current;
    const previous = append ? archive.meetings : [];
    setArchive(current => ({ ...current, status: 'loading' }));
    const result = await listOfficeMeetings(scope, { cursor: append ? archive.nextCursor : null });
    if (readId !== archiveReadRef.current) return;
    setArchive({ ...result, meetings: result.status === 'ready' ? [...previous, ...result.meetings] : previous });
  }
  function openMeetingTools() { setMoreOpen(true); setSettingsNotice(''); loadArchive(); }
  function resumeMeeting(meeting) {
    if (busy) return;
    setMoreOpen(false); setTaskApply(null); setSelectedTurnId(null);
    navigateMeeting(meeting.meetingId, meeting.scope);
  }
  async function saveSettings(patch = {}) {
    if (busy || !session.meetingId) return;
    setSettingsBusy(true); setSettingsNotice('');
    const result = await saveOfficeMeetingSettings(store, scope, { patch });
    setSettingsBusy(false);
    setSettingsNotice(result.status === 'ready' ? (patch.state === 'closed' ? '회의를 보관했습니다.' : patch.state === 'open' ? '회의를 다시 열었습니다.' : '회의 맥락과 설정을 저장했습니다.') : result.error);
    if (result.status === 'ready') loadArchive();
  }
  async function readTaskForApply() {
    if (!session.meeting?.sourceTask || busy) return;
    const readId = ++applyReadRef.current;
    setTaskApply(current => ({ ...current, status: 'loading', nextAction: current?.nextAction ?? (shownTurn?.result.nextAction === '추가 행동 없음' ? '' : shownTurn?.result.nextAction || '') }));
    const result = await readOfficeMeetingTask(store, scope);
    if (readId !== applyReadRef.current || result.status === 'discarded') return;
    setTaskApply(current => ({ ...current, ...result }));
  }
  async function applyTaskAction() {
    if (taskApply?.status !== 'ready' || busy) return;
    const readId = ++applyReadRef.current;
    setTaskApply(current => ({ ...current, status: 'saving' }));
    const result = await applyOfficeMeetingTaskAction(store, scope, taskApply);
    if (readId !== applyReadRef.current || result.status === 'discarded') return;
    setTaskApply(current => ({ ...current, status: result.status, error: result.error }));
    if (result.status === 'saved') loadTasks();
  }

  function invalidateAssignment() {
    assignmentReadRef.current += 1;
    setAssignment(null);
  }

  async function requestAssignment() {
    if (busy || needsMeetingCheck || closed || assignment?.status === 'loading') return;
    const input = officeAssignmentInput(store.get(scope));
    const message = input.message;
    let request;
    try { request = parseOfficeRoutingRequest({ message, scope }); }
    catch {
      setAssignment({ status: 'error', error: message.length > 6000 ? '안건이 6,000자를 넘습니다. 줄이거나 담당자를 직접 선택해 주세요.' : '먼저 안건을 입력해 주세요. 담당자는 직접 고를 수도 있습니다.' });
      return;
    }
    const readId = ++assignmentReadRef.current;
    const isCurrent = () => mountedRef.current && activeScopeRef.current === scope
      && activeMeetingParamRef.current === meetingParam && readId === assignmentReadRef.current
      && officeAssignmentInput(store.get(scope)).key === input.key;
    setMoreOpen(false);
    setAssignment({ status: 'loading' });
    try {
      const response = await fetch('/api/hub/office/assignment', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(request), cache: 'no-store',
      });
      const body = await response.json().catch(() => null);
      if (!isCurrent()) return;
      if (body?.status === 'preview') {
        setAssignment({ status: 'preview', error: body.error || '오피스 Engine 연결이 필요합니다. 담당자를 직접 선택해 주세요.' });
        return;
      }
      if (!response.ok || body?.status !== 'recommended' || body.businessWrites !== false) throw new Error('invalid-assignment');
      const recommendation = parseOfficeRoutingResult({
        status: body.status, version: body.version, ownerId: body.ownerId,
        reviewerIds: body.reviewerIds, reason: body.reason, scope: body.scope,
        ...(body.plan === undefined ? {} : { plan: body.plan }),
      }, request);
      setAssignment({ ...recommendation, inputKey: input.key, contextTruncated: input.truncated });
    } catch {
      if (isCurrent()) setAssignment({ status: 'error', error: '담당 추천을 확인하지 못했습니다. 담당자를 직접 선택해 주세요.' });
    }
  }

  function applyAssignment() {
    if (busy || needsMeetingCheck || closed || assignment?.status !== 'recommended' || assignment.scope !== scope) return;
    if (officeAssignmentInput(store.get(scope)).key !== assignment.inputKey) { invalidateAssignment(); return; }
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
    taskAbortRef.current?.abort();
    const controller = new AbortController();
    taskAbortRef.current = controller;
    setTaskState({ status: 'loading', tasks: [] });
    loadOfficeTasks({ signal: controller.signal }).then(result => { if (readId === taskReadRef.current) setTaskState(result); });
  };
  const openTasks = () => { setTaskQuery(''); setTasksOpen(true); loadTasks(); };
  function selectPreset(selected) {
    invalidateAssignment();
    update({ ownerId: selected.ownerId, mode: 'council', reviewers: [selected.reviewerId], presetId: selected.id });
    setMoreOpen(false);
  }
  // Clearing a meeting also drops its mentor consultations: they are unreachable afterwards.
  function clearMeeting() {
    applyReadRef.current += 1;
    if (!session.meetingId) officeMentorSessions.discard(session.turns.map(turn => turn.id));
    store.reset(scope);
    router.replace(`?scope=${scope}`, { scroll: false });
    setTaskApply(null);
  }
  function importTask(task) {
    if ((session.turns.length || session.meetingId) && !window.confirm('저장된 회의는 남겨 두고 새 안건을 올릴까요? 미전송 입력은 비워집니다.')) return;
    if (session.turns.length || session.meetingId) clearMeeting();
    invalidateAssignment();
    setSkillTurn(null);
    setMentorDrawerId(null);
    const block = officeTaskAgendaBlock(task);
    const previous = session.turns.length ? '' : session.agenda?.source === 'task' && session.draft.startsWith(session.agenda.block)
      ? session.draft.slice(session.agenda.block.length).trimStart() : session.draft.trimStart();
    update({ agenda: { title: task.title, source: 'task', taskId: task.id, taskWorkspace: task.workspace, importedAt: new Date().toISOString(), block }, draft: previous ? block + '\n\n' + previous : block });
    setTasksOpen(false); setFollowUpMode('chat'); setSelectedTurnId(null); setMobileView('meet');
    requestAnimationFrame(() => inputRef.current?.focus());
  }
  function newAgenda() {
    if (busy || !window.confirm('저장된 회의는 남겨 두고 새 안건을 시작할까요? 미전송 입력은 비워집니다.')) return;
    invalidateAssignment();
    setSkillTurn(null);
    setMentorDrawerId(null);
    clearMeeting(); setFollowUpMode('chat'); setSelectedTurnId(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  }
  async function submit(event) {
    event.preventDefault();
    if (composing.current || tooLong || busy || needsMeetingCheck || closed || !officeMeetingScope(scope)) return;
    const override = session.turns.length && followUpMode === 'chat' && session.mode === 'council' ? { mode: 'chat' } : undefined;
    invalidateAssignment();
    setInputNotice('');
    setSelectedTurnId(null);
    scrollToLatest(pendingRef);
    const result = await sendOfficeMeeting(store, scope, { requestId: crypto.randomUUID(), ...override });
    if (!mountedRef.current || activeScopeRef.current !== scope) return;
    const savedMeetingId = store.get(scope).meetingId;
    if (savedMeetingId && savedMeetingId !== meetingParam) navigateMeeting(savedMeetingId);
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
  const showTurn = id => {
    setSelectedTurnId(id); setMobileView('meet');
    requestAnimationFrame(() => threadRef.current?.scrollTo?.({ top: 0 }));
  };
  const roundTitle = turn => {
    const text = agenda?.block ? turn.message.replace(agenda.block, '') : turn.message;
    return text.split('\n').map(line => line.trim()).find(line => line && !line.startsWith('[')) || agenda?.title || '요청';
  };
  const otherTurns = busy ? session.turns : session.turns.filter(turn => turn !== shownTurn);
  const railStatus = taskState.status;
  return <section className={styles.page + ' fade-up'}>
    <header className={styles.header}><div><div className={styles.eyebrow}>AI·자동화 / 오피스</div><h2>이브이 오피스</h2><p>안건 하나를 올리고, 필요한 관점을 불러 함께 검토하세요.</p></div>
      {scope === 'all' ? <SegmentedControl label="회의 저장 범위" options={[{ key: 'personal', label: '개인' }, { key: 'classin', label: '회사' }]} value="" onChange={chooseScope} /> : <span className={styles.scope}>{SCOPE_LABEL[scope]} 업무</span>}</header>
    <div className={styles.mobileTabs}><SegmentedControl label="회의실 보기" fill options={[{ key: 'agenda', label: '안건' }, { key: 'meet', label: '회의' }, { key: 'people', label: '참석자' }]} value={mobileView} onChange={setMobileView} /></div>
    <div className={styles.room} data-view={mobileView}>
      <aside className={styles.agendaRail} aria-label="안건 목록">
        <section className={styles.railSection}><SectionTitle right={<Button variant="ghost" size="xs" disabled={busy} onClick={openMeetingTools}>저장된 회의</Button>}>지금 회의</SectionTitle>
          {agenda ? <div className={styles.currentAgenda}><strong title={agenda.title}>{agenda.title}</strong><span>{busy ? '확인 중' : `${closed ? '보관됨 · ' : ''}판 ${session.turns.length}개${session.meetingId ? ' · 저장됨' : ''}`}</span></div>
            : <p className={styles.note}>아직 없음 · 아래에서 할 일을 고르거나 직접 적어 주세요</p>}
          {session.turns.length ? <ol className={styles.rounds} aria-label="회의 판">{session.turns.map((turn, index) => <li key={turn.id}>
            <button type="button" className={'hub-row ' + styles.roundButton} aria-pressed={!busy && turn.id === shownTurn?.id} onClick={() => showTurn(turn.id)}>
              <span className="mono">{turn.roundNumber || index + 1}</span><span className={styles.roundText}>{MODE_LABEL(turn.result.mode)} · {roundTitle(turn)}</span></button></li>)}</ol> : null}
          {agenda ? <Button variant="ghost" size="sm" disabled={busy} onClick={newAgenda}>새 안건</Button> : null}
        </section>
        <section className={styles.railSection}><SectionTitle subtitle="완료 전 · 막힘 먼저, 오래 그대로인 순">오래 멈춘 할 일</SectionTitle>
          {railStatus === 'loading' ? <Skeleton lines={3} label="할 일 불러오는 중" /> : null}
          {railStatus === 'error' ? <div className={styles.notice} role="alert"><TruthBadge state="error" /><p>할 일 읽기 실패 · {taskState.error}</p><Button variant="ghost" size="sm" onClick={loadTasks}>다시 시도</Button></div> : null}
          {railStatus === 'preview' ? <div className={styles.notice}><TruthBadge state="preview" /><p>Preview · 연결 필요</p></div> : null}
          {railStatus === 'partial' ? <p className={styles.note}><TruthBadge state="partial" /> 일부 할 일만 확인됐습니다.</p> : null}
          {['live', 'partial'].includes(railStatus) ? (railTasks.length ? <div className={styles.railList}>{railTasks.map(({ task, staleDays }) => <button type="button" key={task.id} className={'hub-row ' + styles.railItem} aria-label={`안건으로 가져오기: ${task.title}`} disabled={busy} onClick={() => importTask(task)}>
            <strong>{task.title}</strong><span>{[task.status === 'blocked' ? '막힘' : null, staleDays == null ? null : staleDays === 0 ? '오늘 수정' : `${staleDays}일째 그대로`, task.due ? '마감 ' + task.due : null].filter(Boolean).join(' · ') || '다음 행동 미정'}</span></button>)}</div>
            : <p className={styles.note}>이 범위에 완료 전 할 일이 없습니다.</p>) : null}
          <Button variant="outline" size="sm" disabled={busy} onClick={openTasks}>할 일 검색</Button>
        </section>
      </aside>
      <div className={styles.main}>
        <div className={styles.agendaBar}>{agenda ? <>
          <div className={styles.agendaMain}><strong title={agenda.title}>안건: {agenda.title}</strong><span className={styles.sourceChip}>{agenda.source === 'task' ? '할 일에서 가져옴 · 복사본 · ' + importedAt : '직접 입력'}</span><span className={styles.mobileCount}>참석 {1 + reviewers.length}명</span></div>
          <div className={styles.agendaTools}><span className={styles.attendees}>참석: {personName(ownerId)}{reviewers.map(id => ' · ' + personName(id)).join('')}</span>
            <span className={styles.rosterShortcut}><Button variant="ghost" size="sm" disabled={busy} onClick={() => setRosterOpen(true)}>참석자 바꾸기</Button></span>
            <Button variant="ghost" size="sm" disabled={busy} onClick={openMeetingTools}>회의·기록</Button></div></>
          : <><p>안건을 올리세요 · 할 일을 가져오거나 직접 적어 주세요</p><span className={styles.agendaTools}><Button variant="ghost" size="sm" onClick={openMeetingTools}>회의·기록</Button></span></>}</div>
        <div className={styles.thread} ref={threadRef} tabIndex={-1} aria-live="polite" aria-label="오피스 요청 결과">
          {meetingRead.status === 'loading' ? <Skeleton lines={4} label="저장된 회의 불러오는 중" /> : null}
          {meetingRead.status === 'error' || meetingRead.status === 'preview' ? <div className={styles.notice} role="alert"><TruthBadge state={meetingRead.status} /><p>{meetingRead.error}</p><Button variant="outline" size="sm" onClick={reloadMeeting}>다시 확인</Button></div> : null}
          {session.unresolvedTurns.length ? <p className={styles.note} role="status">처리 중이거나 결과 확인이 필요한 판이 있습니다. 저장된 회의를 확인한 뒤 이어서 보내세요.</p> : null}
          {session.failedTurns.length ? <p className={styles.note} role="status">응답 실패로 기록된 판 <span className="mono">{session.failedTurns.length}</span>개 · 입력을 확인한 뒤 다시 보낼 수 있습니다.</p> : null}
          {session.turns.length === 0 && !busy && !['error', 'preview'].includes(meetingRead.status) ? <EmptyState icon="chat" title="회의할 안건을 올려 주세요" description={scope === 'all' ? '개인 또는 회사 범위를 고른 뒤 안건을 보내 주세요.' : '할 일을 안건으로 가져오거나 아래에 직접 적어 주세요.'} /> : null}
          {session.pending ? <div ref={pendingRef}><PendingTurn pending={session.pending} /></div>
            : shownTurn ? <ResultTurn key={shownTurn.id} turn={shownTurn} index={shownTurn.roundNumber ? shownTurn.roundNumber - 1 : shownIndex} latestRef={latestTurnRef}
              onRevise={revise} onCopy={copy} onSkill={setSkillTurn} onOpenMentor={setMentorDrawerId} onGuidanceAsk={onGuidanceAsk} onNavigate={onNavigate}
              skillAvailable={Boolean(officeSkillRequestDraft({ agenda: session.agenda, officeScope: scope, result: shownTurn.result }))} copyStatus={copyStatus} /> : null}
          {otherTurns.length ? <div className={styles.otherRounds}><SectionTitle>{busy ? '앞 판' : '다른 판'}</SectionTitle>
            {otherTurns.map(turn => <button type="button" key={turn.id} className={'hub-row ' + styles.otherRound} disabled={busy} onClick={() => showTurn(turn.id)}>
              <span className="mono">{turn.roundNumber || session.turns.indexOf(turn) + 1}판</span><span>{turn.result.answer.split('\n').find(line => line.trim()) || '결론 없음'}</span></button>)}</div> : null}
        </div>
        <form onSubmit={submit} className={styles.composer} aria-busy={busy}>
          <div className={styles.composerTop}><Button variant="outline" size="sm" disabled={busy} onClick={openTasks}>안건 가져오기</Button>
            {!agenda ? <span className={styles.agendaTools + ' ' + styles.rosterShortcut}><Button variant="ghost" size="sm" disabled={busy} onClick={() => setRosterOpen(true)}>참석: {personName(ownerId)}{reviewers.length ? ' +' + reviewers.length : ''}</Button></span> : null}
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
          {needsMeetingCheck ? <Button variant="outline" size="sm" disabled={busy} onClick={reloadMeeting}>입력 유지하고 저장된 회의 확인</Button> : null}
          {closed ? <p className={styles.note}>보관된 회의입니다. 회의·기록에서 다시 열 수 있습니다.</p> : null}
          <div className={styles.actions}><span className={styles.note}>{busy ? '응답을 기다리는 중입니다. 다른 화면으로 이동해도 저장된 회의에서 이어집니다.' : scope === 'all' ? '회의를 저장할 개인 또는 회사 범위를 골라 주세요.' : '⌘/Ctrl + Enter · 보낸 요청과 답변은 회의에 저장됩니다.'}</span>
            <Button type="submit" variant="primary" disabled={busy || needsMeetingCheck || closed || !officeMeetingScope(scope) || !session.draft.trim() || tooLong || (followUpMode === 'council' && !reviewers.length)}>{busy ? '확인 중…' : session.turns.length ? '보내기' : mode === 'council' ? '회의 시작' : '보내기'}</Button></div>
        </form>
      </div>
      <aside className={styles.seatRail} aria-label="참석자와 진행 방식">
        <section className={styles.railSection}><SectionTitle>참석자</SectionTitle>
          <div className={styles.seats}>{[ownerId, ...reviewers].map(id => <div key={id} className={styles.seat + (id === ownerId ? ' ' + styles.ownerSeat : '')}>
            <OfficeAvatar agentId={id} /><span><strong>{personName(id)}{id === ownerId ? ' · 주관' : ''}</strong><small>{OFFICE_ROSTER.find(person => person.id === id)?.pitch}</small></span></div>)}</div>
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => setRosterOpen(true)}>{reviewers.length < 2 && !['draft', 'review'].includes(mode) ? '+ 관점 더하기' : '참석자 바꾸기'}</Button>
        </section>
        <section className={styles.railSection}><SectionTitle>{session.pending ? '진행' : '진행 방식'}</SectionTitle>
          {session.pending ? <><ol className={styles.orderList}>{[...speakingOrder(session.pending.request), '종합'].map((step, index) => <li key={index}>{step}</li>)}</ol><p className={styles.note}>순서 예고 · 실제 진행률 아님</p></>
            : <dl className={styles.settings}>
              <div><dt>응답 방식</dt><dd>{MODE_LABEL(mode)}</dd></div>
              <div><dt>발언 단계</dt><dd>{mode === 'council' ? officeDiscussionRounds(session.deliberation) + '단계' : '—'}</dd></div>
              <div><dt>프로젝트 참고</dt><dd>{includeProjects ? '켬' : '끔'}</dd></div>
              <div><dt>오늘은 최소한만</dt><dd>{minimumOnly ? '켬' : '끔'}</dd></div>
            </dl>}
          <Button variant="outline" size="sm" disabled={busy} onClick={openMeetingTools}>회의·기록</Button>
        </section>
      </aside>
    </div>
    <p className={styles.sessionNote}>보낸 요청·답변과 저장한 회의 맥락은 다시 열 수 있습니다. 미전송 입력은 새로고침·탭 종료 시 사라집니다. 조언만으로 업무가 바뀌지는 않습니다.</p>
    <OfficeUsageLine refreshKey={session.turns.length} />
    <ReviewWaitingList onNavigate={onNavigate} />
    {assignment ? <Drawer title="이브이 담당 추천" subtitle="추천은 선택 사항입니다. 적용 전까지 참석자는 바뀌지 않습니다." onClose={invalidateAssignment} width="min(440px, 94vw)">
      <div className={styles.assignmentCard} role={assignment.status === 'error' ? 'alert' : 'status'}>
        {assignment.status === 'loading' ? <><strong>안건 복사본을 읽고 담당을 추천하는 중</strong><Skeleton lines={2} label="이브이 담당 추천 확인 중" /><Button variant="ghost" size="sm" onClick={editAssignment}>직접 선택</Button></> : null}
        {assignment.status === 'recommended' ? <>
          <div className={styles.assignmentHead}><strong>추천 참석자</strong><CertaintyBadge state="recommended" /></div>
          <p>범위 · {SCOPE_LABEL[assignment.scope]}</p>
          <p>주관 · {personName(assignment.ownerId)}</p>
          <p>함께 볼 관점 · {assignment.reviewerIds.length ? assignment.reviewerIds.map(personName).join(' · ') : '없음'}</p>
          <p className={styles.assignmentReason}>{assignment.reason}</p>
          {assignment.plan ? <dl><div><dt>주관이 만들 결과</dt><dd>{assignment.plan.ownerDeliverable}</dd></div>
            {assignment.plan.reviews.map(review => <div key={review.reviewerId}><dt>{personName(review.reviewerId)} 검토 질문</dt><dd>{review.question}</dd></div>)}</dl> : null}
          {assignment.contextTruncated ? <p className={styles.note}>현재 질문을 우선하고 부가 맥락 일부를 생략해 추천했습니다.</p> : null}
          <div className={styles.assignmentActions}><Button variant="primary" size="sm" disabled={busy || needsMeetingCheck || closed} onClick={applyAssignment}>적용</Button><Button variant="outline" size="sm" onClick={editAssignment}>수정</Button><Button variant="ghost" size="sm" onClick={invalidateAssignment}>무시</Button></div>
        </> : null}
        {['preview', 'error'].includes(assignment.status) ? <><TruthBadge state={assignment.status} /><p>{assignment.error}</p>
          <div className={styles.assignmentActions}><Button variant="outline" size="sm" onClick={editAssignment}>직접 선택</Button><Button variant="ghost" size="sm" onClick={invalidateAssignment}>닫기</Button></div></> : null}
      </div>
    </Drawer> : null}
    {skillTurn ? <OfficeSkillRequestDrawer key={skillTurn.id} agenda={session.agenda} officeScope={scope} result={skillTurn.result} meetingId={session.meetingId} officeTurnId={skillTurn.id} onClose={() => setSkillTurn(null)} /> : null}
    {mentorDrawerId ? <OfficeMentorDrawer sessionId={mentorDrawerId} onClose={() => setMentorDrawerId(null)} /> : null}
    {rosterOpen ? <Drawer title="참석자 바꾸기" subtitle="주관 한 명과 관점 최대 두 명을 고르세요." onClose={() => setRosterOpen(false)} width="min(480px, 94vw)" footer={<Button variant="primary" onClick={() => setRosterOpen(false)}>완료</Button>}>
      <div className={styles.roster}><strong>주관</strong>{OFFICE_ROSTER.map(person => <button type="button" key={person.id} className={'hub-row ' + styles.member} aria-label={`${person.name} (${person.role}) 주관 선택`} aria-pressed={person.id === ownerId} onClick={() => { invalidateAssignment(); update({ ownerId: person.id, reviewers: reviewers.filter(id => id !== person.id), presetId: null }); }}>
        <OfficeAvatar agentId={person.id} size="large" /><span><strong>{person.name} <small>{person.role}</small></strong><span className={styles.memberPitch}>{person.pitch}</span></span></button>)}
        <strong>함께 볼 관점</strong>{['draft', 'review'].includes(mode) ? <p className={styles.note}>초안·검토는 주관 혼자 씁니다. 더보기에서 대화로 바꾸면 관점을 추가할 수 있습니다.</p> : null}
        <div className={styles.views}>{OFFICE_ROSTER.filter(person => person.id !== ownerId).map(person => <CheckboxRow key={person.id} text={person.name + ' · ' + person.role} leading={<OfficeAvatar agentId={person.id} size="small" />} checked={reviewers.includes(person.id)}
          disabled={busy || ['draft', 'review'].includes(mode) || (!reviewers.includes(person.id) && reviewers.length >= 2)}
          onChange={() => { invalidateAssignment(); update(current => ({ presetId: null, reviewers: current.reviewers.includes(person.id) ? current.reviewers.filter(id => id !== person.id) : [...current.reviewers, person.id] })); }} />)}</div>
      </div></Drawer> : null}
    {moreOpen ? <Drawer title="회의·기록" subtitle="저장된 회의를 열고 맥락과 다음 행동을 확인하세요." onClose={() => { if (!settingsBusy && taskApply?.status !== 'saving') setMoreOpen(false); }} width="min(520px, 94vw)">
      <div className={styles.more}>
        <SectionTitle right={<Button variant="ghost" size="xs" disabled={archive.status === 'loading'} onClick={() => loadArchive()}>다시 확인</Button>}>저장된 회의</SectionTitle>
        {!officeMeetingScope(scope) ? <p className={styles.note}>개인 또는 회사 범위를 고르면 저장된 회의를 확인합니다.</p> : null}
        {archive.status === 'loading' ? <Skeleton lines={2} label="저장된 회의 목록 확인 중" /> : null}
        {['error', 'preview'].includes(archive.status) ? <p className={styles.note} role="status"><TruthBadge state={archive.status} /> {archive.error}</p> : null}
        {archive.meetings.length ? <div className={styles.taskList}>{archive.meetings.map(meeting => <button type="button" key={meeting.meetingId} className={'hub-row ' + styles.taskRow} disabled={busy} onClick={() => resumeMeeting(meeting)}>
          <strong>{meeting.title}</strong><span>{meeting.state === 'closed' ? '보관됨' : '진행 중'} · {SCOPE_LABEL[meeting.scope]}{meeting.updatedAt ? ' · ' + new Date(meeting.updatedAt).toLocaleDateString('ko-KR') : ''}</span></button>)}</div>
          : archive.status === 'ready' ? <p className={styles.note}>저장된 회의가 없습니다. 안건을 보내면 첫 회의가 저장됩니다.</p> : null}
        {archive.nextCursor ? <Button variant="ghost" size="sm" disabled={archive.status === 'loading'} onClick={() => loadArchive(true)}>이전 회의 더 보기</Button> : null}
        <details className={styles.request} open={Boolean(session.meetingId)}><summary>이 회의의 맥락과 할 일</summary><div className={styles.meetingTools}>
          {session.meeting && session.decisionContext !== session.meeting.decisionContext ? <p className={styles.note}>현재 저장된 맥락 · {session.meeting.decisionContext || '없음'}</p> : null}
          <TextAreaField label="이어갈 결정과 조건" value={session.decisionContext} maxLength={4000} rows={4} disabled={busy}
            onChange={event => update({ decisionContext: event.target.value })} hint="직접 정리한 내용은 저장 후 다음 판에서 함께 참고합니다." />
          {session.meetingId ? <div className={styles.assignmentActions}><Button variant="outline" size="sm" disabled={busy} onClick={() => saveSettings()}>맥락·설정 저장</Button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={reloadMeeting}>입력 유지하고 회의 다시 읽기</Button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => saveSettings({ state: closed ? 'open' : 'closed' })}>{closed ? '회의 다시 열기' : '회의 보관'}</Button></div>
            : <p className={styles.note}>첫 요청을 보낼 때 회의와 맥락을 함께 저장합니다.</p>}
          {settingsNotice ? <p className={styles.note} role="status">{settingsNotice}</p> : null}
          {session.meeting?.sourceTask ? <>
            <SectionTitle>연결된 할 일</SectionTitle><strong>{session.meeting.sourceTask.title}</strong>
            <p className={styles.note}>안건을 가져올 때의 다음 행동 · {session.meeting.sourceTask.nextAction || '없음'}</p>
            <Button variant="outline" size="sm" disabled={busy || ['loading', 'saving'].includes(taskApply?.status)} onClick={readTaskForApply}>최신 할 일과 다음 행동 비교</Button>
            {taskApply?.status === 'loading' ? <Skeleton lines={2} label="최신 할 일 확인 중" /> : null}
            {taskApply?.current ? <div className={styles.taskCompare}>
              <p><strong>현재 저장된 다음 행동</strong><span>{taskApply.current.nextAction || '없음'}</span></p>
              {taskApply.current.updatedAt !== session.meeting.sourceTask.updatedAt ? <p className={styles.note}>안건을 가져온 뒤 할 일이 변경됐습니다. 현재 내용과 비교해 주세요.</p> : null}
              <TextAreaField label="바꿀 다음 행동" value={taskApply.nextAction || ''} maxLength={1000} rows={3} disabled={taskApply.status === 'saving' || taskApply.status === 'saved'} onChange={event => setTaskApply(current => ({ ...current, nextAction: event.target.value }))} />
              <Button variant="primary" size="sm" disabled={taskApply.status !== 'ready' || !taskApply.nextAction?.trim()} onClick={applyTaskAction}>이 내용으로 다음 행동 저장</Button>
            </div> : null}
            {taskApply?.status === 'saved' ? <p className={styles.note} role="status">할 일의 다음 행동을 저장했습니다.</p> : null}
            {taskApply?.error ? <p className={styles.note} role="alert">{taskApply.error}</p> : null}
          </> : <p className={styles.note}>할 일을 안건으로 가져온 회의에서 기존 할 일의 다음 행동을 연결할 수 있습니다.</p>}
          {session.meetingId ? <OfficeSkillRequestHistory title="이 회의의 요청 기록" state={{ status: meetingRead.status === 'loading' ? 'loading' : meetingRead.status === 'error' ? 'error' : 'live', items: session.skillRequests, error: meetingRead.error }} onRefresh={reloadMeeting} /> : null}
        </div></details>
        <details className={styles.request}><summary>응답 방식과 참석자</summary><div className={styles.meetingTools}>
        {assignmentMessage ? <Button variant="outline" size="sm" disabled={busy || needsMeetingCheck || closed} onClick={requestAssignment}>담당 추천</Button> : null}
        <Button variant="outline" size="sm" onClick={() => { setMoreOpen(false); setRosterOpen(true); }}>참석자 바꾸기</Button>
        {agenda || session.meetingId ? <Button variant="ghost" size="sm" onClick={() => { setMoreOpen(false); newAgenda(); }}>새 안건</Button> : null}
        {reviewers.length ? <p className={styles.note}>관점이 있어 회의로 고정됩니다. <Button variant="ghost" size="sm" onClick={() => { invalidateAssignment(); update({ reviewers: [], mode: 'chat', presetId: null }); }}>혼자 쓰기로 전환</Button></p>
          : <SegmentedControl label="오피스 응답 방식" options={MODES.slice(0, 3)} value={mode} onChange={next => { invalidateAssignment(); update({ mode: next, reviewers: [], presetId: null }); }} />}
        <strong>추천 조합</strong><div className={styles.presets}>{COMPARISON_PRESETS.map(item => <Button key={item.id} variant="outline" size="sm" active={mode === 'council' && session.presetId === item.id} aria-pressed={mode === 'council' && session.presetId === item.id} onClick={() => selectPreset(item)}>{item.label}</Button>)}</div>
        {mode === 'council' ? <OfficeDeliberationControls value={session.deliberation} participants={participants} disabled={busy} onChange={deliberation => update({ deliberation })} /> : null}
        <CheckboxRow text="현재 범위의 최근 프로젝트 참고" checked={includeProjects} disabled={busy} onChange={() => update({ includeProjects: !includeProjects })} />
        <CheckboxRow text="오늘은 최소한만" checked={minimumOnly} disabled={busy} onChange={() => update({ minimumOnly: !minimumOnly })} />
        {includeProjects ? <p className={styles.note}>현재 범위의 최근 프로젝트 최대 8개를 참고합니다. 고객·일정 기록은 이 자유 요청에 자동 연결되지 않습니다.</p> : null}
        {minimumOnly ? <p className={styles.note}>이미 정한 약속을 지키는 데 필요한 내용만 요청합니다. 추가 행동이 필요 없으면 남기지 않습니다.</p> : null}
        </div></details>
      </div></Drawer> : null}
    {tasksOpen ? <Drawer title="안건 가져오기" subtitle="할 일의 현재 텍스트를 복사해 안건으로 올립니다. 원본 할 일은 바뀌지 않습니다." onClose={() => setTasksOpen(false)} width="min(480px, 94vw)">
      <div className={styles.taskPicker}><TextField label="할 일 제목 검색" value={taskQuery} onChange={event => setTaskQuery(event.target.value)} placeholder="제목으로 찾기" />
        {taskState.status === 'loading' ? <Skeleton lines={4} label="할 일 불러오는 중" /> : null}
        {taskState.status === 'error' ? <div className={styles.notice} role="alert"><TruthBadge state="error" /><p>할 일 읽기 실패 · {taskState.error}</p><Button variant="ghost" size="sm" onClick={loadTasks}>다시 시도</Button></div> : null}
        {taskState.status === 'preview' ? <div className={styles.notice}><TruthBadge state="preview" /><p>Preview · 연결 필요</p></div> : null}
        {taskState.status === 'partial' ? <p className={styles.note}><TruthBadge state="partial" /> 일부 할 일만 확인됐습니다.</p> : null}
        {['live', 'partial'].includes(taskState.status) ? <>{visibleTasks.length ? <div className={styles.taskList}>{visibleTasks.map(task => <button type="button" key={task.id} className={'hub-row ' + styles.taskRow} aria-label={`안건으로 가져오기: ${task.title}`} onClick={() => importTask(task)}><strong>{task.title}</strong><span>{[task.nextAction, task.due || task.dueAt].filter(Boolean).join(' · ') || '다음 행동 미정'}</span></button>)}</div>
          : <EmptyState icon="check" title="이 범위에서 찾은 할 일이 없습니다" description="다른 제목을 검색하거나 전체 범위에서 확인해 주세요." />}
          {scope !== 'all' && unassignedCount ? <p className={styles.note}>범위 미정 {unassignedCount}개 · 전체 범위에서 보입니다</p> : null}</> : null}
      </div></Drawer> : null}
  </section>;
}
