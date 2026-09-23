'use client';
import React from 'react';
import { OFFICE_ROSTER } from '@com-moon/agent-contracts/office';
import { Button, CheckboxRow, Drawer, EmptyState, SegmentedControl, Skeleton, TextAreaField, TruthBadge, CertaintyBadge } from '../hub-primitives';
import { requestOffice } from '../office-client';
import { copyOfficeText, OFFICE_MINIMUM_INSTRUCTION, shouldSubmitOfficeKey } from '../office-session';
import { useOfficeSession } from '../office-session-provider';
import { OfficeDeliberationControls, OfficeDiscussion } from '../office-deliberation-controls';
import styles from './office-council.module.css';

const MODES = [{ key: 'chat', label: '대화' }, { key: 'draft', label: '초안' }, { key: 'review', label: '검토' }, { key: 'council', label: '관점 비교' }];
const SCOPE_LABEL = { all: '전체', classin: '회사', personal: '개인' };
const COMPARISON_PRESETS = [
  { id: 'customer', label: '고객 제안 검토', ownerId: 'flareon', reviewerId: 'umbreon', hint: '최근 고객 발언과 제안안을 넣어 주세요. 지원·수치 약속의 근거를 함께 살펴봅니다.' },
  { id: 'build', label: '기능·구현 검토', ownerId: 'glaceon', reviewerId: 'jolteon', hint: '만들 기능과 사용 장면, 제약을 적어 주세요. 최소 흐름과 확인할 조건을 정리합니다.' },
  { id: 'resources', label: '돈·시간 비교', ownerId: 'espeon', reviewerId: 'leafeon', hint: '대안과 비용, 설정·유지에 드는 시간을 적어 주세요. 선택할 이유와 포기할 것을 비교합니다.' },
  { id: 'weekly', label: '이번 주 정리', ownerId: 'vaporeon', reviewerId: 'eevee', hint: '이번 주 기록과 다음 주 약속을 적어 주세요. 끝낸 일과 남길 행동을 구분합니다.' },
];

function ResultTurn({ turn, onRevise, onCopy, copyStatus }) {
  const result = turn.result;
  const owner = OFFICE_ROSTER.find(person => person.id === result.ownerId);
  return <article className={styles.turn}>
    <div className={styles.answerHeader}>
      <strong>{owner?.name || 'Office'}</strong>
      <span>{SCOPE_LABEL[result.scope]} · {MODES.find(item => item.key === result.mode)?.label}</span>
      <CertaintyBadge state="recommended" />
      {result.sourceCheck === 'untraced' ? <CertaintyBadge state="unknown" label="근거 확인 안 됨" /> : null}
    </div>
    <details className={styles.request}><summary>이번 요청</summary><p>{turn.message}</p></details>
    <div className={styles.answer}>{result.answer}</div>
    <div className={styles.answerActions}>
      <Button variant="outline" size="sm" onClick={() => onCopy(result.answer, turn.id)}>답변 복사</Button>
      <Button variant="ghost" size="sm" onClick={() => onRevise(result)}>수정 요청</Button>
      {copyStatus?.id === turn.id ? <span role={copyStatus.ok ? 'status' : 'alert'} className={styles.note}>{copyStatus.ok ? '복사했습니다.' : '복사하지 못했습니다. 본문을 선택해 복사해 주세요.'}</span> : null}
    </div>
    {result.recommendation ? <details className={styles.decision}>
      <summary>추천 근거와 남은 이견</summary>
      {result.recommendation.trim() !== result.answer.trim() ? <><strong>주관 추천</strong><p>{result.recommendation}</p></> : null}
      <strong>근거</strong><ul>{result.evidence.length ? result.evidence.map((text, index) => <li key={index}>{text}</li>) : <li>제공된 근거 없음</li>}</ul>
      <strong>남은 이견</strong><ul>{result.dissent.length ? result.dissent.map((text, index) => <li key={index}>{text}</li>) : <li>기록된 이견 없음</li>}</ul>
    </details> : null}
    <div className={styles.next}><strong>다음 행동</strong><p>{result.nextAction}</p></div>
    <div className={styles.receipt}><span>{result.log?.persisted === true ? '호출 로그 저장됨' : '답변 생성됨 · 호출 로그 미저장'}</span><span>업무 변경 없음</span></div>
    <OfficeDiscussion result={result} request={turn.request} />
    {result.context?.source && result.context.source !== 'provided' ? <div className={styles.contextState}><TruthBadge state={result.context.source} /></div> : null}
    <p className={styles.note}>{result.context?.note}</p>
    {result.context?.projects?.length ? <details className={styles.request}><summary>참고한 프로젝트 ({result.context.projects.length})</summary><ul className={styles.note}>{result.context.projects.map(project => <li key={project.id}>{project.name} · {project.status}</li>)}</ul></details> : null}
  </article>;
}

export function OfficeCouncil({ scope = 'all' }) {
  const { session, store, update } = useOfficeSession(scope);
  const { ownerId, mode, reviewers, includeProjects, minimumOnly } = session;
  const [rosterOpen, setRosterOpen] = React.useState(false);
  const [copyStatus, setCopyStatus] = React.useState(null);
  const [comparisonOpen, setComparisonOpen] = React.useState(mode === 'council');
  const inputRef = React.useRef(null);
  const composing = React.useRef(false);
  const busy = Boolean(session.pending);
  const owner = OFFICE_ROSTER.find(person => person.id === ownerId);
  const participants = mode === 'council' ? [ownerId, ...reviewers.filter(id => id !== ownerId)] : [];
  const preset = COMPARISON_PRESETS.find(item => item.id === session.presetId);
  const messageLength = session.draft.trim().length + (minimumOnly ? OFFICE_MINIMUM_INSTRUCTION.length : 0);
  const tooLong = messageLength > 6000;
  React.useEffect(() => { setRosterOpen(false); setCopyStatus(null); setComparisonOpen(store.get(scope).mode === 'council'); }, [scope, store]);

  function selectOwner(id) {
    if (busy) return;
    const nextReviewers = reviewers.filter(reviewer => reviewer !== id);
    update({ ownerId: id, reviewers: nextReviewers.length ? nextReviewers : [id === 'umbreon' ? 'eevee' : 'umbreon'], presetId: null });
    setRosterOpen(false);
  }

  function selectPreset(selected) {
    if (busy) return;
    update({ ownerId: selected.ownerId, mode: 'council', reviewers: [selected.reviewerId], presetId: selected.id });
    setComparisonOpen(true);
  }

  async function submit(event) {
    event.preventDefault();
    if (composing.current || tooLong) return;
    const pending = store.begin(scope, crypto.randomUUID());
    if (!pending) return;
    // The store belongs to Hub, so navigating away does not lose or relabel a late result.
    const result = await requestOffice(pending.request);
    store.complete(scope, pending.id, result);
  }

  async function copy(text, id) {
    const ok = await copyOfficeText(text, navigator.clipboard);
    setCopyStatus({ id, ok });
  }

  function revise(result) {
    if (!busy) update({ ownerId: result.ownerId, mode: result.mode,
      reviewers: result.mode === 'council' ? result.participants.filter(id => id !== result.ownerId) : reviewers,
      ...(result.mode === 'council' ? { deliberation: result.discussion?.settings } : {}), presetId: null });
    inputRef.current?.focus();
  }

  return <section className={`${styles.page} fade-up`}>
    <header className={styles.header}>
      <div><div className={styles.eyebrow}>AGENTS / OFFICE</div><h2>이브이 오피스</h2><p>정리할 일이나 필요한 결과물을 알려주세요.</p></div>
      <span className={styles.scope}>{SCOPE_LABEL[scope]} 업무</span>
    </header>
    <div className={styles.main}>
      <form onSubmit={submit} className={styles.composer} aria-busy={busy}>
        <fieldset disabled={busy} className={styles.controls}>
          <div className={styles.selection}>
            <Button variant="outline" onClick={() => setRosterOpen(true)} aria-expanded={rosterOpen} aria-haspopup="dialog">담당: {owner.name} · 변경</Button>
            <span className={styles.pitch}>{owner.pitch}</span>
          </div>
          <SegmentedControl label="Office 응답 방식" options={MODES} value={mode} onChange={next => { update({ mode: next, presetId: null }); if (next === 'council') setComparisonOpen(true); }} />
        </fieldset>
        <TextAreaField ref={inputRef} label={session.turns.length ? '후속 요청 또는 원문' : '요청 또는 원문'} value={session.draft}
          onChange={event => update({ draft: event.target.value })} maxLength={6000} rows={5} disabled={busy}
          error={tooLong ? '요청이 깁니다. 최소 업무 지침을 포함해 6,000자 안으로 줄여 주세요.' : null}
          onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }}
          onKeyDown={event => { if (!composing.current && shouldSubmitOfficeKey(event)) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }}
          placeholder={preset?.hint || '목적과 필요한 결과물을 적어주세요. 원문이나 메모를 함께 넣어도 좋아요.'} />
        <div className={styles.options}>
          <CheckboxRow text="현재 범위의 최근 프로젝트 참고" checked={includeProjects} disabled={busy} onChange={() => update({ includeProjects: !includeProjects })} />
          <CheckboxRow text="오늘은 최소한만" checked={minimumOnly} disabled={busy} onChange={() => update({ minimumOnly: !minimumOnly })} />
        </div>
        {includeProjects ? <p className={styles.note}>현재 범위의 최근 프로젝트 최대 8개를 참고합니다. 고객·일정 원장은 이 자유 요청에 자동 연결되지 않습니다.</p> : null}
        {minimumOnly ? <p className={styles.note}>이미 정한 약속을 지키는 데 필요한 내용만 요청합니다. 추가 행동이 필요 없으면 남기지 않습니다.</p> : null}
        {session.error ? <div role="alert" className={`${styles.notice} ${session.error.status === 'error' ? styles.error : ''}`}><TruthBadge state={session.error.status === 'preview' ? 'preview' : 'error'} /><p>{session.error.error}</p></div> : null}
        <div className={styles.actions}>
          <span className={styles.note}>{busy ? '요청한 담당이 작성 중입니다. 다른 화면으로 이동해도 이 세션에서 이어집니다.' : '⌘/Ctrl + Enter로 보내기 · 답변은 업무를 변경하지 않습니다.'}</span>
          <Button type="submit" variant="primary" disabled={busy || !session.draft.trim() || tooLong || (mode === 'council' && participants.length < 2)}>{busy ? '작성 중…' : mode === 'council' ? '관점 비교하기' : '요청 보내기'}</Button>
        </div>
      </form>
      <details className={styles.collaboration} open={comparisonOpen} onToggle={event => setComparisonOpen(event.currentTarget.open)}>
        <summary>함께 검토하기{mode === 'council' ? ` · ${participants.length}명` : ''}</summary>
        <fieldset disabled={busy} className={styles.controls}>
          <p className={styles.note}>추천 조합을 선택하거나 주관 포함 2~3명의 관점을 비교하세요. 입력한 원문은 그대로 유지됩니다.</p>
          <div className={styles.presets}>{COMPARISON_PRESETS.map(item => <Button key={item.id} variant="outline" size="sm" active={mode === 'council' && session.presetId === item.id} aria-pressed={mode === 'council' && session.presetId === item.id} onClick={() => selectPreset(item)}>{item.label}</Button>)}</div>
          {preset ? <p className={styles.note}>{preset.hint}</p> : null}
          {mode === 'council' ? <>
            <p className={styles.note}>주관은 {owner.name}. 추가 관점을 1~2명 선택하세요.</p>
            <div className={styles.views}>{OFFICE_ROSTER.filter(person => person.id !== ownerId).map(person => <CheckboxRow key={person.id} text={`${person.name} · ${person.role}`} checked={reviewers.includes(person.id)} disabled={!reviewers.includes(person.id) && reviewers.length >= 2}
              onChange={() => update(current => ({ presetId: null, reviewers: current.reviewers.includes(person.id) ? current.reviewers.filter(id => id !== person.id) : [...current.reviewers, person.id] }))} />)}</div>
            <OfficeDeliberationControls value={session.deliberation} participants={participants} disabled={busy} onChange={deliberation => update({ deliberation })} />
          </> : null}
          <p className={styles.note}>같은 모델의 역할별 개별 검토입니다. 첫 의견을 따로 작성한 뒤 설정에 따라 다른 관점에 답하고, 주관이 결과를 종합합니다.</p>
        </fieldset>
      </details>
      <div className={styles.thread} aria-label="Office 요청 결과">
        {busy ? <div className={styles.pending} aria-live="polite"><TruthBadge state="loading" /><Skeleton lines={3} /></div> : null}
        {session.turns.length === 0 && !busy ? <EmptyState icon="chat" title="필요한 결과물부터 요청하세요" description="초안·검토·관점 비교를 돕습니다. 자유 요청의 원문과 답변은 이 Hub 세션에서만 유지됩니다." action={<Button variant="ghost" onClick={() => inputRef.current?.focus()}>요청 작성하기</Button>} /> : null}
        {[...session.turns].reverse().map(turn => <ResultTurn key={turn.id} turn={turn} onRevise={revise} onCopy={copy} copyStatus={copyStatus} />)}
      </div>
    </div>
    <p className={styles.sessionNote}>범위를 바꾸면 해당 범위의 입력과 대화를 엽니다. 새로고침·탭 종료 시 자유 요청의 미전송 원문과 답변은 사라집니다.</p>
    {rosterOpen ? <Drawer title="담당 변경" subtitle="필요한 산출물에 맞춰 고르세요." onClose={() => setRosterOpen(false)} width="min(440px, 94vw)">
      <div className={styles.roster}>{OFFICE_ROSTER.map(person => <button type="button" key={person.id} className={`hub-row ${styles.member}`} aria-pressed={person.id === ownerId} onClick={() => selectOwner(person.id)}>
        <span><strong>{person.name} <small>{person.role}</small></strong><span className={styles.memberPitch}>{person.pitch}</span></span>
      </button>)}<p className={styles.note}>Guru는 영업 코칭, 기존 Council은 브랜드 자문에서 이어갑니다. Legend 관점은 Office에 아직 연결되지 않았습니다.</p></div>
    </Drawer> : null}
  </section>;
}
