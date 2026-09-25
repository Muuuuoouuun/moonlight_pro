'use client';

import React from 'react';
import { Button, CertaintyBadge, Drawer, SegmentedControl, TextAreaField, TruthBadge } from './hub-primitives';
import { OFFICE_MENTOR_FOLLOWUP_LIMIT, requestOfficeMentor } from './office-mentor-client';
import { officeMentorSessions } from './office-mentor-session';
import './office-mentor-drawer.css';

const LANE_LABEL = { classin: '영업 멘토', personal: '브랜드 멘토' };

function useCompactDrawer() {
  const [compact, setCompact] = React.useState(false);
  React.useEffect(() => {
    const media = window.matchMedia('(max-width: 600px)');
    const update = () => setCompact(media.matches);
    update();
    media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, []);
  return compact;
}

export function renderFormattedMentorText(text) {
  if (typeof text !== 'string') return null;
  const lines = text.split('\n');
  return lines.map((line, lineIndex) => {
    const parts = [];
    const regex = /\*\*(.+?)\*\*/g;
    let lastIndex = 0;
    let match;
    while ((match = regex.exec(line)) !== null) {
      if (match.index > lastIndex) {
        parts.push(line.slice(lastIndex, match.index));
      }
      parts.push(<strong key={`b-${lineIndex}-${match.index}`}>{match[1]}</strong>);
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < line.length) {
      parts.push(line.slice(lastIndex));
    }
    return (
      <React.Fragment key={`l-${lineIndex}`}>
        {lineIndex > 0 ? <br /> : null}
        {parts.length > 0 ? parts : null}
      </React.Fragment>
    );
  });
}

// The result card can mount this without opening another surface or calling a model.
// Its disclosure starts closed; only the explicit continuation button opens chat.
export function OfficeMentorReferenceCard({ answer, target = '멘토', onContinue }) {
  if (!answer) return null;
  return <details className="office-mentor__reference">
    <summary tabIndex={0}>다른 관점 · {target} 답변 보기</summary>
    <div className="office-mentor__reference-body">
      <div className="office-mentor__reference-meta"><CertaintyBadge state="recommended" /> <span>판단에 참고할 의견입니다.</span></div>
      <p>{renderFormattedMentorText(answer)}</p>
      {onContinue ? <Button variant="outline" size="sm" onClick={onContinue}>이어서 상담</Button> : null}
    </div>
  </details>;
}

function OfficeResultSource({ session, summaryRef }) {
  const result = session.result;
  return <details className="office-mentor__source">
    <summary ref={summaryRef} tabIndex={0}>Office 원문과 출처</summary>
    <div className="office-mentor__source-body">
      <div className="office-mentor__source-ids">요청 <span className="mono">{session.officeSource.requestId}</span>
        {' · '}실행 기록 <span className="mono">{session.officeSource.runId || '없음'}</span></div>
      <p>{result.answer}</p>
      {result.recommendation ? <p><strong>주관 추천</strong> {result.recommendation}</p> : null}
      <div><strong>근거</strong><ul>{result.evidence?.length ? result.evidence.map((item, index) => <li key={index}>{item}</li>) : <li>제공된 근거 없음</li>}</ul></div>
      <div><strong>남은 이견</strong><ul>{result.dissent?.length ? result.dissent.map((item, index) => <li key={index}>{item}</li>) : <li>기록된 이견 없음</li>}</ul></div>
      <p><strong>다음 행동</strong> {result.nextAction || '제공 없음'}</p>
    </div>
  </details>;
}

export function OfficeMentorDrawer({ sessionId, store = officeMentorSessions, onClose }) {
  const session = React.useSyncExternalStore(store.subscribe, () => store.get(sessionId), () => null);
  const inputRef = React.useRef(null);
  const sourceRef = React.useRef(null);
  const compact = useCompactDrawer();
  if (!session) return null;

  const busy = Boolean(session.pending);
  const hasAnswer = session.turns.length > 0;
  const target = LANE_LABEL[session.lane] || '멘토';
  const send = async () => {
    const pending = store.begin(sessionId, crypto.randomUUID());
    if (!pending) return;
    const response = await requestOfficeMentor(pending.request);
    store.complete(sessionId, pending.id, response);
  };
  const submitFromKeyboard = event => {
    if (event.isComposing || event.nativeEvent?.isComposing || event.keyCode === 229 || event.nativeEvent?.keyCode === 229) return;
    send();
  };
  const inputError = session.error?.code === 'question-too-long' ? session.error.note : null;
  const canSend = !busy && session.lane && (!hasAnswer || Boolean(session.draft.trim()));

  return <Drawer
    title={`${target}와 상담`}
    subtitle="Office 결과를 바탕으로 다른 관점을 묻습니다. 전송할 때만 멘토가 응답합니다."
    onClose={onClose}
    initialFocusRef={session.scope === 'all' && !session.lane ? undefined : hasAnswer ? inputRef : sourceRef}
    width="min(540px, 100vw)"
    presentation={compact ? 'compact' : 'side'}
    footer={<>
      <Button variant="ghost" size="sm" className="office-mentor__footer-button" onClick={onClose}>닫기</Button>
      <Button variant="primary" size="sm" className="office-mentor__footer-button" disabled={!canSend} onClick={send}>
        {busy ? '답변 받는 중…' : hasAnswer ? '질문 보내기' : '다른 관점으로 검토'}
      </Button>
    </>}
  >
    {session.scope === 'all' && !hasAnswer ? <section className="office-mentor__lane" aria-label="멘토 범위">
      <p>전체 Office 결과입니다. 상담할 회사 또는 개인 범위를 먼저 고르세요. 다른 범위의 내용이 섞여 있다면 원문을 확인해 주세요.</p>
      <SegmentedControl label="멘토 범위 선택" options={[{ key: 'classin', label: '회사' }, { key: 'personal', label: '개인' }]}
        value={session.lane} onChange={lane => store.chooseLane(sessionId, lane)} invalid={session.error?.code === 'lane-required'} fill />
    </section> : null}

    <OfficeResultSource session={session} summaryRef={sourceRef} />

    {session.turns.map((turn, index) => index === 0
      ? <OfficeMentorReferenceCard key={turn.id} answer={turn.answer} target={target} />
      : <article key={turn.id} className="office-mentor__turn">
        <div className="office-mentor__turn-question"><span>나 · {index + 1}번째 질문</span><p>{turn.question}</p></div>
        <div className="office-mentor__turn-answer"><span>{target}</span><p>{renderFormattedMentorText(turn.answer)}</p></div>
      </article>)}

    {hasAnswer ? <TextAreaField
      ref={inputRef}
      id={`office-mentor-followup-${sessionId}`}
      label="이어서 물을 질문"
      value={session.draft}
      onChange={event => store.setDraft(sessionId, event.target.value)}
      onCmdEnter={submitFromKeyboard}
      rows={4}
      maxLength={OFFICE_MENTOR_FOLLOWUP_LIMIT}
      showCount
      error={inputError}
      hint="이전 대화를 참고합니다. 답변은 이 브라우저 화면에서만 유지됩니다."
    /> : <p className="office-mentor__note">한 번 검토한 뒤 이어서 질문할 수 있습니다. 업무 등록이나 외부 발송은 하지 않습니다.</p>}

    {busy ? <p className="office-mentor__feedback" role="status">멘토의 답변을 기다리고 있습니다…</p> : null}
    {session.error?.code === 'lane-required' ? <p className="office-mentor__feedback" role="alert">회사 또는 개인 멘토를 먼저 골라 주세요.</p> : null}
    {session.error?.status === 'preview' ? <p className="office-mentor__feedback" role="status"><TruthBadge state="preview" label="응답 연결 필요" /> {session.error.note}</p> : null}
    {session.error?.status === 'error' && !session.error.code ? <p className="office-mentor__feedback" role="alert"><TruthBadge state="error" label="응답 실패" /> {session.error.note}</p> : null}
    <p className="office-mentor__retention">이 상담은 현재 브라우저 세션에만 남습니다. 페이지를 다시 열면 복원되지 않을 수 있습니다.</p>
  </Drawer>;
}
